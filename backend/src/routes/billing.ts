import { QR_UNIT_USD } from "../billing/pricing";
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { requireRole, requireSuperAdmin } from "../middleware/roles";
import prisma, { withRls } from "../prisma";
import { resolveRlsContext } from "../lib/tenantContext";
import { HttpError } from "../lib/errors";
import { getRate, quoteAmount } from "../billing/rates";
import { mercadoPago, providerFor, providers } from "../billing/providers";
import { applyPayment } from "../billing/payments";
import { lockTenant } from "../billing/credits";
const router = Router();
router.post("/webhooks/mercadopago", async (req, res) => {
  const id = mercadoPago.verifyNotification(req);
  const payment = await mercadoPago.getPayment(id);
  // The reference comes only from the authenticated provider lookup, never from the request body.
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    const found = await withRls(
      { tenantId: tenant.id, bypassRls: false },
      (tx) => tx.paymentOrder.findUnique({ where: { id: payment.reference } }),
    );
    if (found) {
      await applyPayment(tenant.id, payment);
      break;
    }
  }
  res.sendStatus(200);
});
// Public estimate input only: no order, customer data, or payment is created.
router.get("/pricing", async (_req, res) => {
  const rate = await getRate();
  res.set("Cache-Control", "public, max-age=60");
  res.json({ data: { unitUsd: QR_UNIT_USD, freeAllowance: 50, rate: rate.rate.toString(), sourceAt: rate.sourceAt, fetchedAt: rate.fetchedAt } });
});
router.use(authMiddleware, requireRole(["owner", "admin"]));
router.get("/methods", (req, res) =>
  res.json({
    data: providers(String(req.query.country || "AR")).map((p) => ({
      id: p.id,
      name: "Mercado Pago",
    })),
  }),
);
router.get("/summary", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const data = await withRls(context, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: context.tenantId },
    });
    const eventId = String(req.query.eventId || "");
    const event = eventId
      ? await tx.event.findFirst({ where: { id: eventId } })
      : null;
    if (eventId && !event) throw new HttpError(404, "Event not found");
    return {
      plan: tenant.plan,
      freeRemaining: tenant.freeRemaining,
      paidRemaining: event?.paidCredits ?? 0,
      available: tenant.freeRemaining + (event?.paidCredits ?? 0),
      issued: event ? await tx.ticket.count({ where: { eventId } }) : 0,
      eventsCreated: tenant.eventsCreated,
    };
  });
  res.json({ data });
});
router.post("/quotes", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const country = req.body.country ?? "AR";
  const provider = providerFor(country, req.body.provider ?? "mercadopago");
  const rate = await getRate();
  const amount = quoteAmount(req.body.quantity, rate.rate);
  const data = await withRls(context, async (tx) => {
    const event = await tx.event.findFirst({
      where: { id: req.body.eventId, isDeleted: false, archivedAt: null },
    });
    if (!event) throw new HttpError(404, "Active event not found");
    return tx.paymentOrder.create({
      data: {
        tenantId: context.tenantId,
        eventId: event.id,
        quantity: req.body.quantity,
        provider: provider.id,
        country,
        amount,
        rate: rate.rate,
        rateAt: rate.sourceAt,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
  });
  res.json({ data });
});
router.post("/orders/:id/checkout", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const data = await withRls(context, async (tx) => {
    await lockTenant(tx, context.tenantId);
    const order = await tx.paymentOrder.findFirst({
      where: { id: String(req.params.id) },
    });
    if (!order) throw new HttpError(404, "Order not found");
    if (order.checkoutUrl) return order;
    if (order.expiresAt.getTime() <= Date.now())
      throw new HttpError(409, "Quote expired. Request a new quote.");
    const checkout = await providerFor(
      order.country,
      order.provider,
    ).createCheckout(order);
    return tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        checkoutUrl: checkout.url,
        preferenceId: checkout.id,
        status: "pending",
      },
    });
  });
  res.json({ data });
});
router.get("/orders/:id", async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const order = await withRls(context, (tx) =>
    tx.paymentOrder.findFirst({ where: { id: String(req.params.id) } }),
  );
  if (!order) throw new HttpError(404, "Order not found");
  res.json({ data: order });
});
router.post("/contact", async (req, res) => {
  const context = resolveRlsContext(req);
  const message =
    typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 5000)
    throw new HttpError(400, "Message must contain 1–5000 characters");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.userId },
  });
  const data = await withRls(context, (tx) =>
    tx.contactRequest.create({
      data: { tenantId: context.tenantId, email: user.email, message },
    }),
  );
  res.status(201).json({ data });
});
router.get("/contacts", requireSuperAdmin, async (req, res) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  res.json({
    data: await withRls(context, (tx) =>
      tx.contactRequest.findMany({ orderBy: { createdAt: "desc" } }),
    ),
  });
});
router.patch("/contacts/:id", requireSuperAdmin, async (req, res) => {
  if (!["new", "contacted", "closed"].includes(req.body.status))
    throw new HttpError(400, "Invalid status");
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  res.json({
    data: await withRls(context, (tx) =>
      tx.contactRequest.update({
        where: { id: String(req.params.id) },
        data: { status: req.body.status },
      }),
    ),
  });
});
export default router;
