import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getPrismaForTenant } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

function isUniqueConstraintError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { code?: unknown };
	return candidate.code === 'P2002';
}

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin', 'scanner']));

router.post('/device-event-debug', async (req: Request, res: Response): Promise<void> => {
	const { eventId, deviceId, payload } = req.body as {
		eventId?: string;
		deviceId?: string;
		payload?: Record<string, unknown>;
	};

	const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
	const normalizedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';

	if (!normalizedEventId || !normalizedDeviceId) {
		res.status(400).json({ error: 'eventId and deviceId are required' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const event = await tenantPrisma.event.findFirst({
		where: { id: normalizedEventId },
		select: { id: true },
	});

	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const rowId = randomUUID();
	const payloadText = JSON.stringify(payload ?? {});

	await tenantPrisma.$executeRaw`
		INSERT INTO device_event_debug_data (id, event_id, device_id, user_id, payload)
		VALUES (${rowId}, ${normalizedEventId}, ${normalizedDeviceId}, ${req.user!.userId}, CAST(${payloadText} AS jsonb))
	`;

	res.status(201).json({
		data: {
			id: rowId,
			eventId: normalizedEventId,
			deviceId: normalizedDeviceId,
			createdAt: new Date().toISOString(),
		},
	});
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
	const {
		id: bodyId,
		ticketId,
		eventId,
		deviceId,
		scannedAt,
		confirmed,
	} = req.body as {
		id?: string;
		ticketId: string;
		eventId: string;
		deviceId: string;
		scannedAt: string;
		confirmed?: boolean;
	};

	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (bodyId !== undefined && (typeof bodyId !== 'string' || !UUID_RE.test(bodyId))) {
		res.status(400).json({ error: 'id must be a valid UUID' });
		return;
	}

	if (!ticketId || !eventId || !deviceId || !scannedAt) {
		res.status(400).json({ error: 'ticketId, eventId, deviceId, and scannedAt are required' });
		return;
	}

	const scannedAtDate = new Date(scannedAt);
	if (Number.isNaN(scannedAtDate.getTime())) {
		res.status(400).json({ error: 'scannedAt must be a valid ISO datetime string' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const ticket = await tenantPrisma.ticket.findFirst({
		where: { id: ticketId, eventId },
		include: { event: true },
	});

	if (!ticket) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	if (ticket.status === 'cancelled') {
		res.status(422).json({ error: 'Ticket is cancelled' });
		return;
	}

	const existingScans = await tenantPrisma.scan.findMany({
		where: { ticketId, eventId },
		orderBy: { scannedAt: 'asc' },
	});

	if (existingScans.length > 0 && confirmed !== true) {
		res.status(409).json({
			error: 'Ticket has already been scanned',
			data: { existingScans },
		});
		return;
	}

	const dedupeKey = confirmed === true ? null : `${eventId}:${ticketId}`;

	const scanId = bodyId ?? randomUUID();

	let scan;
	try {
		scan = await tenantPrisma.scan.create({
			data: {
				id: scanId,
				ticketId,
				eventId,
				deviceId,
				userId: req.user!.userId,
				scannedAt: scannedAtDate,
				dedupeKey,
			},
		});
	} catch (error) {
		if (isUniqueConstraintError(error) && confirmed !== true) {
			const latestScans = await tenantPrisma.scan.findMany({
				where: { ticketId, eventId },
				orderBy: { scannedAt: 'asc' },
			});
			res.status(409).json({
				error: 'Ticket has already been scanned',
				data: { existingScans: latestScans },
			});
			return;
		}
		throw error;
	}

	res.status(201).json({ data: scan });
});

export default router;
