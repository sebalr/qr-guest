import prisma, { withRls } from "../prisma";
import { Prisma } from "../generated/prisma/client";
import { lockTenant } from "./credits";
import { providerFor, ProviderPayment } from "./providers";
import { HttpError } from "../lib/errors";

export async function applyPayment(
  tenantId: string,
  incoming: ProviderPayment,
) {
  return withRls({ tenantId, bypassRls: false }, async (tx) => {
    await lockTenant(tx, tenantId);
    const order = await tx.paymentOrder.findFirst({
      where: { id: incoming.reference, tenantId },
    });
    if (!order) throw new HttpError(404, "Order not found");
    if (
      incoming.merchant !==
        providerFor(order.country, order.provider).merchantId() ||
      incoming.currency !== order.currency ||
      !new Prisma.Decimal(incoming.amount).eq(order.amount)
    )
      throw new HttpError(409, "Payment does not match this order");
    if (order.paymentId && order.paymentId !== incoming.id) return order; // A second payment never issues additional credits.

    if (order.status === "reversed") return order; // Full reversals are terminal even if older notifications arrive later.
    const refund = new Prisma.Decimal(incoming.refunded);
    if (!refund.isFinite() || refund.lt(0) || refund.gt(order.amount))
      throw new HttpError(409, "Invalid refund amount");
    let target = order.credited;
    let status = incoming.status;
    if (status === "approved")
      target =
        order.quantity -
        refund.div(order.amount).mul(order.quantity).ceil().toNumber();
    else if (status === "refunded" || status === "charged_back") {
      target = 0;
      status = "reversed";
    } else if (order.credited > 0) return order; // Ignore out-of-order pending/rejected states.
    if (refund.gt(0)) {
      target = Math.min(target, order.credited || target);
      status = target === 0 ? "reversed" : "partially_refunded";
    }
    if (
      ["reversed", "partially_refunded"].includes(order.status) &&
      target > order.credited
    )
      return order; // Terminal for issuance; subsequent reconciliation may revoke remaining credits below.
    const delta = target - order.credited;
    if (delta) {
      await tx.event.update({
        where: { id: order.eventId },
        data: { paidCredits: { increment: delta } },
      });
      await tx.creditLedger.create({
        data: {
          tenantId,
          eventId: order.eventId,
          kind: delta > 0 ? "purchase" : "reversal",
          paidDelta: delta,
          reference: `payment:${order.id}:${target}`,
        },
      });
    }
    if (target > 0 && incoming.status === "approved")
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: "personal" },
      });
    return tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        paymentId: ["approved", "refunded", "charged_back"].includes(
          incoming.status,
        )
          ? incoming.id
          : order.paymentId,
        credited: target,
        status,
      },
    });
  });
}
export async function reconcileOrder(tenantId: string, orderId: string) {
  const order = await withRls({ tenantId, bypassRls: false }, (tx) =>
    tx.paymentOrder.findFirst({ where: { id: orderId, tenantId } }),
  );
  if (!order || order.status === "quoted") return order;
  const provider = providerFor(order.country, order.provider);
  const payments = order.paymentId
    ? [await provider.getPayment(order.paymentId)]
    : await provider.findPayments(order.id);
  for (const p of payments)
    if (p.reference === order.id) await applyPayment(tenantId, p);
  return withRls({ tenantId, bypassRls: false }, (tx) =>
    tx.paymentOrder.findUnique({ where: { id: orderId } }),
  );
}
let running = false;
export function startPaymentReconciliation() {
  if (!process.env.MP_ACCESS_TOKEN) return;
  const timer = setInterval(
    async () => {
      if (running) return;
      running = true;
      try {
        const tenants = await prisma.tenant.findMany({ select: { id: true } });
        for (const tenant of tenants) {
          const orders = await withRls(
            { tenantId: tenant.id, bypassRls: false },
            (tx) =>
              tx.paymentOrder.findMany({
                where: { status: { notIn: ["quoted", "reversed"] } },
                orderBy: { createdAt: "asc" },
              }),
          );
          for (const order of orders) {
            try {
              await reconcileOrder(tenant.id, order.id);
            } catch {
              console.warn("Payment reconciliation failed", order.id);
            }
          }
        }
      } catch {
        console.warn("Payment reconciliation cycle failed");
      } finally {
        running = false;
      }
    },
    Math.max(10000, Number(process.env.PAYMENT_RECONCILE_MS) || 60000),
  );
  timer.unref();
}
