import { Router, Request, Response } from 'express';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);
router.use(requireSuperAdmin);

router.get('/tenants', async (_req: Request, res: Response): Promise<void> => {
	const tenants = await prisma.tenant.findMany({
		orderBy: { createdAt: 'asc' },
		include: { _count: { select: { users: true, events: true } } },
	});
	res.json({ data: tenants });
});

router.get('/events', async (_req: Request, res: Response): Promise<void> => {
	const events = await prisma.event.findMany({
		orderBy: [{ startsAt: 'desc' }],
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
			_count: { select: { tickets: true, scans: true } },
		},
	});

	res.json({ data: events });
});

router.get('/users', async (_req: Request, res: Response): Promise<void> => {
	const users = await prisma.user.findMany({
		orderBy: [{ createdAt: 'desc' }],
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
		},
	});

	res.json({ data: users });
});

router.patch('/users/:id/role', async (req: Request, res: Response): Promise<void> => {
	const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const { role } = req.body as { role?: string };
	const allowedRoles = ['owner', 'admin', 'scanner'];

	if (!userId) {
		res.status(400).json({ error: 'Invalid user id' });
		return;
	}

	if (!role || !allowedRoles.includes(role)) {
		res.status(400).json({ error: 'role must be one of: owner, admin, scanner' });
		return;
	}

	const existing = await prisma.user.findUnique({ where: { id: userId } });
	if (!existing) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { role },
		include: { tenant: { select: { id: true, name: true, plan: true } } },
	});

	res.json({ data: updated });
});

router.post('/tenants/:id/upgrade', async (req: Request, res: Response): Promise<void> => {
	const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!tenantId) {
		res.status(400).json({ error: 'Invalid tenant id' });
		return;
	}
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
	if (!tenant) {
		res.status(404).json({ error: 'Tenant not found' });
		return;
	}
	const updated = await prisma.tenant.update({
		where: { id: tenantId },
		data: { plan: 'pro' },
	});
	res.json({ data: updated });
});

router.post('/tenants/:id/downgrade', async (req: Request, res: Response): Promise<void> => {
	const tenantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!tenantId) {
		res.status(400).json({ error: 'Invalid tenant id' });
		return;
	}
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
	if (!tenant) {
		res.status(404).json({ error: 'Tenant not found' });
		return;
	}
	const updated = await prisma.tenant.update({
		where: { id: tenantId },
		data: { plan: 'free' },
	});
	res.json({ data: updated });
});

export default router;
