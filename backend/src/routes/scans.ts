import { admitScan } from "../lib/scanAdmission";
import { HttpError } from "../lib/errors";
import { Router, Request, Response } from "express";
import { Prisma } from "../generated/prisma/client";
import { resolveRlsContext } from "../lib/tenantContext";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { withRls } from "../prisma";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(["owner", "admin", "scanner"]));

router.post(
  "/device-event-debug",
  async (req: Request, res: Response): Promise<void> => {
    const { eventId, deviceId, payload } = req.body as {
      eventId?: string;
      deviceId?: string;
      payload?: Record<string, unknown>;
    };

    const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
    const normalizedDeviceId =
      typeof deviceId === "string" ? deviceId.trim() : "";

    if (!normalizedEventId || !normalizedDeviceId) {
      res.status(400).json({ error: "eventId and deviceId are required" });
      return;
    }

    if (
      req.user?.isTemporaryScanner === true &&
      req.user.eventId !== normalizedEventId
    ) {
      res
        .status(403)
        .json({ error: "Forbidden: scanner access is limited to one event" });
      return;
    }

    const context = resolveRlsContext(req, {
      allowSuperAdminTenantOverride: true,
    });
    const rowId = crypto.randomUUID();
    // Only a small allowlist of diagnostic values is retained; never tokens or ticket payloads.
    const debugPayload = JSON.parse(
      JSON.stringify({
        pendingCount:
          typeof payload?.pendingCount === "number"
            ? payload.pendingCount
            : null,
        ticketCount:
          typeof payload?.ticketCount === "number" ? payload.ticketCount : null,
        online: payload?.online === true,
        lastSync:
          typeof payload?.lastSync === "string"
            ? payload.lastSync.slice(0, 100)
            : null,
      }),
    ) as Prisma.InputJsonValue;

    const created = await withRls(context, async (tenantPrisma) => {
      const event = await tenantPrisma.event.findFirst({
        where: { id: normalizedEventId },
        select: { id: true },
      });

      if (!event) {
        res.status(404).json({ error: "Event not found" });
        return null;
      }

      return tenantPrisma.deviceEventDebugData.create({
        data: {
          id: rowId,
          tenantId: context.tenantId,
          eventId: normalizedEventId,
          deviceId: normalizedDeviceId,
          userId: req.user!.userId,
          payload: debugPayload,
        },
        select: { createdAt: true },
      });
    });

    if (!created) {
      return;
    }

    res.status(201).json({
      data: {
        id: rowId,
        eventId: normalizedEventId,
        deviceId: normalizedDeviceId,
        createdAt: created.createdAt.toISOString(),
      },
    });
  },
);

router.post("/", async (req: Request, res: Response) => {
  const context = resolveRlsContext(req, {
    allowSuperAdminTenantOverride: true,
  });
  if (req.user?.isTemporaryScanner && req.user.eventId !== req.body.eventId)
    throw new HttpError(403, "Scanner is limited to this event");
  const attempt = await withRls(context, async (tx) => {
    if (
      req.user!.isTemporaryScanner &&
      !(await tx.temporaryScanner.findFirst({
        where: {
          id: req.user!.tempScannerId,
          userId: req.user!.userId,
          eventId: req.body.eventId,
          isActive: true,
        },
      }))
    )
      throw new HttpError(403, "Scanner access was revoked");
    return admitScan(tx, context.tenantId, req.user!.userId, req.body);
  });
  const status = ["accepted", "override"].includes(attempt.outcome)
    ? 201
    : attempt.outcome === "duplicate"
      ? 409
      : 422;
  res
    .status(status)
    .json({
      data: attempt,
      ...(status >= 400 ? { error: attempt.outcome } : {}),
    });
});
export default router;
