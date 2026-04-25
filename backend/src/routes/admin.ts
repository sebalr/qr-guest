import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { requireSuperAdmin } from '../middleware/roles';

const router = Router();

router.use(authMiddleware);

type TenantScopedRole = 'admin' | 'scanner';
const TENANT_ALLOWED_ROLES: TenantScopedRole[] = ['admin', 'scanner'];

function canManageTenantUsers(req: Request): boolean {
	const user = req.user;
	if (!user) return false;
	if (user.isSuperAdmin) return true;
	return user.role === 'owner' || user.role === 'admin';
}

// Tenant user list for owner/admin (and super admin).
router.get('/users', async (req: Request, res: Response): Promise<void> => {
	if (!canManageTenantUsers(req)) {
		res.status(403).json({ error: 'Forbidden: insufficient role' });
		return;
	}

	const where = req.user!.isSuperAdmin ? undefined : { tenantId: req.user!.tenantId };
	const users = await prisma.user.findMany({
		where,
		orderBy: [{ createdAt: 'desc' }],
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
		},
	});

	res.json({ data: users });
});

// Tenant user creation by owner/admin (and super admin).
router.post('/users', async (req: Request, res: Response): Promise<void> => {
	if (!canManageTenantUsers(req)) {
		res.status(403).json({ error: 'Forbidden: insufficient role' });
		return;
	}

	const { email, password, role } = req.body as {
		email?: string;
		password?: string;
		role?: string;
	};

	if (!email || !password || !role) {
		res.status(400).json({ error: 'email, password, and role are required' });
		return;
	}

	if (!TENANT_ALLOWED_ROLES.includes(role as TenantScopedRole)) {
		res.status(400).json({ error: 'role must be one of: admin, scanner' });
		return;
	}

	if (password.length < 8) {
		res.status(400).json({ error: 'password must be at least 8 characters' });
		return;
	}

	const normalizedEmail = email.trim().toLowerCase();

	const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
	if (existing) {
		res.status(409).json({ error: 'Email already in use' });
		return;
	}

	const passwordHash = await bcrypt.hash(password, 12);

	const user = await prisma.user.create({
		data: {
			tenantId: req.user!.tenantId,
			email: normalizedEmail,
			passwordHash,
			role,
			isSuperAdmin: false,
		},
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
		},
	});

	res.status(201).json({ data: user });
});

// Tenant user role changes by owner/admin (and super admin).
router.patch('/users/:id/role', async (req: Request, res: Response): Promise<void> => {
	if (!canManageTenantUsers(req)) {
		res.status(403).json({ error: 'Forbidden: insufficient role' });
		return;
	}

	const userId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	const { role } = req.body as { role?: string };

	if (!userId) {
		res.status(400).json({ error: 'Invalid user id' });
		return;
	}

	if (!role || !TENANT_ALLOWED_ROLES.includes(role as TenantScopedRole)) {
		res.status(400).json({ error: 'role must be one of: admin, scanner' });
		return;
	}

	const existing = await prisma.user.findUnique({ where: { id: userId } });
	if (!existing) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	if (!req.user!.isSuperAdmin && existing.tenantId !== req.user!.tenantId) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	if (existing.isSuperAdmin) {
		res.status(403).json({ error: 'Cannot modify super admin users' });
		return;
	}

	if (existing.role === 'owner') {
		res.status(403).json({ error: 'Owner role is immutable' });
		return;
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { role },
		include: { tenant: { select: { id: true, name: true, plan: true } } },
	});

	res.json({ data: updated });
});

router.get('/tenants', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
	const tenants = await prisma.tenant.findMany({
		orderBy: { createdAt: 'asc' },
		include: { _count: { select: { users: true, events: true } } },
	});
	res.json({ data: tenants });
});

router.get('/events', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
	const events = await prisma.event.findMany({
		orderBy: [{ startsAt: 'desc' }],
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
			_count: { select: { tickets: true, scans: true } },
		},
	});

	res.json({ data: events });
});

router.post('/tenants/:id/upgrade', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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

router.post('/tenants/:id/downgrade', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
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
