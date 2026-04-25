import { Router, Request, Response } from 'express';
import { getPrismaForTenant } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);

// Read access is also available to scanners.
router.get('/', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);
	const events = await tenantPrisma.event.findMany({
		orderBy: { createdAt: 'desc' },
	});
	res.json({ data: events });
});

router.get('/:id', requireRole(['owner', 'admin', 'scanner']), async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const tenantPrisma = await getPrismaForTenant(req.user!.tenantId);
	const event = await tenantPrisma.event.findFirst({
		where: { id: eventId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}
	res.json({ data: event });
});

router.post('/', requireRole(['owner', 'admin']), async (req: Request, res: Response): Promise<void> => {
	try {
		// Validate user and tenant
		if (!req.user || !req.user.tenantId) {
			res.status(401).json({ error: 'Unauthorized: No user or tenant information' });
			return;
		}

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

		const tenantPrisma = await getPrismaForTenant(req.user.tenantId);
		const event = await tenantPrisma.event.create({
			data: {
				name,
				...(description ? { description } : {}),
				...(imageUrl ? { imageUrl } : {}),
				...(startDate ? { startsAt: startDate } : {}),
				...(endDate ? { endsAt: endDate } : {}),
			},
		});

		res.status(201).json({ data: event });
	} catch (error) {
		console.error('Error creating event:', error);
		res.status(500).json({ error: 'Failed to create event' });
	}
});

export default router;
