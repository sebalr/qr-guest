import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import prisma from '../prisma';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin']));

router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
  const eventId = req.params.id;

  const event = await prisma.event.findFirst({
    where: { id: eventId, tenantId: req.user!.tenantId },
  });
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return;
  }

  const [totalGuests, totalScans, uniqueTicketsResult, ticketsWithScans, scansByHourRaw, topGuestsRaw] = await Promise.all([
    prisma.ticket.count({ where: { eventId } }),
    prisma.scan.count({ where: { eventId } }),
    prisma.scan.groupBy({
      by: ['ticketId'],
      where: { eventId },
    }),
    prisma.ticket.findMany({
      where: { eventId },
      include: { _count: { select: { scans: true } } },
    }),
    // Scans grouped by hour (last 48 hours).
    // prisma.$queryRaw with tagged template literals uses prepared statements;
    // ${eventId} is a bound parameter, not raw string interpolation.
    prisma.$queryRaw<{ hour: string; count: bigint }[]>`
      SELECT date_trunc('hour', "scanned_at") AS hour, COUNT(*) AS count
      FROM scans
      WHERE event_id = ${eventId}
        AND scanned_at >= NOW() - INTERVAL '48 hours'
      GROUP BY hour
      ORDER BY hour ASC
    `,
    // Top 10 guests by scan count.
    prisma.$queryRaw<{ ticket_id: string; name: string; scan_count: bigint }[]>`
      SELECT t.id AS ticket_id, t.name, COUNT(s.id) AS scan_count
      FROM tickets t
      LEFT JOIN scans s ON s.ticket_id = t.id AND s.event_id = ${eventId}
      WHERE t.event_id = ${eventId}
      GROUP BY t.id, t.name
      ORDER BY scan_count DESC
      LIMIT 10
    `,
  ]);

  const uniqueTickets = uniqueTicketsResult.length;
  const duplicates = totalScans - uniqueTickets;
  const scannedGuests = ticketsWithScans.filter(t => t._count.scans > 0).length;
  const notScannedGuests = totalGuests - scannedGuests;

  const scansByHour = scansByHourRaw.map(row => ({
    hour: row.hour,
    count: Number(row.count),
  }));

  const topGuests = topGuestsRaw.map(row => ({
    ticketId: row.ticket_id,
    name: row.name,
    scanCount: Number(row.scan_count),
  }));

  res.json({
    data: {
      totalGuests,
      scannedGuests,
      notScannedGuests,
      totalScans,
      uniqueTickets,
      duplicates,
      scansByHour,
      topGuests,
    },
  });
});

export { router as statsRouter };
export default router;
