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

	if (req.user!.isSuperAdmin) {
		// Super admin sees all users
		const users = await prisma.user.findMany({
			orderBy: [{ createdAt: 'desc' }],
			include: {
				userTenants: {
					include: { tenant: { select: { id: true, name: true, plan: true } } },
				},
			},
		});

		res.json({
			data: users.map(u => ({
				id: u.id,
				email: u.email,
				isSuperAdmin: u.isSuperAdmin,
				createdAt: u.createdAt,
				tenants: u.userTenants.map(ut => ({
					id: ut.tenantId,
					name: ut.tenant.name,
					plan: ut.tenant.plan,
					role: ut.role,
				})),
			})),
		});
	} else {
		// Tenant owner/admin sees users in their tenant
		const userTenants = await prisma.userTenant.findMany({
			where: { tenantId: req.user!.tenantId },
			include: {
				user: true,
				tenant: { select: { id: true, name: true, plan: true } },
			},
			orderBy: { user: { createdAt: 'desc' } },
		});

		res.json({
			data: userTenants.map(ut => ({
				id: ut.user.id,
				email: ut.user.email,
				role: ut.role,
				isSuperAdmin: ut.user.isSuperAdmin,
				createdAt: ut.user.createdAt,
				tenant: {
					id: ut.tenant.id,
					name: ut.tenant.name,
					plan: ut.tenant.plan,
				},
			})),
		});
	}
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
			email: normalizedEmail,
			passwordHash,
			isSuperAdmin: false,
		},
	});

	const userTenant = await prisma.userTenant.create({
		data: {
			userId: user.id,
			tenantId: req.user!.tenantId,
			role,
		},
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
			user: true,
		},
	});

	res.status(201).json({
		data: {
			id: userTenant.user.id,
			email: userTenant.user.email,
			role: userTenant.role,
			isSuperAdmin: userTenant.user.isSuperAdmin,
			createdAt: userTenant.user.createdAt,
			tenant: {
				id: userTenant.tenant.id,
				name: userTenant.tenant.name,
				plan: userTenant.tenant.plan,
			},
		},
	});
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

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) {
		res.status(404).json({ error: 'User not found' });
		return;
	}

	if (user.isSuperAdmin) {
		res.status(403).json({ error: 'Cannot modify super admin users' });
		return;
	}

	// Check if user has access to this tenant
	const userTenant = await prisma.userTenant.findUnique({
		where: { userId_tenantId: { userId, tenantId: req.user!.tenantId } },
	});

	if (!userTenant) {
		res.status(404).json({ error: 'User not found in this tenant' });
		return;
	}

	// Cannot change owner role
	if (userTenant.role === 'owner') {
		res.status(403).json({ error: 'Owner role is immutable' });
		return;
	}

	const updated = await prisma.userTenant.update({
		where: { userId_tenantId: { userId, tenantId: req.user!.tenantId } },
		data: { role },
		include: {
			tenant: { select: { id: true, name: true, plan: true } },
			user: true,
		},
	});

	res.json({
		data: {
			id: updated.user.id,
			email: updated.user.email,
			role: updated.role,
			isSuperAdmin: updated.user.isSuperAdmin,
			createdAt: updated.user.createdAt,
			tenant: {
				id: updated.tenant.id,
				name: updated.tenant.name,
				plan: updated.tenant.plan,
			},
		},
	});
});

router.get('/tenants', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
	const tenants = await prisma.tenant.findMany({
		orderBy: { createdAt: 'asc' },
		include: { _count: { select: { userTenants: true, events: true } } },
	});
	res.json({
		data: tenants.map(t => ({
			id: t.id,
			name: t.name,
			plan: t.plan,
			createdAt: t.createdAt,
			userCount: t._count.userTenants,
			eventCount: t._count.events,
		})),
	});
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
