import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);

// Bulk create tickets — owner/admin only
router.post('/events/:id/tickets/bulk', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}
	const body = req.body as { tickets?: { name: string }[]; names?: string[] };
	const tickets = Array.isArray(body.tickets) ? body.tickets : Array.isArray(body.names) ? body.names.map(name => ({ name })) : [];

	if (!Array.isArray(tickets) || tickets.length === 0) {
		res.status(400).json({ error: 'tickets must be a non-empty array' });
		return;
	}

	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
	if (tenant?.plan === 'free') {
		const existing = await prisma.ticket.count({ where: { eventId } });
		if (existing + tickets.length > 10) {
			res.status(403).json({
				error: `Free plan allows a maximum of 10 tickets per event. Current: ${existing}`,
			});
			return;
		}
	}

	const created = await prisma.$transaction(tickets.map(t => prisma.ticket.create({ data: { eventId, name: t.name } })));

	// Bump event version so sync clients pick up the new tickets
	await prisma.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });

	res.status(201).json({ data: created });
});

// List tickets with scan count — owner/admin only
router.get('/events/:id/tickets', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const tickets = await prisma.ticket.findMany({
		where: { eventId },
		include: { _count: { select: { scans: true } } },
		orderBy: { createdAt: 'asc' },
	});

	const result = tickets.map(t => ({
		id: t.id,
		eventId: t.eventId,
		name: t.name,
		status: t.status,
		version: t.version,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
		scanCount: t._count.scans,
	}));

	res.json({ data: result });
});

// Cancel a ticket — owner/admin only
router.post('/tickets/:id/cancel', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const ticket = await prisma.ticket.findFirst({
		where: { id: ticketId },
		include: { event: true },
	});

	if (!ticket || ticket.event.tenantId !== req.user!.tenantId) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	if (ticket.status === 'cancelled') {
		res.status(400).json({ error: 'Ticket is already cancelled' });
		return;
	}

	const updated = await prisma.ticket.update({
		where: { id: ticketId },
		data: { status: 'cancelled', version: { increment: 1 } },
	});

	res.json({ data: updated });
});

// QR token for a ticket — owner/admin only
router.get('/tickets/:id/qr', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const ticket = await prisma.ticket.findFirst({
		where: { id: ticketId },
		include: { event: true },
	});

	if (!ticket || ticket.event.tenantId !== req.user!.tenantId) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	const secret = process.env.QR_SECRET;
	if (!secret) {
		res.status(500).json({ error: 'Server misconfiguration: QR_SECRET not set' });
		return;
	}

	// Use noTimestamp to strip iat/exp — keeps the QR payload minimal for easy scanning
	const qrToken = jwt.sign({ tid: ticket.id, eid: ticket.eventId }, secret, {
		noTimestamp: true,
	});

	res.json({ data: { qrToken } });
});

export default router;
