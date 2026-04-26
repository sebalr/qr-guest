import { Router, Request, Response } from 'express';
import { resolveRlsContext } from '../lib/tenantContext';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { withRls } from '../prisma';

const router = Router();

router.use(authMiddleware);

// Read access is also available to scanners.
router.get('/', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	try {
		const context = resolveRlsContext(req, {
			allowSuperAdminTenantOverride: true,
			allowSuperAdminBypass: true,
		});

		const events = await withRls(context, async tenantPrisma => {
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

router.get('/:id', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
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
});

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

		const event = await withRls(context, async tenantPrisma => {
			return tenantPrisma.event.create({
				data: {
					tenantId: context.tenantId,
					name,
					description: description ?? null,
					imageUrl: imageUrl ?? null,
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

export default router;
