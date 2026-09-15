import {
  spendCredits,
  readIssuance,
  saveIssuance,
  requestHash,
  lockTenant,
} from "../billing/credits";
import { HttpError } from "../lib/errors";
import { Router, Request, Response } from "express";
import { generateCompactQRToken } from "../lib/qrToken";
import { resolveRlsContext } from "../lib/tenantContext";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { withRls } from "../prisma";

const router = Router();
const TICKETS_PAGE_SIZE_DEFAULT = 100;
const TICKETS_PAGE_SIZE_MAX = 100;

router.use(authMiddleware);

async function resolveTicketTypeForEvent(
  tenantPrisma: Parameters<Parameters<typeof withRls>[1]>[0],
  eventId: string,
  ticketTypeId?: string | null,
) {
  if (!ticketTypeId) return null;
  return tenantPrisma.ticketType.findFirst({
    where: {
      id: ticketTypeId,
      eventId,
    },
  });
}

// Both creation paths share one locked transaction and an idempotency receipt.
async function issue(req: Request, res: Response, bulk: boolean) {
  const eventId = String(req.params.id);
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  const key = req.get("Idempotency-Key") ?? "";
  const inputs = bulk
    ? Array.isArray(req.body.tickets)
      ? req.body.tickets
      : Array.isArray(req.body.names)
        ? req.body.names.map((name: string) => ({ name }))
        : []
    : [req.body];
  if (
    !inputs.length ||
    inputs.length > 10000 ||
    inputs.some(
      (item: any) =>
        !item ||
        (!item.guestId && (typeof item.name !== "string" || !item.name.trim())),
    )
  )
    throw new HttpError(400, "Provide 1–10000 valid guests");
  const hash = requestHash({ eventId, bulk, inputs });
  const result = await withRls(context, async (tx) => {
    const prior = await readIssuance(tx, context.tenantId, key, hash);
    if (prior) return prior.result;
    const event = await tx.event.findFirst({
      where: { id: eventId, isDeleted: false, archivedAt: null },
    });
    if (!event) throw new HttpError(404, "Active event not found");
    if (
      event.maxGuests !== null &&
      (await tx.ticket.count({ where: { eventId } })) + inputs.length >
        event.maxGuests
    )
      throw new HttpError(403, "Event capacity exceeded");
    await spendCredits(
      tx,
      context.tenantId,
      eventId,
      inputs.length,
      `issue:${key}`,
    );
    const version = (
      await tx.event.update({
        where: { id: eventId },
        data: { version: { increment: 1 } },
      })
    ).version;
    const created = [];
    for (const input of inputs) {
      const typeId =
        typeof input.ticketTypeId === "string" ? input.ticketTypeId.trim() : "";
      if (typeId && !(await resolveTicketTypeForEvent(tx, eventId, typeId)))
        throw new HttpError(400, "Invalid ticket type");
      let guest = input.guestId
        ? await tx.guest.findFirst({ where: { id: input.guestId } })
        : await tx.guest.findFirst({
            where: { name: { equals: input.name.trim(), mode: "insensitive" } },
          });
      if (!guest && input.guestId) throw new HttpError(404, "Guest not found");
      if (!guest)
        guest = await tx.guest.create({
          data: { tenantId: context.tenantId, name: input.name.trim() },
        });
      created.push(
        await tx.ticket.create({
          data: {
            tenantId: context.tenantId,
            eventId,
            version,
            guestId: guest.id,
            name: guest.name,
            ...(typeId ? { ticketTypeId: typeId } : {}),
          },
        }),
      );
    }
    const response = bulk ? created : created[0];
    await saveIssuance(tx, context.tenantId, key, hash, response);
    return response;
  });
  res.status(201).json({ data: result });
}
router.post(
  "/events/:id/tickets",
  requireRole(["owner", "admin"]),
  (req, res) => issue(req, res, false),
);
router.post(
  "/events/:id/tickets/bulk",
  requireRole(["owner", "admin"]),
  (req, res) => issue(req, res, true),
);

// List tickets with scan count - owner/admin/scanner
router.get(
  "/events/:id/tickets",
  requireRole(["owner", "admin", "scanner"]),
  async (req: Request, res: Response): Promise<void> => {
    const eventId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!eventId) {
      res.status(400).json({ error: "Invalid event id" });
      return;
    }

    if (req.user?.isTemporaryScanner === true) {
      res
        .status(403)
        .json({
          error: "Forbidden: temporary scanner access is limited to scanning",
        });
      return;
    }

    const pageSizeRaw = Array.isArray(req.query.pageSize)
      ? req.query.pageSize[0]
      : req.query.pageSize;
    const parsedPageSize =
      typeof pageSizeRaw === "string"
        ? Number.parseInt(pageSizeRaw, 10)
        : Number.NaN;
    const pageSize = Number.isFinite(parsedPageSize)
      ? Math.min(Math.max(parsedPageSize, 1), TICKETS_PAGE_SIZE_MAX)
      : TICKETS_PAGE_SIZE_DEFAULT;

    const cursorCreatedAtRaw = Array.isArray(req.query.cursorCreatedAt)
      ? req.query.cursorCreatedAt[0]
      : req.query.cursorCreatedAt;
    const cursorIdRaw = Array.isArray(req.query.cursorId)
      ? req.query.cursorId[0]
      : req.query.cursorId;
    const cursorCreatedAt =
      typeof cursorCreatedAtRaw === "string" && cursorCreatedAtRaw.length > 0
        ? new Date(cursorCreatedAtRaw)
        : null;
    if (cursorCreatedAt && Number.isNaN(cursorCreatedAt.getTime())) {
      res
        .status(400)
        .json({ error: "cursorCreatedAt must be a valid ISO datetime string" });
      return;
    }
    const cursorId = typeof cursorIdRaw === "string" ? cursorIdRaw : "";

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const ticketsData = await withRls(context, async (tenantPrisma) => {
      const event = await tenantPrisma.event.findFirst({
        where: { id: eventId },
      });
      if (!event) {
        res.status(404).json({ error: "Event not found" });
        return null;
      }

      return tenantPrisma.ticket.findMany({
        where: {
          eventId,
          ...(cursorCreatedAt
            ? {
                OR: [
                  { createdAt: { gt: cursorCreatedAt } },
                  {
                    AND: [
                      { createdAt: cursorCreatedAt },
                      { id: { gt: cursorId } },
                    ],
                  },
                ],
              }
            : {}),
        },
        include: {
          ticketType: true,
          _count: { select: { scans: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: pageSize + 1,
      });
    });

    if (!ticketsData) {
      return;
    }

    const hasMore = ticketsData.length > pageSize;
    const pageRows = hasMore ? ticketsData.slice(0, pageSize) : ticketsData;
    const result = pageRows.map((t) => ({
      id: t.id,
      eventId: t.eventId,
      guestId: t.guestId,
      ticketTypeId: t.ticketTypeId,
      ticketType: t.ticketType
        ? {
            id: t.ticketType.id,
            name: t.ticketType.name,
            price: Number(t.ticketType.price),
          }
        : null,
      name: t.name,
      status: t.status,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      scanCount: t._count.scans,
    }));
    const lastRow = pageRows.length > 0 ? pageRows[pageRows.length - 1] : null;

    res.json({
      data: result,
      pagination: {
        pageSize,
        hasMore,
        nextCursorCreatedAt: lastRow ? lastRow.createdAt.toISOString() : null,
        nextCursorId: lastRow ? lastRow.id : null,
      },
    });
  },
);

router.patch(
  "/tickets/:id",
  requireRole(["owner", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const ticketId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, "ticketTypeId")) {
      res.status(400).json({ error: "ticketTypeId is required" });
      return;
    }

    const rawTicketTypeId = req.body.ticketTypeId;
    const normalizedTicketTypeId =
      typeof rawTicketTypeId === "string" ? rawTicketTypeId.trim() : "";
    if (
      rawTicketTypeId !== null &&
      rawTicketTypeId !== undefined &&
      typeof rawTicketTypeId !== "string"
    ) {
      res.status(400).json({ error: "ticketTypeId must be a string or null" });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const updated = await withRls(context, async (tenantPrisma) => {
      await lockTenant(tenantPrisma, context.tenantId);
      const ticket = await tenantPrisma.ticket.findFirst({
        where: { id: ticketId },
      });
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return null;
      }

      if (normalizedTicketTypeId) {
        const ticketType = await resolveTicketTypeForEvent(
          tenantPrisma,
          ticket.eventId,
          normalizedTicketTypeId,
        );
        if (!ticketType) {
          res
            .status(400)
            .json({ error: "ticketTypeId does not belong to this event" });
          return null;
        }
      }

      return tenantPrisma.ticket.update({
        where: { id: ticket.id },
        data: {
          ticketTypeId: normalizedTicketTypeId || null,
          version: (
            await tenantPrisma.event.update({
              where: { id: ticket.eventId },
              data: { version: { increment: 1 } },
            })
          ).version,
        },
        include: { ticketType: true },
      });
    });

    if (!updated) {
      return;
    }

    res.json({
      data: {
        id: updated.id,
        eventId: updated.eventId,
        guestId: updated.guestId,
        ticketTypeId: updated.ticketTypeId,
        ticketType: updated.ticketType
          ? {
              id: updated.ticketType.id,
              name: updated.ticketType.name,
              price: Number(updated.ticketType.price),
            }
          : null,
        name: updated.name,
        status: updated.status,
        version: updated.version,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  },
);

// Scan history for a ticket - owner/admin/scanner
router.get(
  "/tickets/:id/scans",
  requireRole(["owner", "admin", "scanner"]),
  async (req: Request, res: Response): Promise<void> => {
    const ticketId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    if (req.user?.isTemporaryScanner === true) {
      res
        .status(403)
        .json({
          error: "Forbidden: temporary scanner access is limited to scanning",
        });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const scans = await withRls(context, async (tenantPrisma) => {
      const ticket = await tenantPrisma.ticket.findFirst({
        where: { id: ticketId },
        include: { event: true },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return null;
      }

      return tenantPrisma.scan.findMany({
        where: { ticketId: ticket.id, eventId: ticket.eventId },
        orderBy: { scannedAt: "desc" },
        include: { user: { select: { id: true, email: true } } },
      });
    });

    if (!scans) {
      return;
    }

    res.json({
      data: scans.map((scan) => ({
        id: scan.id,
        scannedAt: scan.scannedAt,
        deviceId: scan.deviceId,
        userId: scan.userId,
        scannedBy: scan.user?.email ?? "Unknown scanner",
      })),
    });
  },
);

// Cancel a ticket - owner/admin only
router.post(
  "/tickets/:id/cancel",
  requireRole(["owner", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const ticketId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const updated = await withRls(context, async (tenantPrisma) => {
      await lockTenant(tenantPrisma, context.tenantId);
      const ticket = await tenantPrisma.ticket.findFirst({
        where: { id: ticketId },
        include: { event: true },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return null;
      }

      if (ticket.status === "cancelled") {
        res.status(400).json({ error: "Ticket is already cancelled" });
        return null;
      }

      return tenantPrisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: "cancelled",
          version: (
            await tenantPrisma.event.update({
              where: { id: ticket.eventId },
              data: { version: { increment: 1 } },
            })
          ).version,
        },
      });
    });

    if (!updated) {
      return;
    }

    res.json({ data: updated });
  },
);

// Restore a cancelled ticket - owner/admin only
router.post(
  "/tickets/:id/restore",
  requireRole(["owner", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const ticketId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const updated = await withRls(context, async (tenantPrisma) => {
      await lockTenant(tenantPrisma, context.tenantId);
      const ticket = await tenantPrisma.ticket.findFirst({
        where: { id: ticketId },
        include: { event: true },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return null;
      }

      if (ticket.status !== "cancelled") {
        res.status(400).json({ error: "Ticket is already active" });
        return null;
      }

      return tenantPrisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: "active",
          version: (
            await tenantPrisma.event.update({
              where: { id: ticket.eventId },
              data: { version: { increment: 1 } },
            })
          ).version,
        },
      });
    });

    if (!updated) {
      return;
    }

    res.json({ data: updated });
  },
);

// QR token for a ticket - owner/admin only
router.get(
  "/tickets/:id/qr",
  requireRole(["owner", "admin"]),
  async (req: Request, res: Response): Promise<void> => {
    const ticketId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "Invalid ticket id" });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });

    const ticket = await withRls(context, async (tenantPrisma) => {
      return tenantPrisma.ticket.findFirst({
        where: { id: ticketId },
        include: { event: true },
      });
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (ticket.status === "cancelled") {
      res.status(422).json({ error: "Ticket is cancelled" });
      return;
    }

    const secret = process.env.QR_SECRET;
    if (!secret) {
      res
        .status(500)
        .json({ error: "Server misconfiguration: QR_SECRET not set" });
      return;
    }

    // Compact 40-byte binary token: 16 bytes tid + 16 bytes eid + 8-byte HMAC-SHA256 truncated.
    // base64url-encoded → 54 chars (no padding). ~3x smaller than a JWT.
    const qrToken = generateCompactQRToken(ticket.id, ticket.eventId, secret);

    res.json({ data: { qrToken } });
  },
);

export default router;
