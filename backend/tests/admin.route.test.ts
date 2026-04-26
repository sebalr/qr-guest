import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
	currentUser: {
		userId: 'user-1',
		tenantId: 'tenant-1',
		role: 'owner',
		isSuperAdmin: false,
		email: 'owner@example.com',
	},
}));

const prismaMocks = vi.hoisted(() => ({
	userTenantFindMany: vi.fn(),
	userFindUnique: vi.fn(),
	userCreate: vi.fn(),
	userTenantCreate: vi.fn(),
	userTenantFindUnique: vi.fn(),
	userTenantUpdate: vi.fn(),
	tenantFindUnique: vi.fn(),
	tenantFindMany: vi.fn(),
	tenantUpdate: vi.fn(),
}));

const tenantPrismaMocks = vi.hoisted(() => ({
	eventCount: vi.fn(),
	eventFindMany: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
	default: {
		userTenant: {
			findMany: prismaMocks.userTenantFindMany,
			create: prismaMocks.userTenantCreate,
			findUnique: prismaMocks.userTenantFindUnique,
			update: prismaMocks.userTenantUpdate,
		},
		user: {
			findUnique: prismaMocks.userFindUnique,
			create: prismaMocks.userCreate,
		},
		tenant: {
			findUnique: prismaMocks.tenantFindUnique,
			findMany: prismaMocks.tenantFindMany,
			update: prismaMocks.tenantUpdate,
		},
	},
	getPrismaForTenant: vi.fn(async () => ({
		event: {
			count: tenantPrismaMocks.eventCount,
			findMany: tenantPrismaMocks.eventFindMany,
		},
	})),
}));

vi.mock('../src/middleware/auth', () => ({
	authMiddleware: (req: any, _res: any, next: any) => {
		req.user = authState.currentUser;
		next();
	},
}));

vi.mock('../src/lib/authEmails', () => ({
	sendInvitationEmail: vi.fn(),
}));

vi.mock('../src/lib/userAuthTokens', () => ({
	AUTH_TOKEN_TYPES: { invitation: 'invitation' },
	issueUserAuthToken: vi.fn(async () => ({ token: 'invite-token' })),
}));

import adminRouter from '../src/routes/admin';

function createApp() {
	const app = express();
	app.use(express.json());
	app.use('/admin', adminRouter);
	return app;
}

describe('admin route tenant scoping', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		authState.currentUser = {
			userId: 'user-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: false,
			email: 'owner@example.com',
		};

		prismaMocks.userTenantFindMany.mockResolvedValue([]);
		prismaMocks.tenantFindUnique.mockResolvedValue({ id: 'tenant-1', name: 'Tenant One', plan: 'free' });
		tenantPrismaMocks.eventFindMany.mockResolvedValue([]);
	});

	it('requires tenantId for super admin GET /admin/users', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		const app = createApp();
		const res = await request(app).get('/admin/users');

		expect(res.status).toBe(400);
		expect(res.body.error).toContain('tenantId is required');
		expect(prismaMocks.userTenantFindMany).not.toHaveBeenCalled();
	});

	it('allows super admin GET /admin/users with explicit tenantId', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		prismaMocks.tenantFindUnique.mockResolvedValue({ id: 'tenant-2', name: 'Tenant Two', plan: 'pro' });
		prismaMocks.userTenantFindMany.mockResolvedValue([
			{
				role: 'admin',
				tenant: { id: 'tenant-2', name: 'Tenant Two', plan: 'pro' },
				user: {
					id: 'user-2',
					email: 'admin@tenant2.com',
					isSuperAdmin: false,
					createdAt: new Date('2026-01-01T00:00:00.000Z'),
					passwordHash: 'hash',
					emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
				},
			},
		]);

		const app = createApp();
		const res = await request(app).get('/admin/users').query({ tenantId: 'tenant-2' });

		expect(res.status).toBe(200);
		expect(prismaMocks.userTenantFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-2' } }));
		expect(res.body.data).toHaveLength(1);
		expect(res.body.data[0].tenantId).toBe('tenant-2');
	});

	it('ignores tenantId override for non-super admin GET /admin/users', async () => {
		authState.currentUser = {
			userId: 'owner-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: false,
			email: 'owner@example.com',
		};

		const app = createApp();
		const res = await request(app).get('/admin/users').query({ tenantId: 'tenant-2' });

		expect(res.status).toBe(200);
		expect(prismaMocks.userTenantFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
	});

	it('requires super admin and tenantId for GET /admin/events', async () => {
		authState.currentUser = {
			userId: 'owner-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: false,
			email: 'owner@example.com',
		};

		const app = createApp();
		const forbiddenRes = await request(app).get('/admin/events').query({ tenantId: 'tenant-1' });
		expect(forbiddenRes.status).toBe(403);

		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		const badRequestRes = await request(app).get('/admin/events');
		expect(badRequestRes.status).toBe(400);
		expect(badRequestRes.body.error).toContain('tenantId query parameter is required');
	});
});
