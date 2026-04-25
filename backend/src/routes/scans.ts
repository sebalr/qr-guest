import { Router, Request, Response } from 'express';
import prisma from '../prisma';
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

router.post('/', async (req: Request, res: Response): Promise<void> => {
	const { ticketId, eventId, deviceId, scannedAt, confirmed } = req.body as {
		ticketId: string;
		eventId: string;
		deviceId: string;
		scannedAt: string;
		confirmed?: boolean;
	};

	if (!ticketId || !eventId || !deviceId || !scannedAt) {
		res.status(400).json({ error: 'ticketId, eventId, deviceId, and scannedAt are required' });
		return;
	}

	const scannedAtDate = new Date(scannedAt);
	if (Number.isNaN(scannedAtDate.getTime())) {
		res.status(400).json({ error: 'scannedAt must be a valid ISO datetime string' });
		return;
	}

	const ticket = await prisma.ticket.findFirst({
		where: { id: ticketId, eventId },
		include: { event: true },
	});

	if (!ticket || ticket.event.tenantId !== req.user!.tenantId) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	if (ticket.status === 'cancelled') {
		res.status(422).json({ error: 'Ticket is cancelled' });
		return;
	}

	const existingScans = await prisma.scan.findMany({
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

	let scan;
	try {
		scan = await prisma.scan.create({
			data: {
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
			const latestScans = await prisma.scan.findMany({
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
