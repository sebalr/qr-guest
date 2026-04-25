import { Router, Request, Response } from 'express';
import { getPrismaForTenant } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin', 'scanner']));

router.post('/', async (req: Request, res: Response): Promise<void> => {
	const { eventId, lastTicketVersion, lastScanCursor, localScans, deviceId } = req.body as {
		eventId: string;
		lastTicketVersion: number;
		lastScanCursor: string;
		deviceId?: string;
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

	const normalizedLocalScans = Array.isArray(localScans) ? localScans : [];
	const explicitDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
	const fallbackDeviceId = normalizedLocalScans
		.map(s => (typeof s.deviceId === 'string' ? s.deviceId.trim() : ''))
		.find(id => id.length > 0);
	const effectiveDeviceId = explicitDeviceId || fallbackDeviceId;

	if (!effectiveDeviceId) {
		res.status(400).json({ error: 'deviceId is required' });
		return;
	}

	const cursorDate = lastScanCursor ? new Date(lastScanCursor) : new Date(0);
	if (Number.isNaN(cursorDate.getTime())) {
		res.status(400).json({ error: 'lastScanCursor must be a valid ISO datetime string' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const event = await tenantPrisma.event.findFirst({
		where: { id: eventId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	// Upsert all local scans - append-only, deduplicated by id
	if (normalizedLocalScans.length > 0) {
		for (const scan of normalizedLocalScans) {
			if (!scan.id || !scan.ticketId || !scan.scannedAt) {
				res.status(400).json({ error: 'Each local scan must include id, ticketId, and scannedAt' });
				return;
			}

			const localScanDate = new Date(scan.scannedAt);
			if (Number.isNaN(localScanDate.getTime())) {
				res.status(400).json({ error: 'Each local scan scannedAt must be a valid ISO datetime string' });
				return;
			}
		}

		const ticketIds = Array.from(new Set(normalizedLocalScans.map(s => s.ticketId)));
		const allowedTickets = await tenantPrisma.ticket.findMany({
			where: {
				id: { in: ticketIds },
				eventId,
			},
			select: { id: true },
		});

		if (allowedTickets.length !== ticketIds.length) {
			res.status(400).json({ error: 'localScans contains ticketId values that do not belong to this event' });
			return;
		}

		await tenantPrisma.$transaction(
			normalizedLocalScans.map(s =>
				tenantPrisma.scan.upsert({
					where: { id: s.id },
					create: {
						id: s.id,
						ticketId: s.ticketId,
						eventId,
						deviceId: effectiveDeviceId,
						userId: req.user!.userId,
						scannedAt: new Date(s.scannedAt),
					},
					update: {},
				}),
			),
		);
	}

	const [ticketUpdates, scanUpdates] = await Promise.all([
		tenantPrisma.ticket.findMany({
			where: {
				eventId,
				version: { gt: lastTicketVersion ?? 0 },
			},
		}),
		tenantPrisma.scan.findMany({
			where: {
				eventId,
				createdAt: { gt: cursorDate },
			},
			orderBy: { createdAt: 'asc' },
		}),
	]);

	const newTicketVersion = ticketUpdates.length > 0 ? Math.max(...ticketUpdates.map(t => t.version)) : (lastTicketVersion ?? 0);

	const newScanCursor = scanUpdates.length > 0 ? scanUpdates[scanUpdates.length - 1].createdAt.toISOString() : cursorDate.toISOString();

	// Update sync state for this device/event
	await tenantPrisma.syncState.upsert({
		where: { deviceId_eventId: { deviceId: effectiveDeviceId, eventId } },
		create: {
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
