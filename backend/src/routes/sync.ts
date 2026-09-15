import { HttpError } from "../lib/errors";
import { createHash } from "crypto";
import { generateCompactQRToken } from "../lib/qrToken";
import { admitScan } from "../lib/scanAdmission";
import { lockTenant } from "../billing/credits";
import { createOfflinePermit } from "../lib/offlinePermit";
import { Router, Request, Response } from "express";
import { resolveRlsContext } from "../lib/tenantContext";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { withRls } from "../prisma";

const router = Router();
const SYNC_PAGE_SIZE = 100;

router.use(authMiddleware);
router.use(requireRole(["owner", "admin", "scanner"]));

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const {
    eventId,
    lastTicketVersion,
    lastTicketIdCursor,
    lastScanCursor,
    lastScanIdCursor,
    localScans,
    deviceId,
  } = req.body as {
    eventId: string;
    lastTicketVersion: number;
    lastTicketIdCursor?: string;
    lastScanCursor: string;
    lastScanIdCursor?: string;
    deviceId?: string;
    localScans: {
      id: string;
      qrToken?: string;
      confirmed?: boolean;
      ticketId: string;
      scannedAt: string;
      deviceId: string;
    }[];
  };

  if (!eventId) {
    res.status(400).json({ error: "eventId is required" });
    return;
  }

  if (req.user?.isTemporaryScanner === true && req.user.eventId !== eventId) {
    res
      .status(403)
      .json({ error: "Forbidden: scanner access is limited to one event" });
    return;
  }

  const normalizedLocalScans = Array.isArray(localScans) ? localScans : [];
  const explicitDeviceId = typeof deviceId === "string" ? deviceId.trim() : "";
  const fallbackDeviceId = normalizedLocalScans
    .map((s) => (typeof s.deviceId === "string" ? s.deviceId.trim() : ""))
    .find((id) => id.length > 0);
  const effectiveDeviceId = explicitDeviceId || fallbackDeviceId;

  if (!effectiveDeviceId) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  const cursorDate = lastScanCursor ? new Date(lastScanCursor) : new Date(0);
  if (Number.isNaN(cursorDate.getTime())) {
    res
      .status(400)
      .json({ error: "lastScanCursor must be a valid ISO datetime string" });
    return;
  }

  const normalizedLastTicketVersion = Number.isFinite(lastTicketVersion)
    ? lastTicketVersion
    : 0;
  const normalizedLastTicketIdCursor =
    typeof lastTicketIdCursor === "string" ? lastTicketIdCursor : "";
  const normalizedLastScanIdCursor =
    typeof lastScanIdCursor === "string" ? lastScanIdCursor : "";

  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });

  const result = await withRls(context, async (tenantPrisma) => {
    await lockTenant(tenantPrisma, context.tenantId);
    if (
      req.user!.isTemporaryScanner &&
      !(await tenantPrisma.temporaryScanner.findFirst({
        where: {
          id: req.user!.tempScannerId,
          userId: req.user!.userId,
          eventId,
          isActive: true,
        },
      }))
    )
      throw new HttpError(403, "Scanner access was revoked");
    const event = await tenantPrisma.event.findFirst({
      where: { id: eventId },
    });
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return null;
    }

    if (normalizedLocalScans.length > 150) {
      res.status(400).json({ error: "Maximum 150 attempts per sync" });
      return null;
    }
    const acknowledgments = [];
    for (const scan of normalizedLocalScans) {
      acknowledgments.push(
        await admitScan(tenantPrisma, context.tenantId, req.user!.userId, {
          ...scan,
          eventId,
          deviceId: effectiveDeviceId,
        }),
      );
    }

    const [ticketRows, scanRows] = await Promise.all([
      tenantPrisma.ticket.findMany({
        where: {
          eventId,
          OR: [
            { version: { gt: normalizedLastTicketVersion } },
            {
              AND: [
                { version: normalizedLastTicketVersion },
                { id: { gt: normalizedLastTicketIdCursor } },
              ],
            },
          ],
        },
        orderBy: [{ version: "asc" }, { id: "asc" }],
        take: SYNC_PAGE_SIZE + 1,
      }),
      tenantPrisma.scan.findMany({
        where: {
          eventId,
          OR: [
            { createdAt: { gt: cursorDate } },
            {
              AND: [
                { createdAt: cursorDate },
                { id: { gt: normalizedLastScanIdCursor } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: SYNC_PAGE_SIZE + 1,
      }),
    ]);

    const hasMoreTicketUpdates = ticketRows.length > SYNC_PAGE_SIZE;
    const hasMoreScanUpdates = scanRows.length > SYNC_PAGE_SIZE;
    const ticketUpdates = hasMoreTicketUpdates
      ? ticketRows.slice(0, SYNC_PAGE_SIZE)
      : ticketRows;
    const scanUpdates = hasMoreScanUpdates
      ? scanRows.slice(0, SYNC_PAGE_SIZE)
      : scanRows;

    const lastTicketUpdate =
      ticketUpdates.length > 0 ? ticketUpdates[ticketUpdates.length - 1] : null;
    const lastScanUpdate =
      scanUpdates.length > 0 ? scanUpdates[scanUpdates.length - 1] : null;

    const newTicketVersion = lastTicketUpdate
      ? lastTicketUpdate.version
      : normalizedLastTicketVersion;
    const newTicketIdCursor = lastTicketUpdate
      ? lastTicketUpdate.id
      : normalizedLastTicketIdCursor;
    const newScanCursor =
      scanUpdates.length > 0
        ? scanUpdates[scanUpdates.length - 1].createdAt.toISOString()
        : cursorDate.toISOString();
    const newScanIdCursor = lastScanUpdate
      ? lastScanUpdate.id
      : normalizedLastScanIdCursor;

    await tenantPrisma.syncState.upsert({
      where: {
        tenantId_deviceId_eventId: {
          tenantId: context.tenantId,
          deviceId: effectiveDeviceId,
          eventId,
        },
      },
      create: {
        tenantId: context.tenantId,
        deviceId: effectiveDeviceId,
        eventId,
        lastTicketVersion: newTicketVersion,
        lastScanCursor: new Date(newScanCursor),
      },
      update: {
        lastTicketVersion: newTicketVersion,
        lastScanCursor: new Date(newScanCursor),
      },
    });

    return {
      ticketUpdates: ticketUpdates.map((ticket) => ({
        ...ticket,
        tokenFingerprint: createHash("sha256")
          .update(
            generateCompactQRToken(ticket.id, eventId, process.env.QR_SECRET!),
          )
          .digest("hex"),
      })),
      acknowledgments,
      offlinePermit: createOfflinePermit(
        context.tenantId,
        req.user!.userId,
        eventId,
        event.isDeleted || event.archivedAt ? new Date(0) : event.endsAt,
      ),
      scanUpdates,
      newTicketVersion,
      newTicketIdCursor,
      newScanCursor,
      newScanIdCursor,
      hasMoreTicketUpdates,
      hasMoreScanUpdates,
    };
  });

  if (!result) {
    return;
  }

  res.json({ data: result });
});

export default router;
