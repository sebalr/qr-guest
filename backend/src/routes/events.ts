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
		orderBy: { startsAt: 'asc' },
	});
	res.json({ data: events });
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
	const { name } = req.body;
	const startsAt = req.body.startsAt ?? req.body.starts_at;
	const endsAt = req.body.endsAt ?? req.body.ends_at;
	if (!name || !startsAt || !endsAt) {
		res.status(400).json({ error: 'name, startsAt, and endsAt are required' });
		return;
	}

	const event = await prisma.event.create({
		data: {
			tenantId: req.user!.tenantId,
			name,
			startsAt: new Date(startsAt),
			endsAt: new Date(endsAt),
		},
	});

	res.status(201).json({ data: event });
});

export default router;
