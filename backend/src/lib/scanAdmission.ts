import type { PrismaClient } from "../generated/prisma/client";
import { verifyCompactQRToken } from "./qrToken";
import { HttpError } from "./errors";
import { lockTenant } from "../billing/credits";
export interface AttemptInput {
  id: string;
  ticketId: string;
  eventId: string;
  deviceId: string;
  scannedAt: string;
  qrToken?: string;
  confirmed?: boolean;
}
export async function admitScan(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  input: AttemptInput,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.id ?? "",
    ) ||
    !input.deviceId ||
    typeof input.deviceId !== "string" ||
    !Number.isFinite(new Date(input.scannedAt).getTime())
  )
    throw new HttpError(400, "Invalid scan attempt");
  await lockTenant(tx, tenantId);
  const previous = await tx.scanAttempt.findFirst({ where: { id: input.id } });
  if (previous) {
    if (
      previous.eventId !== input.eventId ||
      previous.ticketId !== input.ticketId ||
      previous.deviceId !== input.deviceId ||
      previous.userId !== userId ||
      previous.confirmed !== (input.confirmed === true)
    )
      throw new HttpError(409, "Scan attempt ID already used");
    return previous;
  }
  const ticket = await tx.ticket.findFirst({
    where: { id: input.ticketId, eventId: input.eventId },
    include: { event: true },
  });
  if (!ticket) throw new HttpError(404, "Ticket not found in this event");
  let outcome = "accepted";
  if (
    !input.qrToken ||
    !process.env.QR_SECRET ||
    !verifyCompactQRToken(
      input.qrToken,
      input.ticketId,
      input.eventId,
      process.env.QR_SECRET,
    )
  )
    outcome = "invalid";
  else if (
    ticket.status !== "active" ||
    ticket.event.isDeleted ||
    ticket.event.archivedAt
  )
    outcome = "cancelled";
  else {
    const count = await tx.scan.count({
      where: { ticketId: input.ticketId, eventId: input.eventId },
    });
    if (count >= 2) outcome = "limit";
    else if (count > 0 && input.confirmed !== true) outcome = "duplicate";
    else if (count > 0) outcome = "override";
  }
  const attempt = await tx.scanAttempt.create({
    data: {
      id: input.id,
      tenantId,
      eventId: input.eventId,
      ticketId: input.ticketId,
      deviceId: input.deviceId,
      userId,
      scannedAt: new Date(input.scannedAt),
      confirmed: input.confirmed === true,
      outcome,
    },
  });
  if (outcome === "accepted" || outcome === "override") {
    const last = await tx.scan.findFirst({
      where: { eventId: input.eventId },
      orderBy: { createdAt: "desc" },
    });
    const createdAt = new Date(
      Math.max(Date.now(), (last?.createdAt.getTime() ?? 0) + 1),
    );
    await tx.scan.create({
      data: {
        id: input.id,
        tenantId,
        eventId: input.eventId,
        ticketId: input.ticketId,
        deviceId: input.deviceId,
        userId,
        scannedAt: new Date(input.scannedAt),
        createdAt,
        dedupeKey:
          outcome === "accepted" ? `${input.eventId}:${input.ticketId}` : null,
      },
    });
  }
  return attempt;
}
