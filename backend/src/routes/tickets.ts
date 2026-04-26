import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { resolveRlsContext } from '../lib/tenantContext';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { withRls } from '../prisma';

const router = Router();

router.use(authMiddleware);

async function resolveTicketTypeForEvent(
	tenantPrisma: Parameters<Parameters<typeof withRls>[1]>[0],
	eventId: string,
	ticketTypeId?: string | null,
) {
	if (!ticketTypeId) return null;
	return tenantPrisma.ticketType.findFirst({
		where: {
			id: ticketTypeId,
			eventId,
		},
	});
}

// Single ticket create - owner/admin only
router.post('/events/:id/tickets', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	const { name, guestId, ticketTypeId } = req.body as { name?: string; guestId?: string; ticketTypeId?: string };
	if (!guestId && (!name || !name.trim())) {
		res.status(400).json({ error: 'name or guestId is required' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const tenant = await prisma.tenant.findUnique({ where: { id: context.tenantId } });
	if (tenant?.plan === 'free') {
		const existing = await withRls(context, async tenantPrisma => {
			return tenantPrisma.ticket.count({ where: { eventId } });
		});
		if (existing >= 10) {
			res.status(403).json({ error: 'Free plan allows a maximum of 10 tickets per event.' });
			return;
		}
	}

	let resolvedGuestId: string;
	let resolvedName: string;

	const ticket = await withRls(context, async tenantPrisma => {
		const event = await tenantPrisma.event.findFirst({
			where: { id: eventId },
		});
		if (!event) {
			res.status(404).json({ error: 'Event not found' });
			return null;
		}

		if (guestId) {
			const guest = await tenantPrisma.guest.findFirst({
				where: { id: guestId },
			});
			if (!guest) {
				res.status(404).json({ error: 'Guest not found' });
				return null;
			}
			resolvedGuestId = guest.id;
			resolvedName = guest.name;
		} else {
			const trimmedName = name!.trim();
			let guest = await tenantPrisma.guest.findFirst({
				where: { name: { equals: trimmedName, mode: 'insensitive' } },
			});
			if (!guest) {
				guest = await tenantPrisma.guest.create({
					data: {
						tenantId: context.tenantId,
						name: trimmedName,
					},
				});
			}
			resolvedGuestId = guest.id;
			resolvedName = guest.name;
		}

		const trimmedTicketTypeId = typeof ticketTypeId === 'string' ? ticketTypeId.trim() : '';
		if (trimmedTicketTypeId) {
			const ticketType = await resolveTicketTypeForEvent(tenantPrisma, eventId, trimmedTicketTypeId);
			if (!ticketType) {
				res.status(400).json({ error: 'ticketTypeId does not belong to this event' });
				return null;
			}
		}

		const createdTicket = await tenantPrisma.ticket.create({
			data: {
				tenantId: context.tenantId,
				eventId,
				guestId: resolvedGuestId,
				name: resolvedName,
				...(trimmedTicketTypeId ? { ticketTypeId: trimmedTicketTypeId } : {}),
			},
		});

		await tenantPrisma.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });
		return createdTicket;
	});

	if (!ticket) {
		return;
	}

	res.status(201).json({ data: ticket });
});

// Bulk create tickets - owner/admin only
router.post('/events/:id/tickets/bulk', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}
	type BulkTicketInput = { name: string; ticketTypeId?: string };
	const body = req.body as { tickets?: BulkTicketInput[]; names?: string[] };
	const tickets: BulkTicketInput[] = Array.isArray(body.tickets)
		? body.tickets
		: Array.isArray(body.names)
			? body.names.map(name => ({ name }))
			: [];

	if (!Array.isArray(tickets) || tickets.length === 0) {
		res.status(400).json({ error: 'tickets must be a non-empty array' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const tenant = await prisma.tenant.findUnique({ where: { id: context.tenantId } });
	if (tenant?.plan === 'free') {
		const existing = await withRls(context, async tenantPrisma => {
			return tenantPrisma.ticket.count({ where: { eventId } });
		});
		if (existing + tickets.length > 10) {
			res.status(403).json({
				error: `Free plan allows a maximum of 10 tickets per event. Current: ${existing}`,
			});
			return;
		}
	}

	const created = await withRls(context, async tenantPrisma => {
		const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
		if (!event) {
			res.status(404).json({ error: 'Event not found' });
			return null;
		}

		const providedTypeIds = Array.from(
			new Set(tickets.map(t => (typeof t.ticketTypeId === 'string' ? t.ticketTypeId.trim() : '')).filter(id => id.length > 0)),
		);

		if (providedTypeIds.length > 0) {
			const validTypes = await tenantPrisma.ticketType.findMany({
				where: {
					eventId,
					id: { in: providedTypeIds },
				},
				select: { id: true },
			});

			if (validTypes.length !== providedTypeIds.length) {
				res.status(400).json({ error: 'One or more ticketTypeId values do not belong to this event' });
				return null;
			}
		}

		const results = await tenantPrisma.$transaction(async tx => {
			const createdTickets = [];
			for (const t of tickets) {
				const trimmedName = t.name.trim();
				if (!trimmedName) {
					continue;
				}
				const trimmedTicketTypeId = typeof t.ticketTypeId === 'string' ? t.ticketTypeId.trim() : '';
				let guest = await tx.guest.findFirst({
					where: { name: { equals: trimmedName, mode: 'insensitive' } },
				});
				if (!guest) {
					guest = await tx.guest.create({
						data: {
							tenantId: context.tenantId,
							name: trimmedName,
						},
					});
				}
				const ticket = await tx.ticket.create({
					data: {
						tenantId: context.tenantId,
						eventId,
						guestId: guest.id,
						name: guest.name,
						...(trimmedTicketTypeId ? { ticketTypeId: trimmedTicketTypeId } : {}),
					},
				});
				createdTickets.push(ticket);
			}
			return createdTickets;
		});

		await tenantPrisma.event.update({ where: { id: eventId }, data: { version: { increment: 1 } } });
		return results;
	});

	if (!created) {
		return;
	}

	res.status(201).json({ data: created });
});

// List tickets with scan count - owner/admin/scanner
router.get('/events/:id/tickets', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!eventId) {
		res.status(400).json({ error: 'Invalid event id' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const ticketsData = await withRls(context, async tenantPrisma => {
		const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
		if (!event) {
			res.status(404).json({ error: 'Event not found' });
			return null;
		}

		return tenantPrisma.ticket.findMany({
			where: { eventId },
			include: {
				ticketType: true,
				_count: { select: { scans: true } },
			},
			orderBy: { createdAt: 'asc' },
		});
	});

	if (!ticketsData) {
		return;
	}

	const result = ticketsData.map(t => ({
		id: t.id,
		eventId: t.eventId,
		guestId: t.guestId,
		ticketTypeId: t.ticketTypeId,
		ticketType: t.ticketType
			? {
					id: t.ticketType.id,
					name: t.ticketType.name,
					price: Number(t.ticketType.price),
				}
			: null,
		name: t.name,
		status: t.status,
		version: t.version,
		createdAt: t.createdAt,
		updatedAt: t.updatedAt,
		scanCount: t._count.scans,
	}));

	res.json({ data: result });
});

router.patch('/tickets/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	if (!Object.prototype.hasOwnProperty.call(req.body ?? {}, 'ticketTypeId')) {
		res.status(400).json({ error: 'ticketTypeId is required' });
		return;
	}

	const rawTicketTypeId = req.body.ticketTypeId;
	const normalizedTicketTypeId = typeof rawTicketTypeId === 'string' ? rawTicketTypeId.trim() : '';
	if (rawTicketTypeId !== null && rawTicketTypeId !== undefined && typeof rawTicketTypeId !== 'string') {
		res.status(400).json({ error: 'ticketTypeId must be a string or null' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const updated = await withRls(context, async tenantPrisma => {
		const ticket = await tenantPrisma.ticket.findFirst({ where: { id: ticketId } });
		if (!ticket) {
			res.status(404).json({ error: 'Ticket not found' });
			return null;
		}

		if (normalizedTicketTypeId) {
			const ticketType = await resolveTicketTypeForEvent(tenantPrisma, ticket.eventId, normalizedTicketTypeId);
			if (!ticketType) {
				res.status(400).json({ error: 'ticketTypeId does not belong to this event' });
				return null;
			}
		}

		return tenantPrisma.ticket.update({
			where: { id: ticket.id },
			data: {
				ticketTypeId: normalizedTicketTypeId || null,
				version: { increment: 1 },
			},
			include: { ticketType: true },
		});
	});

	if (!updated) {
		return;
	}

	res.json({
		data: {
			id: updated.id,
			eventId: updated.eventId,
			guestId: updated.guestId,
			ticketTypeId: updated.ticketTypeId,
			ticketType: updated.ticketType
				? {
						id: updated.ticketType.id,
						name: updated.ticketType.name,
						price: Number(updated.ticketType.price),
					}
				: null,
			name: updated.name,
			status: updated.status,
			version: updated.version,
			createdAt: updated.createdAt,
			updatedAt: updated.updatedAt,
		},
	});
});

// Scan history for a ticket - owner/admin/scanner
router.get('/tickets/:id/scans', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const scans = await withRls(context, async tenantPrisma => {
		const ticket = await tenantPrisma.ticket.findFirst({
			where: { id: ticketId },
			include: { event: true },
		});

		if (!ticket) {
			res.status(404).json({ error: 'Ticket not found' });
			return null;
		}

		return tenantPrisma.scan.findMany({
			where: { ticketId: ticket.id, eventId: ticket.eventId },
			orderBy: { scannedAt: 'desc' },
			include: { user: { select: { id: true, email: true } } },
		});
	});

	if (!scans) {
		return;
	}

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

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const updated = await withRls(context, async tenantPrisma => {
		const ticket = await tenantPrisma.ticket.findFirst({
			where: { id: ticketId },
			include: { event: true },
		});

		if (!ticket) {
			res.status(404).json({ error: 'Ticket not found' });
			return null;
		}

		if (ticket.status === 'cancelled') {
			res.status(400).json({ error: 'Ticket is already cancelled' });
			return null;
		}

		return tenantPrisma.ticket.update({
			where: { id: ticketId },
			data: { status: 'cancelled', version: { increment: 1 } },
		});
	});

	if (!updated) {
		return;
	}

	res.json({ data: updated });
});

// QR token for a ticket - owner/admin only
router.get('/tickets/:id/qr', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!ticketId) {
		res.status(400).json({ error: 'Invalid ticket id' });
		return;
	}

	const context = resolveRlsContext(req, { allowSuperAdminTenantOverride: true });

	const ticket = await withRls(context, async tenantPrisma => {
		return tenantPrisma.ticket.findFirst({
			where: { id: ticketId },
			include: { event: true },
		});
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
