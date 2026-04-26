import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { resolveRlsContext } from '../lib/tenantContext';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { withRls } from '../prisma';

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

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });
	const rowId = randomUUID();
	const debugPayload = (payload ?? {}) as Prisma.InputJsonValue;

	const created = await withRls(context, async tenantPrisma => {
		const event = await tenantPrisma.event.findFirst({
			where: { id: normalizedEventId },
			select: { id: true },
		});

		if (!event) {
			res.status(404).json({ error: 'Event not found' });
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

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const scan = await withRls(context, async tenantPrisma => {
		const ticket = await tenantPrisma.ticket.findFirst({
			where: { id: ticketId, eventId },
			include: { event: true },
		});

		if (!ticket) {
			res.status(404).json({ error: 'Ticket not found' });
			return null;
		}

		if (ticket.status === 'cancelled') {
			res.status(422).json({ error: 'Ticket is cancelled' });
			return null;
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
			return null;
		}

		const dedupeKey = confirmed === true ? null : `${eventId}:${ticketId}`;
		const scanId = bodyId ?? randomUUID();

		try {
			return await tenantPrisma.scan.create({
				data: {
					id: scanId,
					tenantId: context.tenantId,
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
				return null;
			}
			throw error;
		}
	});

	if (!scan) {
		return;
	}

	res.status(201).json({ data: scan });
});

export default router;
