import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getPrismaForTenant } from '../prisma';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);

// Single ticket create - owner/admin only
router.post('/events/:id/tickets', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	const { name, guestId } = req.body as { name?: string; guestId?: string };
	if (!guestId && (!name || !name.trim())) {
		res.status(400).json({ error: 'name or guestId is required' });
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

	const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
	if (tenant?.plan === 'free') {
		const existing = await tenantPrisma.ticket.count({ where: { eventId } });
		if (existing >= 10) {
			res.status(403).json({ error: 'Free plan allows a maximum of 10 tickets per event.' });
			return;
		}
	}

	let resolvedGuestId: string;
	let resolvedName: string;

	if (guestId) {
		// Use existing guest - verify it belongs to the same tenant
		const guest = await tenantPrisma.guest.findFirst({
			where: { id: guestId },
		});
		if (!guest) {
			res.status(404).json({ error: 'Guest not found' });
			return;
		}
		resolvedGuestId = guest.id;
		resolvedName = guest.name;
	} else {
		// Find or create a guest by name within this tenant
		const trimmedName = name!.trim();
		let guest = await tenantPrisma.guest.findFirst({
			where: { name: { equals: trimmedName, mode: 'insensitive' } },
		});
		if (!guest) {
			guest = await tenantPrisma.guest.create({
				data: { name: trimmedName },
			});
		}
		resolvedGuestId = guest.id;
		resolvedName = guest.name;
	}

	const ticket = await tenantPrisma.ticket.create({
		data: { eventId, guestId: resolvedGuestId, name: resolvedName },
	});
	await tenantPrisma.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });

	res.status(201).json({ data: ticket });
});

// Bulk create tickets - owner/admin only
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

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const event = await tenantPrisma.event.findFirst({
		where: { id: eventId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}

	const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
	if (tenant?.plan === 'free') {
		const existing = await tenantPrisma.ticket.count({ where: { eventId } });
		if (existing + tickets.length > 10) {
			res.status(403).json({
				error: `Free plan allows a maximum of 10 tickets per event. Current: ${existing}`,
			});
			return;
		}
	}

	const created = await tenantPrisma.$transaction(async tx => {
		const results = [];
		for (const t of tickets) {
			const trimmedName = t.name.trim();
			let guest = await tx.guest.findFirst({
				where: { name: { equals: trimmedName, mode: 'insensitive' } },
			});
			if (!guest) {
				guest = await tx.guest.create({
					data: { name: trimmedName },
				});
			}
			const ticket = await tx.ticket.create({
				data: { eventId, guestId: guest.id, name: guest.name },
			});
			results.push(ticket);
		}
		return results;
	});

	// Bump event version so sync clients pick up the new tickets
	await tenantPrisma.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });

	res.status(201).json({ data: created });
});

// List tickets with scan count - owner/admin/scanner
router.get('/events/:id/tickets', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
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

	const ticketsData = await tenantPrisma.ticket.findMany({
		where: { eventId },
		include: { _count: { select: { scans: true } } },
		orderBy: { createdAt: 'asc' },
	});

	const result = ticketsData.map(t => ({
		id: t.id,
		eventId: t.eventId,
		guestId: t.guestId,
		name: t.name,
		status: t.status,
		version: t.version,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
		scanCount: t._count.scans,
	}));

	res.json({ data: result });
});

// Scan history for a ticket - owner/admin/scanner
router.get('/tickets/:id/scans', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const ticket = await tenantPrisma.ticket.findFirst({
		where: { id: ticketId },
		include: { event: true },
	});

	if (!ticket) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	const scans = await tenantPrisma.scan.findMany({
		where: { ticketId: ticket.id, eventId: ticket.eventId },
		orderBy: { scannedAt: 'desc' },
		include: { user: { select: { id: true, email: true } } },
	});

	res.json({
		data: scans.map(scan => ({
			id: scan.id,
			scannedAt: scan.scannedAt,
			deviceId: scan.deviceId,
			userId: scan.userId,
			scannedBy: scan.user?.email ?? 'Unknown scanner',
		})),
	});
});

// Cancel a ticket - owner/admin only
router.post('/tickets/:id/cancel', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const ticket = await tenantPrisma.ticket.findFirst({
		where: { id: ticketId },
		include: { event: true },
	});

	if (!ticket) {
		res.status(404).json({ error: 'Ticket not found' });
		return;
	}

	if (ticket.status === 'cancelled') {
		res.status(400).json({ error: 'Ticket is already cancelled' });
		return;
	}

	const updated = await tenantPrisma.ticket.update({
		where: { id: ticketId },
		data: { status: 'cancelled', version: { increment: 1 } },
	});

	res.json({ data: updated });
});

// QR token for a ticket - owner/admin only
router.get('/tickets/:id/qr', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);

	const ticket = await tenantPrisma.ticket.findFirst({
		where: { id: ticketId },
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

	const secret = process.env.QR_SECRET;
	if (!secret) {
		res.status(500).json({ error: 'Server misconfiguration: QR_SECRET not set' });
		return;
	}

	// Use noTimestamp to strip iat/exp - keeps the QR payload minimal for easy scanning
	const qrToken = jwt.sign({ tid: ticket.id, eid: ticket.eventId }, secret, {
		noTimestamp: true,
	});

	res.json({ data: { qrToken } });
});

export default router;
