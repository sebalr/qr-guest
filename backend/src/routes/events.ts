import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(['owner', 'admin']));

router.get('/', async (req: Request, res: Response): Promise<void> => {
	const events = await prisma.event.findMany({
		where: { tenantId: req.user!.tenantId },
		orderBy: { createdAt: 'desc' },
	});
	res.json({ data: events });
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
	const eventId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const event = await prisma.event.findFirst({
		where: { id: eventId, tenantId: req.user!.tenantId },
	});
	if (!event) {
		res.status(404).json({ error: 'Event not found' });
		return;
	}
	res.json({ data: event });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
	const { name, description, imageUrl } = req.body;
	const startsAt = req.body.startsAt ?? req.body.starts_at;
	const endsAt = req.body.endsAt ?? req.body.ends_at;

	if (!name) {
		res.status(400).json({ error: 'name is required' });
		return;
	}

	const event = await prisma.event.create({
		data: {
			tenantId: req.user!.tenantId,
			name,
			...(description ? { description } : {}),
			...(imageUrl ? { imageUrl } : {}),
			...(startsAt ? { startsAt: new Date(startsAt) } : {}),
			...(endsAt ? { endsAt: new Date(endsAt) } : {}),
		},
	});

	res.status(201).json({ data: event });
});

export default router;
