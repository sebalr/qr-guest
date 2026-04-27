import { Router, Request, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { sendTemporaryScannerAccessEmail } from '../lib/authEmails';
import { resolveRlsContext } from '../lib/tenantContext';
import { authMiddleware } from '../middleware/auth';
import { requireRole, requireSuperAdmin, requireTemporaryScannerEventAccess } from '../middleware/roles';
import { withRls } from '../prisma';

const router = Router();

function parsePrice(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const parsed = Number(trimmed);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function isValidMoneyAmount(value: number): boolean {
	if (value < 0) return false;
	const cents = value * 100;
	return Math.abs(cents - Math.round(cents)) < 1e-9;
}

router.use(authMiddleware);

// Read access is also available to scanners.
router.get('/', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const events = await withRls(context, async tenantPrisma => {
			if (req.user?.isTemporaryScanner === true && req.user.eventId) {
				const event = await tenantPrisma.event.findFirst({
					where: { id: req.user.eventId },
				});
				return event ? [event] : [];
			}

			return tenantPrisma.event.findMany({
				orderBy: { createdAt: 'desc' },
			});
		});

		res.json({ data: events });
	} catch (error) {
		console.error('Error listing events:', error);
		res.status(500).json({ error: 'Failed to load events' });
	}
});

router.get(
	'/:id',
	requireRole(['owner', 'admin', 'scanner']),
	requireTemporaryScannerEventAccess('id'),
	async (req: Request, res: Response): Promise<void> => {
		const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

		if (!eventId) {
			res.status(400).json({ error: 'event id is required' });
			return;
		}

		try {
			const context = resolveRlsContext(req, {
				allowSuperAdminTenantOverride: true,
				allowSuperAdminBypass: true,
			});

			const event = await withRls(context, async tenantPrisma => {
				return tenantPrisma.event.findFirst({
					where: { id: eventId },
				});
			});
			if (!event) {
				res.status(404).json({ error: 'Event not found' });
				return;
			}

			res.json({ data: event });
		} catch (error) {
			console.error('Error fetching event:', error);
			res.status(500).json({ error: 'Failed to load event' });
		}
	},
);

router.post('/', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const { name, description, imageUrl } = req.body;
		const startsAt = req.body.startsAt ?? req.body.starts_at;
		const endsAt = req.body.endsAt ?? req.body.ends_at;

		if (!name) {
			res.status(400).json({ error: 'name is required' });
			return;
		}

		// Validate and parse dates
		const startDate = startsAt ? new Date(startsAt) : undefined;
		const endDate = endsAt ? new Date(endsAt) : undefined;

		if (startDate && isNaN(startDate.getTime())) {
			res.status(400).json({ error: 'Invalid start date format' });
			return;
		}

		if (endDate && isNaN(endDate.getTime())) {
			res.status(400).json({ error: 'Invalid end date format' });
			return;
		}

		const tenant = await withRls(context, async tenantPrisma => {
			return tenantPrisma.tenant.findUnique({
				where: { id: context.tenantId },
				select: { plan: true },
			});
		});

		if (!tenant) {
			res.status(404).json({ error: 'Tenant not found' });
			return;
		}

		const defaultMaxGuests = tenant.plan === 'pro' ? 500 : 10;

		const event = await withRls(context, async tenantPrisma => {
			return tenantPrisma.event.create({
				data: {
					tenantId: context.tenantId,
					name,
					description: description ?? null,
					imageUrl: imageUrl ?? null,
					maxGuests: defaultMaxGuests,
					startsAt: startDate ?? null,
					endsAt: endDate ?? null,
				},
			});
		});

		res.status(201).json({ data: event });
	} catch (error) {
		console.error('Error creating event:', error);
		res.status(500).json({ error: 'Failed to create event' });
	}
});

router.patch('/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!eventId) {
		res.status(400).json({ error: 'event id is required' });
		return;
	}

	const rawMaxGuests = req.body?.maxGuests;
	if (!Number.isInteger(rawMaxGuests) || rawMaxGuests < 1) {
		res.status(400).json({ error: 'maxGuests must be an integer greater than 0' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const updated = await withRls(context, async tenantPrisma => {
			const existing = await tenantPrisma.event.findFirst({
				where: { id: eventId },
				include: { _count: { select: { tickets: true } } },
			});

			if (!existing) {
				res.status(404).json({ error: 'Event not found' });
				return null;
			}

			if (existing._count.tickets > rawMaxGuests) {
				res.status(400).json({
					error: `maxGuests cannot be lower than the current number of tickets (${existing._count.tickets})`,
				});
				return null;
			}

			return tenantPrisma.event.update({
				where: { id: existing.id },
				data: {
					maxGuests: rawMaxGuests,
					version: { increment: 1 },
				},
			});
		});

		if (!updated) {
			return;
		}

		res.json({ data: updated });
	} catch (error) {
		console.error('Error updating event:', error);
		res.status(500).json({ error: 'Failed to update event' });
	}
});

router.get('/:id/temporary-scanners', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!eventId) {
		res.status(400).json({ error: 'event id is required' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const scanners = await withRls(context, async tenantPrisma => {
			const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
			if (!event) {
				res.status(404).json({ error: 'Event not found' });
				return null;
			}

			return tenantPrisma.temporaryScanner.findMany({
				where: { eventId },
				orderBy: [{ createdAt: 'desc' }],
			});
		});

		if (!scanners) {
			return;
		}

		res.json({
			data: scanners.map(scanner => ({
				id: scanner.id,
				eventId: scanner.eventId,
				name: scanner.name,
				loginToken: scanner.loginToken,
				isActive: scanner.isActive,
				lastUsedAt: scanner.lastUsedAt,
				createdAt: scanner.createdAt,
			})),
		});
	} catch (error) {
		console.error('Error listing temporary scanners:', error);
		res.status(500).json({ error: 'Failed to load temporary scanners' });
	}
});

router.post('/:id/temporary-scanners', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
	const name = rawName.trim();

	if (!eventId) {
		res.status(400).json({ error: 'event id is required' });
		return;
	}

	if (!name) {
		res.status(400).json({ error: 'name is required' });
		return;
	}

	if (!req.user?.userId) {
		res.status(401).json({ error: 'Unauthorized' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const created = await withRls(context, async tenantPrisma => {
			const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
			if (!event) {
				res.status(404).json({ error: 'Event not found' });
				return null;
			}

			const user = await tenantPrisma.user.create({
				data: {
					email: `temp-scanner-${randomUUID()}@temporary.local`,
					passwordHash: null,
					emailVerifiedAt: new Date(),
					isSuperAdmin: false,
				},
			});

			await tenantPrisma.userTenant.create({
				data: {
					userId: user.id,
					tenantId: context.tenantId,
					role: 'scanner',
				},
			});

			const loginToken = randomBytes(24).toString('base64url');
			return tenantPrisma.temporaryScanner.create({
				data: {
					tenantId: context.tenantId,
					eventId,
					userId: user.id,
					createdBy: req.user!.userId,
					name,
					loginToken,
				},
			});
		});

		if (!created) {
			return;
		}

		res.status(201).json({
			data: {
				id: created.id,
				eventId: created.eventId,
				name: created.name,
				loginToken: created.loginToken,
				isActive: created.isActive,
				lastUsedAt: created.lastUsedAt,
				createdAt: created.createdAt,
			},
		});
	} catch (error) {
		console.error('Error creating temporary scanner:', error);
		res.status(500).json({ error: 'Failed to create temporary scanner' });
	}
});

router.patch('/:id/temporary-scanners/:scannerId', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const scannerId = Array.isArray(req.params.scannerId) ? req.params.scannerId[0] : req.params.scannerId;
	const isActive = req.body?.isActive;

	if (!eventId || !scannerId) {
		res.status(400).json({ error: 'event id and scanner id are required' });
		return;
	}

	if (typeof isActive !== 'boolean') {
		res.status(400).json({ error: 'isActive must be a boolean' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const updated = await withRls(context, async tenantPrisma => {
			const scanner = await tenantPrisma.temporaryScanner.findFirst({
				where: { id: scannerId, eventId },
			});
			if (!scanner) {
				res.status(404).json({ error: 'Temporary scanner not found' });
				return null;
			}

			return tenantPrisma.temporaryScanner.update({
				where: { id: scanner.id },
				data: { isActive },
			});
		});

		if (!updated) {
			return;
		}

		res.json({
			data: {
				id: updated.id,
				eventId: updated.eventId,
				name: updated.name,
				loginToken: updated.loginToken,
				isActive: updated.isActive,
				lastUsedAt: updated.lastUsedAt,
				createdAt: updated.createdAt,
			},
		});
	} catch (error) {
		console.error('Error updating temporary scanner:', error);
		res.status(500).json({ error: 'Failed to update temporary scanner' });
	}
});

router.post(
	'/:id/temporary-scanners/:scannerId/send-email',
	requireRole(['owner', 'admin']),
	async (req: Request, res: Response): Promise<void> => {
		const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
		const scannerId = Array.isArray(req.params.scannerId) ? req.params.scannerId[0] : req.params.scannerId;
		const rawRecipientEmail = typeof req.body?.email === 'string' ? req.body.email : '';
		const recipientEmail = rawRecipientEmail.trim().toLowerCase();

		if (!eventId || !scannerId) {
			res.status(400).json({ error: 'event id and scanner id are required' });
			return;
		}

		if (!recipientEmail) {
			res.status(400).json({ error: 'email is required' });
			return;
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(recipientEmail)) {
			res.status(400).json({ error: 'email must be valid' });
			return;
		}

		try {
			const context = resolveRlsContext(req, {
				allowSuperAdminTenantOverride: true,
				allowSuperAdminBypass: true,
			});

			const scannerData = await withRls(context, async tenantPrisma => {
				const event = await tenantPrisma.event.findFirst({
					where: { id: eventId },
					select: { id: true, name: true },
				});
				if (!event) {
					res.status(404).json({ error: 'Event not found' });
					return null;
				}

				const scanner = await tenantPrisma.temporaryScanner.findFirst({
					where: { id: scannerId, eventId },
					select: {
						id: true,
						name: true,
						loginToken: true,
						isActive: true,
					},
				});

				if (!scanner) {
					res.status(404).json({ error: 'Temporary scanner not found' });
					return null;
				}

				if (!scanner.isActive) {
					res.status(400).json({ error: 'Temporary scanner is disabled' });
					return null;
				}

				return {
					eventName: event.name,
					scannerName: scanner.name,
					loginToken: scanner.loginToken,
				};
			});

			if (!scannerData) {
				return;
			}

			await sendTemporaryScannerAccessEmail({
				to: recipientEmail,
				eventName: scannerData.eventName,
				scannerName: scannerData.scannerName,
				loginToken: scannerData.loginToken,
			});

			res.json({ data: { message: 'Temporary scanner email sent successfully' } });
		} catch (error) {
			console.error('Error sending temporary scanner email:', error);
			res.status(500).json({ error: 'Failed to send temporary scanner email' });
		}
	},
);

router.get('/:id/ticket-types', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!eventId) {
		res.status(400).json({ error: 'event id is required' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const ticketTypes = await withRls(context, async tenantPrisma => {
			const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
			if (!event) {
				res.status(404).json({ error: 'Event not found' });
				return null;
			}

			return tenantPrisma.ticketType.findMany({
				where: { eventId },
				orderBy: [{ createdAt: 'asc' }],
			});
		});

		if (!ticketTypes) {
			return;
		}

		res.json({
			data: ticketTypes.map(t => ({
				id: t.id,
				eventId: t.eventId,
				name: t.name,
				price: Number(t.price),
				version: t.version,
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
			})),
		});
	} catch (error) {
		console.error('Error listing ticket types:', error);
		res.status(500).json({ error: 'Failed to load ticket types' });
	}
});

router.post('/:id/ticket-types', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!eventId) {
		res.status(400).json({ error: 'event id is required' });
		return;
	}

	const rawName = typeof req.body?.name === 'string' ? req.body.name : '';
	const name = rawName.trim();
	const price = parsePrice(req.body?.price);

	if (!name) {
		res.status(400).json({ error: 'name is required' });
		return;
	}

	if (price === null || !isValidMoneyAmount(price)) {
		res.status(400).json({ error: 'price must be a valid non-negative decimal with up to 2 digits' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const created = await withRls(context, async tenantPrisma => {
			const event = await tenantPrisma.event.findFirst({ where: { id: eventId } });
			if (!event) {
				res.status(404).json({ error: 'Event not found' });
				return null;
			}

			const duplicate = await tenantPrisma.ticketType.findFirst({
				where: {
					eventId,
					name: { equals: name, mode: 'insensitive' },
				},
			});

			if (duplicate) {
				res.status(409).json({ error: 'A ticket type with this name already exists for the event' });
				return null;
			}

			return tenantPrisma.ticketType.create({
				data: {
					tenantId: context.tenantId,
					eventId,
					name,
					price,
				},
			});
		});

		if (!created) {
			return;
		}

		res.status(201).json({
			data: {
				id: created.id,
				eventId: created.eventId,
				name: created.name,
				price: Number(created.price),
				version: created.version,
				createdAt: created.createdAt,
				updatedAt: created.updatedAt,
			},
		});
	} catch (error) {
		console.error('Error creating ticket type:', error);
		res.status(500).json({ error: 'Failed to create ticket type' });
	}
});

router.patch('/ticket-types/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketTypeId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!ticketTypeId) {
		res.status(400).json({ error: 'ticket type id is required' });
		return;
	}

	const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'name');
	const hasPrice = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'price');

	if (!hasName && !hasPrice) {
		res.status(400).json({ error: 'At least one field (name or price) is required' });
		return;
	}

	const rawName = hasName && typeof req.body?.name === 'string' ? req.body.name : '';
	const name = hasName ? rawName.trim() : undefined;
	const price = hasPrice ? parsePrice(req.body?.price) : undefined;

	if (hasName && !name) {
		res.status(400).json({ error: 'name cannot be empty' });
		return;
	}

	if (hasPrice && (typeof price !== 'number' || !isValidMoneyAmount(price))) {
		res.status(400).json({ error: 'price must be a valid non-negative decimal with up to 2 digits' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const updated = await withRls(context, async tenantPrisma => {
			const existing = await tenantPrisma.ticketType.findFirst({ where: { id: ticketTypeId } });
			if (!existing) {
				res.status(404).json({ error: 'Ticket type not found' });
				return null;
			}

			if (name) {
				const duplicate = await tenantPrisma.ticketType.findFirst({
					where: {
						eventId: existing.eventId,
						id: { not: existing.id },
						name: { equals: name, mode: 'insensitive' },
					},
				});

				if (duplicate) {
					res.status(409).json({ error: 'A ticket type with this name already exists for the event' });
					return null;
				}
			}

			return tenantPrisma.ticketType.update({
				where: { id: ticketTypeId },
				data: {
					...(name ? { name } : {}),
					...(typeof price === 'number' ? { price } : {}),
					version: { increment: 1 },
				},
			});
		});

		if (!updated) {
			return;
		}

		res.json({
			data: {
				id: updated.id,
				eventId: updated.eventId,
				name: updated.name,
				price: Number(updated.price),
				version: updated.version,
				createdAt: updated.createdAt,
				updatedAt: updated.updatedAt,
			},
		});
	} catch (error) {
		console.error('Error updating ticket type:', error);
		res.status(500).json({ error: 'Failed to update ticket type' });
	}
});

router.delete('/ticket-types/:id', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	const ticketTypeId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

	if (!ticketTypeId) {
		res.status(400).json({ error: 'ticket type id is required' });
		return;
	}

	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const deleted = await withRls(context, async tenantPrisma => {
			const existing = await tenantPrisma.ticketType.findFirst({ where: { id: ticketTypeId } });
			if (!existing) {
				res.status(404).json({ error: 'Ticket type not found' });
				return null;
			}

			await tenantPrisma.ticketType.delete({ where: { id: ticketTypeId } });
			return { id: ticketTypeId };
		});

		if (!deleted) {
			return;
		}

		res.json({ data: deleted });
	} catch (error) {
		console.error('Error deleting ticket type:', error);
		res.status(500).json({ error: 'Failed to delete ticket type' });
	}
});

export default router;
