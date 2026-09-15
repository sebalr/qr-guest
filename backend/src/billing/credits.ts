import { createHash } from "crypto";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { HttpError } from "../lib/errors";

export async function lockTenant(tx: PrismaClient, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new HttpError(404, "Tenant not found");
  return tenant;
}
export async function spendCredits(
  tx: PrismaClient,
  tenantId: string,
  eventId: string,
  quantity: number,
  reference: string,
) {
  const tenant = await lockTenant(tx, tenantId);
  const event = await tx.event.findFirst({
    where: { id: eventId, tenantId, isDeleted: false, archivedAt: null },
  });
  if (!event) throw new HttpError(404, "Active event not found");
  const deficit = await tx.event.findFirst({
    where: { tenantId, paidCredits: { lt: 0 } },
  });
  if (deficit)
    throw new HttpError(
      402,
      "Payment reversal: contact support to settle the credit deficit",
    );
  const free = Math.min(tenant.freeRemaining, quantity);
  const paid = quantity - free;
  if (event.paidCredits < paid)
    throw new HttpError(
      402,
      "Insufficient QR credits. Purchase credits for this event.",
    );
  await tx.tenant.update({
    where: { id: tenantId },
    data: { freeRemaining: { decrement: free } },
  });
  await tx.event.update({
    where: { id: eventId },
    data: { paidCredits: { decrement: paid } },
  });
  await tx.creditLedger.create({
    data: {
      tenantId,
      eventId,
      kind: "issuance",
      freeDelta: -free,
      paidDelta: -paid,
      reference,
    },
  });
}
export function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function readIssuance(
  tx: PrismaClient,
  tenantId: string,
  key: string,
  hash: string,
) {
  if (!key || key.length > 128)
    throw new HttpError(
      400,
      "Idempotency-Key is required (maximum 128 characters)",
    );
  await lockTenant(tx, tenantId);
  const prior = await tx.issuanceRequest.findUnique({
    where: { tenantId_key: { tenantId, key } },
  });
  if (prior && prior.hash !== hash)
    throw new HttpError(
      409,
      "Idempotency key was already used for a different request",
    );
  return prior;
}
export async function saveIssuance(
  tx: PrismaClient,
  tenantId: string,
  key: string,
  hash: string,
  result: unknown,
) {
  await tx.issuanceRequest.create({
    data: {
      tenantId,
      key,
      hash,
      result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    },
  });
}
