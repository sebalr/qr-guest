import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import prisma from '../prisma';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin']));

router.get('/:id/device-debug-data', async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
		select: { id: true },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const rows = await prisma.$queryRaw<
		{
			id: string;
			event_id: string;
			device_id: string;
			user_id: string;
			uploader_email: string;
			payload_size_bytes: number;
			created_at: Date;
		}[]
	>`
		SELECT d.id,
		       d.event_id,
		       d.device_id,
		       d.user_id,
		       COALESCE(u.email, '') AS uploader_email,
		       OCTET_LENGTH(d.payload::text) AS payload_size_bytes,
		       d.created_at
		FROM device_event_debug_data d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE d.event_id = ${eventId} AND d.tenant_id = ${req.user!.tenantId}
		ORDER BY d.created_at DESC
	`;

	res.json({
		data: rows.map(row => ({
			id: row.id,
			eventId: row.event_id,
			deviceId: row.device_id,
			userId: row.user_id,
			uploaderEmail: row.uploader_email,
			payloadSizeBytes: Number(row.payload_size_bytes),
			createdAt: row.created_at.toISOString(),
		})),
	});
});

router.get('/:id/device-debug-data/:dumpId', async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const dumpId = Array.isArray(req.params.dumpId) ? req.params.dumpId[0] : req.params.dumpId;
	if (!eventId || !dumpId) {
		res.status(400).json({ error: 'Invalid request' });
		return;
	}

	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
		select: { id: true },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const rows = await prisma.$queryRaw<
		{
			id: string;
			event_id: string;
			device_id: string;
			user_id: string;
			uploader_email: string;
			payload_size_bytes: number;
			payload: Record<string, unknown>;
			created_at: Date;
		}[]
	>`
		SELECT d.id,
		       d.event_id,
		       d.device_id,
		       d.user_id,
		       COALESCE(u.email, '') AS uploader_email,
		       OCTET_LENGTH(d.payload::text) AS payload_size_bytes,
		       d.payload,
		       d.created_at
		FROM device_event_debug_data d
		LEFT JOIN users u ON u.id = d.user_id
		WHERE d.id = ${dumpId} AND d.event_id = ${eventId} AND d.tenant_id = ${req.user!.tenantId}
		LIMIT 1
	`;

	if (rows.length === 0) {
		res.status(404).json({ error: 'Device debug payload not found' });
		return;
	}

	const row = rows[0];
	res.json({
		data: {
			id: row.id,
			eventId: row.event_id,
			deviceId: row.device_id,
			userId: row.user_id,
			uploaderEmail: row.uploader_email,
			payloadSizeBytes: Number(row.payload_size_bytes),
			payload: row.payload,
			createdAt: row.created_at.toISOString(),
		},
	});
});

router.get('/:id/stats', async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	// Validate interval param – only fixed allowed values, safe to branch on.
	const rawInterval = typeof req.query.interval === 'string' ? req.query.interval : '1h';
	const interval = (['1h', '30m', '5m'] as const).includes(rawInterval as '1h' | '30m' | '5m')
		? (rawInterval as '1h' | '30m' | '5m')
		: '1h';

	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	// Build the time-bucket expression for each interval.
	// All queries use tagged template literals (prepared statements); ${eventId} is a bound parameter.
	let scansByIntervalRaw: { bucket: string; count: bigint }[];
	if (interval === '30m') {
		scansByIntervalRaw = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT date_trunc('hour', scanned_at)
             + INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM scanned_at) / 30)::int AS bucket,
             COUNT(*) AS count
      FROM scans
      WHERE event_id = ${eventId}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
	} else if (interval === '5m') {
		scansByIntervalRaw = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT date_trunc('hour', scanned_at)
             + INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM scanned_at) / 5)::int AS bucket,
             COUNT(*) AS count
      FROM scans
      WHERE event_id = ${eventId}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
	} else {
		scansByIntervalRaw = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT date_trunc('hour', scanned_at) AS bucket, COUNT(*) AS count
      FROM scans
      WHERE event_id = ${eventId}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
	}

	const [totalGuests, totalScans, uniqueTicketsResult, topGuestsRaw, userScanRankingRaw, duplicateTicketsRaw, firstScansByIntervalRaw] =
		await Promise.all([
			prisma.ticket.count({ where: { eventId } }),
			prisma.scan.count({ where: { eventId } }),
			prisma.scan.groupBy({ by: ['ticketId'], where: { eventId } }),
			// Top 10 guests by scan count (includes not-yet-scanned).
			prisma.$queryRaw<{ ticket_id: string; name: string; scan_count: bigint }[]>`
      SELECT t.id AS ticket_id, t.name, COUNT(s.id) AS scan_count
      FROM tickets t
      LEFT JOIN scans s ON s.ticket_id = t.id AND s.event_id = ${eventId}
      WHERE t.event_id = ${eventId}
      GROUP BY t.id, t.name
      ORDER BY scan_count DESC
      LIMIT 10
    `,
			// Users ranked by number of scans they performed.
			prisma.$queryRaw<{ user_id: string; email: string; scan_count: bigint }[]>`
      SELECT u.id AS user_id, u.email, COUNT(s.id) AS scan_count
      FROM scans s
      JOIN users u ON s.user_id = u.id
      WHERE s.event_id = ${eventId}
      GROUP BY u.id, u.email
      ORDER BY scan_count DESC
      LIMIT 20
    `,
			// Tickets that were scanned more than once (duplicate / multi-scan entries).
			prisma.$queryRaw<{ ticket_id: string; name: string; scan_count: bigint }[]>`
      SELECT t.id AS ticket_id, t.name, COUNT(s.id) AS scan_count
      FROM tickets t
      JOIN scans s ON s.ticket_id = t.id
      WHERE s.event_id = ${eventId}
      GROUP BY t.id, t.name
      HAVING COUNT(s.id) > 1
      ORDER BY scan_count DESC
    `,
			// First scan time per ticket, bucketed by the chosen interval, for a cumulative check-in chart.
			interval === '30m'
				? prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
          SELECT date_trunc('hour', first_scan)
                 + INTERVAL '30 minutes' * FLOOR(EXTRACT(MINUTE FROM first_scan) / 30)::int AS bucket,
                 COUNT(*) AS count
          FROM (
            SELECT MIN(scanned_at) AS first_scan
            FROM scans WHERE event_id = ${eventId} GROUP BY ticket_id
          ) t
          GROUP BY bucket ORDER BY bucket ASC
        `
				: interval === '5m'
					? prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
          SELECT date_trunc('hour', first_scan)
                 + INTERVAL '5 minutes' * FLOOR(EXTRACT(MINUTE FROM first_scan) / 5)::int AS bucket,
                 COUNT(*) AS count
          FROM (
            SELECT MIN(scanned_at) AS first_scan
            FROM scans WHERE event_id = ${eventId} GROUP BY ticket_id
          ) t
          GROUP BY bucket ORDER BY bucket ASC
        `
					: prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
          SELECT date_trunc('hour', first_scan) AS bucket, COUNT(*) AS count
          FROM (
            SELECT MIN(scanned_at) AS first_scan
            FROM scans WHERE event_id = ${eventId} GROUP BY ticket_id
          ) t
          GROUP BY bucket ORDER BY bucket ASC
        `,
		]);

	const uniqueTickets = uniqueTicketsResult.length;
	const duplicates = totalScans - uniqueTickets;
	const scannedGuests = uniqueTickets;
	const notScannedGuests = totalGuests - scannedGuests;

	const scansByInterval = scansByIntervalRaw.map(row => ({
		bucket: row.bucket,
		count: Number(row.count),
	}));

	const topGuests = topGuestsRaw.map(row => ({
		ticketId: row.ticket_id,
		name: row.name,
		scanCount: Number(row.scan_count),
	}));

	const userScanRanking = userScanRankingRaw.map(row => ({
		userId: row.user_id,
		email: row.email,
		scanCount: Number(row.scan_count),
	}));

	const duplicateTickets = duplicateTicketsRaw.map(row => ({
		ticketId: row.ticket_id,
		name: row.name,
		scanCount: Number(row.scan_count),
	}));

	// Compute cumulative check-ins from firstScansByInterval
	let running = 0;
	const firstScansByInterval = firstScansByIntervalRaw.map(row => {
		running += Number(row.count);
		return { bucket: row.bucket, count: running };
	});

	res.json({
		data: {
			totalGuests,
			scannedGuests,
			notScannedGuests,
			totalScans,
			uniqueTickets,
			duplicates,
			scansByHour: scansByInterval, // keep legacy key for backward compatibility
			scansByInterval,
			topGuests,
			userScanRanking,
			duplicateTickets,
			firstScansByInterval,
		},
	});
});

export { router as statsRouter };
export default router;
