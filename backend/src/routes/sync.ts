import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin', 'scanner']));

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { eventId, lastTicketVersion, lastScanCursor, localScans } = req.body as {
    eventId: string;
    lastTicketVersion: number;
    lastScanCursor: string;
    localScans: {
      id: string;
      ticketId: string;
      scannedAt: string;
      deviceId: string;
    }[];
  };

  if (!eventId) {
    res.status(400).json({ error: 'eventId is required' });
    return;
  }

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: req.user!.tenantId },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const deviceId = localScans?.[0]?.deviceId ?? 'unknown';

  // Upsert all local scans — append-only, deduplicated by id
  if (Array.isArray(localScans) && localScans.length > 0) {
    await prisma.$transaction(
      localScans.map((s) =>
        prisma.scan.upsert({
          where: { id: s.id },
          create: {
            id: s.id,
            ticketId: s.ticketId,
            eventId,
            deviceId: s.deviceId,
            userId: req.user!.userId,
            scannedAt: new Date(s.scannedAt),
          },
          update: {},
        })
      )
    );
  }

  const cursorDate = lastScanCursor ? new Date(lastScanCursor) : new Date(0);

  const [ticketUpdates, scanUpdates] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        eventId,
        version: { gt: lastTicketVersion ?? 0 },
      },
    }),
    prisma.scan.findMany({
      where: {
        eventId,
        createdAt: { gt: cursorDate },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const newTicketVersion =
    ticketUpdates.length > 0
      ? Math.max(...ticketUpdates.map((t) => t.version))
      : lastTicketVersion ?? 0;

  const newScanCursor =
    scanUpdates.length > 0
      ? scanUpdates[scanUpdates.length - 1].createdAt.toISOString()
      : cursorDate.toISOString();

  // Update sync state for this device/event
  await prisma.syncState.upsert({
    where: { deviceId_eventId: { deviceId, eventId } },
    create: {
      deviceId,
      eventId,
      lastTicketVersion: newTicketVersion,
      lastScanCursor: new Date(newScanCursor),
    },
    update: {
      lastTicketVersion: newTicketVersion,
      lastScanCursor: new Date(newScanCursor),
    },
  });

  res.json({
    data: {
      ticketUpdates,
      scanUpdates,
      newTicketVersion,
      newScanCursor,
    },
  });
});

export default router;
