import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => {
	const txTenantCreate = vi.fn();
	const txUserCreate = vi.fn();
	const txUserTenantCreate = vi.fn();
	const transaction = vi.fn(async (callback: any) =>
		callback({
			tenant: { create: txTenantCreate },
			user: { create: txUserCreate },
			userTenant: { create: txUserTenantCreate },
		}),
	);

	return {
		txTenantCreate,
		txUserCreate,
		txUserTenantCreate,
		transaction,
		userFindUnique: vi.fn(),
		userUpdate: vi.fn(),
		userTenantFindUnique: vi.fn(),
		getPrismaForTenant: vi.fn(async () => ({ $executeRaw: vi.fn() })),
	};
});

const tokenMocks = vi.hoisted(() => ({
	issueUserAuthToken: vi.fn(),
	findActiveUserAuthToken: vi.fn(),
	consumeUserAuthToken: vi.fn(),
}));

const emailMocks = vi.hoisted(() => ({
	sendVerificationEmail: vi.fn(),
	sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
	default: {
		user: { findUnique: prismaMocks.userFindUnique, update: prismaMocks.userUpdate },
		userTenant: { findUnique: prismaMocks.userTenantFindUnique },
		$transaction: prismaMocks.transaction,
	},
	getPrismaForTenant: prismaMocks.getPrismaForTenant,
}));

vi.mock('../src/lib/userAuthTokens', async () => {
	const actual = await vi.importActual('../src/lib/userAuthTokens');
	return {
		...actual,
		issueUserAuthToken: tokenMocks.issueUserAuthToken,
		findActiveUserAuthToken: tokenMocks.findActiveUserAuthToken,
		consumeUserAuthToken: tokenMocks.consumeUserAuthToken,
	};
});

vi.mock('../src/lib/authEmails', () => ({
	sendVerificationEmail: emailMocks.sendVerificationEmail,
	sendPasswordResetEmail: emailMocks.sendPasswordResetEmail,
}));

import authRouter from '../src/routes/auth';

function createApp() {
	const app = express();
	app.use(express.json());
	app.use('/auth', authRouter);
	return app;
}

describe('auth routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.JWT_SECRET = 'test-secret';
	});

	it('creates a new account and sends a verification email', async () => {
		prismaMocks.userFindUnique.mockResolvedValue(null);
		prismaMocks.txTenantCreate.mockResolvedValue({ id: 'tenant-1', name: 'Acme Events' });
		prismaMocks.txUserCreate.mockResolvedValue({ id: 'user-1', email: 'owner@example.com', isSuperAdmin: false });
		prismaMocks.txUserTenantCreate.mockResolvedValue({ id: 'membership-1' });
		tokenMocks.issueUserAuthToken.mockResolvedValue({ token: 'verify-token', expiresAt: new Date() });
		emailMocks.sendVerificationEmail.mockResolvedValue(undefined);

		const app = createApp();
		const res = await request(app).post('/auth/register').send({
			tenantName: 'Acme Events',
			email: 'owner@example.com',
			password: 'password123',
		});

		expect(res.status).toBe(201);
		expect(res.body.data.requiresEmailVerification).toBe(true);
		expect(tokenMocks.issueUserAuthToken).toHaveBeenCalledWith({ userId: 'user-1', type: 'email_verification', ttlHours: 24 });
		expect(emailMocks.sendVerificationEmail).toHaveBeenCalledWith({
			to: 'owner@example.com',
			tenantName: 'Acme Events',
			token: 'verify-token',
		});
	});

	it('rejects login for users who have not verified their email yet', async () => {
		prismaMocks.userFindUnique.mockResolvedValue({
			id: 'user-1',
			email: 'owner@example.com',
			passwordHash: await bcrypt.hash('password123', 12),
			emailVerifiedAt: null,
			isSuperAdmin: false,
			userTenants: [{ tenantId: 'tenant-1', role: 'owner', tenant: { id: 'tenant-1', name: 'Acme Events' } }],
		});

		const app = createApp();
		const res = await request(app).post('/auth/login').send({
			email: 'owner@example.com',
			password: 'password123',
		});

		expect(res.status).toBe(403);
		expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
	});

	it('sends password reset emails only for verified users', async () => {
		prismaMocks.userFindUnique.mockResolvedValue({
			id: 'user-1',
			email: 'owner@example.com',
			passwordHash: 'existing-hash',
			emailVerifiedAt: new Date(),
			isSuperAdmin: false,
		});
		tokenMocks.issueUserAuthToken.mockResolvedValue({ token: 'reset-token', expiresAt: new Date() });
		emailMocks.sendPasswordResetEmail.mockResolvedValue(undefined);

		const app = createApp();
		const res = await request(app).post('/auth/forgot-password').send({ email: 'owner@example.com' });

		expect(res.status).toBe(200);
		expect(tokenMocks.issueUserAuthToken).toHaveBeenCalledWith({ userId: 'user-1', type: 'password_reset', ttlHours: 1 });
		expect(emailMocks.sendPasswordResetEmail).toHaveBeenCalledWith({ to: 'owner@example.com', token: 'reset-token' });
	});

	it('accepts invitations, sets a password, and returns an auth token', async () => {
		tokenMocks.findActiveUserAuthToken.mockResolvedValue({
			id: 'token-row-1',
			userId: 'user-1',
			user: {
				id: 'user-1',
				email: 'invitee@example.com',
				isSuperAdmin: false,
				emailVerifiedAt: null,
				userTenants: [{ tenantId: 'tenant-1', role: 'scanner', tenant: { id: 'tenant-1', name: 'Acme Events' } }],
			},
		});
		prismaMocks.userUpdate.mockResolvedValue({ id: 'user-1' });

		const app = createApp();
		const res = await request(app).post('/auth/accept-invitation').send({ token: 'invite-token', password: 'password123' });

		expect(res.status).toBe(200);
		expect(res.body.data.token).toEqual(expect.any(String));
		expect(prismaMocks.userUpdate).toHaveBeenCalled();
		expect(tokenMocks.consumeUserAuthToken).toHaveBeenCalledWith('token-row-1');
	});
});
