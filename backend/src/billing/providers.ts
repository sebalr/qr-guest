import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";
import type { PaymentOrder } from "../generated/prisma/client";
import { HttpError } from "../lib/errors";
export interface ProviderPayment {
  id: string;
  reference: string;
  merchant: string;
  status: string;
  amount: string;
  refunded: string;
  currency: string;
}
export interface PaymentProvider {
  id: string;
  merchantId(): string | undefined;
  createCheckout(order: PaymentOrder): Promise<{ id: string; url: string }>;
  verifyNotification(req: Request): string;
  getPayment(id: string): Promise<ProviderPayment>;
  findPayments(reference: string): Promise<ProviderPayment[]>;
}
async function mp(path: string, init: RequestInit = {}) {
  if (!process.env.MP_ACCESS_TOKEN)
    throw new HttpError(503, "Payments are not configured");
  const result = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!result.ok)
    throw new HttpError(502, "Payment provider could not complete the request");
  return result.json() as Promise<any>;
}
function payment(p: any): ProviderPayment {
  return {
    id: String(p.id),
    reference: p.external_reference,
    merchant: String(p.collector_id),
    status: p.status,
    amount: String(p.transaction_amount),
    refunded: String(p.transaction_amount_refunded ?? 0),
    currency: p.currency_id,
  };
}
export function verifyMPSignature(
  signature: string,
  requestId: string,
  dataId: string,
  secret: string,
) {
  const parts = Object.fromEntries(
    signature.split(",").map((v) => v.trim().split("=")),
  );
  if (
    !parts.ts ||
    !/^\d+$/.test(parts.ts) ||
    !/^[a-f0-9]{64}$/i.test(parts.v1 ?? "") ||
    !requestId ||
    !dataId
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(
      `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`,
    )
    .digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, "hex"));
}
export const mercadoPago: PaymentProvider = {
  id: "mercadopago",
  merchantId: () => process.env.MP_MERCHANT_ID,
  async createCheckout(order) {
    const frontend = process.env.FRONTEND_URL;
    const webhook = process.env.MP_WEBHOOK_URL;
    if (
      !frontend ||
      !webhook ||
      !process.env.MP_MERCHANT_ID ||
      !process.env.MP_WEBHOOK_SECRET
    )
      throw new HttpError(503, "Payment configuration is incomplete");
    const back = `${frontend.replace(/\/$/, "")}/events/${order.eventId}?order=${order.id}`;
    // Recover an upstream preference if its response was lost before our DB commit.
    const search = await mp(
      `/checkout/preferences/search?external_reference=${encodeURIComponent(order.id)}`,
    );
    const previous = (search.elements ?? []).find(
      (p: { external_reference?: string }) => p.external_reference === order.id,
    );
    if (previous?.id) {
      const recovered = await mp(
        `/checkout/preferences/${encodeURIComponent(previous.id)}`,
      );
      const url =
        process.env.MP_SANDBOX === "true"
          ? recovered.sandbox_init_point
          : recovered.init_point;
      if (recovered.external_reference === order.id && url)
        return { id: String(recovered.id), url };
      throw new HttpError(502, "Could not recover checkout. Please retry.");
    }
    const result = await mp("/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": order.id },
      body: JSON.stringify({
        external_reference: order.id,
        items: [
          {
            id: order.id,
            title: `Tiqra — ${order.quantity} QR`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: Number(order.amount),
          },
        ],
        back_urls: { success: back, failure: back, pending: back },
        notification_url: webhook,
        expires: true,
        expiration_date_to: order.expiresAt.toISOString(),
      }),
    });
    const url =
      process.env.MP_SANDBOX === "true"
        ? result.sandbox_init_point
        : result.init_point;
    if (!url || !result.id)
      throw new HttpError(502, "Invalid checkout response");
    return { id: String(result.id), url };
  },
  verifyNotification(req) {
    const id =
      typeof req.query["data.id"] === "string" ? req.query["data.id"] : "";
    if (
      !process.env.MP_WEBHOOK_SECRET ||
      !verifyMPSignature(
        req.get("x-signature") ?? "",
        req.get("x-request-id") ?? "",
        id,
        process.env.MP_WEBHOOK_SECRET,
      )
    )
      throw new HttpError(401, "Invalid payment notification signature");
    return id;
  },
  async getPayment(id) {
    return payment(await mp(`/v1/payments/${encodeURIComponent(id)}`));
  },
  async findPayments(reference) {
    const result = await mp(
      `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`,
    );
    return (result.results ?? []).map(payment);
  },
};
export function providers(country = "AR") {
  return country === "AR" ? [mercadoPago] : [];
}
export function providerFor(country: string, id: string) {
  const provider = providers(country).find((p) => p.id === id);
  if (!provider)
    throw new HttpError(400, "Payment method unavailable for this country");
  return provider;
}
