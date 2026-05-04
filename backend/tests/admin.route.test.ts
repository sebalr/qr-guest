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
	tenantCreate: vi.fn(),
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
			create: prismaMocks.tenantCreate,
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
import { sendInvitationEmail } from '../src/lib/authEmails';
import { issueUserAuthToken } from '../src/lib/userAuthTokens';

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
		prismaMocks.userFindUnique.mockResolvedValue(null);
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

	it('creates tenant and invites admin with POST /admin/tenants', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		prismaMocks.userFindUnique.mockResolvedValue(null);
		prismaMocks.tenantCreate.mockResolvedValue({
			id: 'tenant-2',
			name: 'New Tenant',
			plan: 'free',
			createdAt: new Date('2026-05-01T12:00:00.000Z'),
		});
		prismaMocks.userCreate.mockResolvedValue({
			id: 'user-2',
			email: 'admin@tenant2.com',
			passwordHash: null,
			emailVerifiedAt: null,
			isSuperAdmin: false,
			createdAt: new Date('2026-05-01T12:01:00.000Z'),
		});
		prismaMocks.userTenantCreate.mockResolvedValue({
			role: 'admin',
			tenant: {
				id: 'tenant-2',
				name: 'New Tenant',
				plan: 'free',
				createdAt: new Date('2026-05-01T12:00:00.000Z'),
			},
			user: {
				id: 'user-2',
				email: 'admin@tenant2.com',
				passwordHash: null,
				emailVerifiedAt: null,
				isSuperAdmin: false,
				createdAt: new Date('2026-05-01T12:01:00.000Z'),
			},
		});
		vi.mocked(issueUserAuthToken).mockResolvedValue({ token: 'invite-token' } as Awaited<ReturnType<typeof issueUserAuthToken>>);
		vi.mocked(sendInvitationEmail).mockResolvedValue(undefined);

		const app = createApp();
		const res = await request(app).post('/admin/tenants').send({
			tenantName: ' New Tenant ',
			adminEmail: 'Admin@Tenant2.com',
		});

		expect(res.status).toBe(201);
		expect(prismaMocks.tenantCreate).toHaveBeenCalledWith({ data: { name: 'New Tenant', plan: 'free' } });
		expect(prismaMocks.userCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ email: 'admin@tenant2.com' }),
			}),
		);
		expect(issueUserAuthToken).toHaveBeenCalledWith({
			userId: 'user-2',
			type: 'invitation',
			ttlHours: 24 * 7,
		});
		expect(sendInvitationEmail).toHaveBeenCalled();
		expect(res.body.data.tenant.name).toBe('New Tenant');
		expect(res.body.data.user.email).toBe('admin@tenant2.com');
		expect(res.body.data.user.accountStatus).toBe('invited');
		expect(res.body.data.user.emailDispatched).toBe(true);
	});

	it('forbids POST /admin/tenants for non-super-admin', async () => {
		authState.currentUser = {
			userId: 'owner-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: false,
			email: 'owner@example.com',
		};

		const app = createApp();
		const res = await request(app).post('/admin/tenants').send({
			tenantName: 'Tenant X',
			adminEmail: 'admin@tenantx.com',
		});

		expect(res.status).toBe(403);
		expect(prismaMocks.tenantCreate).not.toHaveBeenCalled();
	});

	it('validates required and email format for POST /admin/tenants', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		const app = createApp();

		const missingFields = await request(app).post('/admin/tenants').send({
			tenantName: '',
			adminEmail: '',
		});
		expect(missingFields.status).toBe(400);
		expect(missingFields.body.error).toContain('tenantName and adminEmail are required');

		const invalidEmail = await request(app).post('/admin/tenants').send({
			tenantName: 'Tenant Y',
			adminEmail: 'not-an-email',
		});
		expect(invalidEmail.status).toBe(400);
		expect(invalidEmail.body.error).toContain('adminEmail must be valid');
	});

	it('returns conflict when admin email already exists in POST /admin/tenants', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		prismaMocks.userFindUnique.mockResolvedValueOnce({ id: 'existing-user' });

		const app = createApp();
		const res = await request(app).post('/admin/tenants').send({
			tenantName: 'Tenant Z',
			adminEmail: 'admin@tenantz.com',
		});

		expect(res.status).toBe(409);
		expect(res.body.error).toContain('Email already in use');
		expect(prismaMocks.tenantCreate).not.toHaveBeenCalled();
	});

	it('keeps tenant and user creation when invitation email dispatch fails', async () => {
		authState.currentUser = {
			userId: 'su-1',
			tenantId: 'tenant-1',
			role: 'owner',
			isSuperAdmin: true,
			email: 'su@example.com',
		};

		prismaMocks.userFindUnique.mockResolvedValue(null);
		prismaMocks.tenantCreate.mockResolvedValue({
			id: 'tenant-3',
			name: 'Tenant Three',
			plan: 'free',
			createdAt: new Date('2026-05-01T12:00:00.000Z'),
		});
		prismaMocks.userCreate.mockResolvedValue({
			id: 'user-3',
			email: 'admin@tenant3.com',
			passwordHash: null,
			emailVerifiedAt: null,
			isSuperAdmin: false,
			createdAt: new Date('2026-05-01T12:01:00.000Z'),
		});
		prismaMocks.userTenantCreate.mockResolvedValue({
			role: 'admin',
			tenant: {
				id: 'tenant-3',
				name: 'Tenant Three',
				plan: 'free',
				createdAt: new Date('2026-05-01T12:00:00.000Z'),
			},
			user: {
				id: 'user-3',
				email: 'admin@tenant3.com',
				passwordHash: null,
				emailVerifiedAt: null,
				isSuperAdmin: false,
				createdAt: new Date('2026-05-01T12:01:00.000Z'),
			},
		});
		vi.mocked(issueUserAuthToken).mockResolvedValue({ token: 'invite-token' } as Awaited<ReturnType<typeof issueUserAuthToken>>);
		vi.mocked(sendInvitationEmail).mockRejectedValue(new Error('SMTP down'));

		const app = createApp();
		const res = await request(app).post('/admin/tenants').send({
			tenantName: 'Tenant Three',
			adminEmail: 'admin@tenant3.com',
		});

		expect(res.status).toBe(201);
		expect(res.body.data.user.emailDispatched).toBe(false);
		expect(prismaMocks.tenantCreate).toHaveBeenCalled();
		expect(prismaMocks.userCreate).toHaveBeenCalled();
		expect(prismaMocks.userTenantCreate).toHaveBeenCalled();
	});
});
