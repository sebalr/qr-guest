import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { getAccountStatus } from '../lib/accountStatus';
import { sendPasswordResetEmail, sendVerificationEmail } from '../lib/authEmails';
import { initializeSingleTenantSchema } from '../lib/tenantMigrations/runner';
import { AUTH_TOKEN_TYPES, consumeUserAuthToken, findActiveUserAuthToken, issueUserAuthToken } from '../lib/userAuthTokens';
import prisma from '../prisma';

const router = Router();
const DEFAULT_SUPER_ADMIN_EMAIL = 'larrieu.sebastian@gmail.com';

function isSuperAdminEmail(email: string): boolean {
	const configured = DEFAULT_SUPER_ADMIN_EMAIL;
	const emailList = configured
		.split(',')
		.map(value => value.trim().toLowerCase())
		.filter(Boolean);

	return emailList.includes(email.trim().toLowerCase());
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function signAuthToken(params: { userId: string; tenantId: string; role: string; isSuperAdmin: boolean; email: string }): string {
	const secret = process.env.JWT_SECRET!;
	return jwt.sign(params, secret, { expiresIn: '7d' });
}

function createAuthPayload(user: {
	id: string;
	email: string;
	isSuperAdmin: boolean;
	userTenants: Array<{ tenantId: string; role: string; tenant: { id: string; name: string } }>;
}) {
	if (user.userTenants.length === 1) {
		const userTenant = user.userTenants[0];
		return {
			token: signAuthToken({
				userId: user.id,
				tenantId: userTenant.tenantId,
				role: userTenant.role,
				isSuperAdmin: user.isSuperAdmin,
				email: user.email,
			}),
		};
	}

	return {
		userId: user.id,
		tenants: user.userTenants.map(userTenant => ({
			id: userTenant.tenantId,
			name: userTenant.tenant.name,
			role: userTenant.role,
		})),
	};
}

const RECAPTCHA_MIN_SCORE = 0.5;

async function verifyRecaptchaEnterprise(token: string | undefined, action: string): Promise<boolean> {
	const projectId = process.env.RECAPTCHA_PROJECT_ID;
	const apiKey = process.env.RECAPTCHA_API_KEY;
	const siteKey = process.env.RECAPTCHA_SITE_KEY;

	if (!projectId || !apiKey || !siteKey) return true;
	if (!token) return false;

	try {
		const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				event: {
					token,
					siteKey,
					expectedAction: action,
				},
			}),
		});

		if (!response.ok) return false;

		const data = (await response.json()) as {
			tokenProperties?: { valid: boolean; action?: string };
			riskAnalysis?: { score: number };
		};

		if (!data.tokenProperties?.valid) return false;
		const score = data.riskAnalysis?.score ?? 0;
		return score >= RECAPTCHA_MIN_SCORE;
	} catch {
		return false;
	}
}

async function initializeTenantSchema(tenantId: string): Promise<void> {
	const summary = await initializeSingleTenantSchema(tenantId);
	if (summary.failed.length > 0) {
		throw new Error(`Failed to initialize tenant schema: ${summary.failed[0].error}`);
	}
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
	const { tenantName, email, password, recaptchaToken } = req.body as {
		tenantName?: string;
		email?: string;
		password?: string;
		recaptchaToken?: string;
	};

	if (!tenantName || !email || !password) {
		res.status(400).json({ error: 'tenantName, email, and password are required' });
		return;
	}

	const captchaOk = await verifyRecaptchaEnterprise(recaptchaToken, 'register');
	if (!captchaOk) {
		res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
		return;
	}

	const normalizedEmail = normalizeEmail(email);
	const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
	if (existing) {
		res.status(409).json({ error: 'Email already in use' });
		return;
	}

	const passwordHash = await bcrypt.hash(password, 12);

	try {
		const { tenant, user } = await prisma.$transaction(async tx => {
			const createdTenant = await tx.tenant.create({ data: { name: tenantName.trim() } });
			const createdUser = await tx.user.create({
				data: {
					email: normalizedEmail,
					passwordHash,
					isSuperAdmin: isSuperAdminEmail(normalizedEmail),
				},
			});

			await tx.userTenant.create({
				data: {
					userId: createdUser.id,
					tenantId: createdTenant.id,
					role: 'owner',
				},
			});

			return { tenant: createdTenant, user: createdUser };
		});

		await initializeTenantSchema(tenant.id);

		const verification = await issueUserAuthToken({
			userId: user.id,
			type: AUTH_TOKEN_TYPES.emailVerification,
			ttlHours: 24,
		});

		let emailDispatched = true;
		try {
			await sendVerificationEmail({
				to: user.email,
				tenantName: tenant.name,
				token: verification.token,
			});
		} catch (error) {
			emailDispatched = false;
			console.error('Verification email dispatch failed:', error);
		}

		res.status(201).json({
			data: {
				requiresEmailVerification: true,
				emailDispatched,
				message: emailDispatched
					? 'Account created. Check your email to verify your account before signing in.'
					: 'Account created, but the verification email could not be sent. Ask an administrator to resend it after email delivery is configured.',
			},
		});
	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({ error: 'Registration failed' });
	}
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
	const { email, password, recaptchaToken } = req.body as {
		email?: string;
		password?: string;
		recaptchaToken?: string;
	};

	if (!email || !password) {
		res.status(400).json({ error: 'email and password are required' });
		return;
	}

	const captchaOk = await verifyRecaptchaEnterprise(recaptchaToken, 'login');
	if (!captchaOk) {
		res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
		return;
	}

	try {
		const user = await prisma.user.findUnique({
			where: { email: normalizeEmail(email) },
			include: {
				userTenants: {
					include: {
						tenant: true,
					},
				},
			},
		});

		if (!user || !user.passwordHash) {
			res.status(401).json({ error: 'Invalid credentials' });
			return;
		}

		const valid = await bcrypt.compare(password, user.passwordHash);
		if (!valid) {
			res.status(401).json({ error: 'Invalid credentials' });
			return;
		}

		const accountStatus = getAccountStatus(user);
		if (accountStatus === 'invited') {
			res.status(403).json({ error: 'Accept your invitation from the email you received before signing in.', code: 'INVITATION_PENDING' });
			return;
		}

		if (accountStatus === 'pending_verification') {
			res.status(403).json({ error: 'Verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
			return;
		}

		if (user.userTenants.length === 0) {
			res.status(401).json({ error: 'User has no associated tenants' });
			return;
		}

		res.json({ data: createAuthPayload(user) });
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Login failed' });
	}
});

router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
	const { email } = req.body as { email?: string };
	if (!email) {
		res.status(400).json({ error: 'email is required' });
		return;
	}

	const user = await prisma.user.findUnique({
		where: { email: normalizeEmail(email) },
		include: {
			userTenants: {
				include: { tenant: true },
			},
		},
	});

	if (!user || getAccountStatus(user) !== 'pending_verification') {
		res.json({ data: { message: 'If the account exists and still needs verification, a new email has been sent.' } });
		return;
	}

	try {
		const verification = await issueUserAuthToken({
			userId: user.id,
			type: AUTH_TOKEN_TYPES.emailVerification,
			ttlHours: 24,
		});

		await sendVerificationEmail({
			to: user.email,
			tenantName: user.userTenants[0]?.tenant.name ?? 'QR Guest',
			token: verification.token,
		});

		res.json({ data: { message: 'Verification email sent.' } });
	} catch (error) {
		console.error('Resend verification error:', error);
		res.status(500).json({ error: 'Unable to send verification email right now.' });
	}
});

router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
	const { token } = req.body as { token?: string };
	if (!token) {
		res.status(400).json({ error: 'token is required' });
		return;
	}

	const tokenRecord = await findActiveUserAuthToken(token, AUTH_TOKEN_TYPES.emailVerification);
	if (!tokenRecord) {
		res.status(400).json({ error: 'Invalid or expired verification token' });
		return;
	}

	await prisma.user.update({
		where: { id: tokenRecord.userId },
		data: { emailVerifiedAt: tokenRecord.user.emailVerifiedAt ?? new Date() },
	});
	await consumeUserAuthToken(tokenRecord.id);

	res.json({ data: { message: 'Email verified successfully. You can now sign in.' } });
});

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
	const { email } = req.body as { email?: string };
	if (!email) {
		res.status(400).json({ error: 'email is required' });
		return;
	}

	const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
	if (!user || !user.emailVerifiedAt || !user.passwordHash) {
		res.json({ data: { message: 'If the account exists, a password reset email has been sent.' } });
		return;
	}

	try {
		const resetToken = await issueUserAuthToken({
			userId: user.id,
			type: AUTH_TOKEN_TYPES.passwordReset,
			ttlHours: 1,
		});

		await sendPasswordResetEmail({
			to: user.email,
			token: resetToken.token,
		});

		res.json({ data: { message: 'If the account exists, a password reset email has been sent.' } });
	} catch (error) {
		console.error('Forgot password error:', error);
		res.status(500).json({ error: 'Unable to send password reset email right now.' });
	}
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
	const { token, password } = req.body as { token?: string; password?: string };
	if (!token || !password) {
		res.status(400).json({ error: 'token and password are required' });
		return;
	}

	if (password.length < 8) {
		res.status(400).json({ error: 'password must be at least 8 characters' });
		return;
	}

	const tokenRecord = await findActiveUserAuthToken(token, AUTH_TOKEN_TYPES.passwordReset);
	if (!tokenRecord || !tokenRecord.user.emailVerifiedAt) {
		res.status(400).json({ error: 'Invalid or expired password reset token' });
		return;
	}

	const passwordHash = await bcrypt.hash(password, 12);
	await prisma.user.update({
		where: { id: tokenRecord.userId },
		data: { passwordHash },
	});
	await consumeUserAuthToken(tokenRecord.id);

	res.json({ data: { message: 'Password updated successfully. You can now sign in.' } });
});

router.post('/accept-invitation', async (req: Request, res: Response): Promise<void> => {
	const { token, password } = req.body as { token?: string; password?: string };
	if (!token || !password) {
		res.status(400).json({ error: 'token and password are required' });
		return;
	}

	if (password.length < 8) {
		res.status(400).json({ error: 'password must be at least 8 characters' });
		return;
	}

	const tokenRecord = await findActiveUserAuthToken(token, AUTH_TOKEN_TYPES.invitation);
	if (!tokenRecord) {
		res.status(400).json({ error: 'Invalid or expired invitation token' });
		return;
	}

	const passwordHash = await bcrypt.hash(password, 12);
	const verifiedAt = tokenRecord.user.emailVerifiedAt ?? new Date();

	await prisma.user.update({
		where: { id: tokenRecord.userId },
		data: {
			passwordHash,
			emailVerifiedAt: verifiedAt,
		},
	});
	await consumeUserAuthToken(tokenRecord.id);

	if (tokenRecord.user.userTenants.length === 0) {
		res.status(400).json({ error: 'Invitation is not attached to a tenant' });
		return;
	}

	res.json({ data: createAuthPayload(tokenRecord.user) });
});

router.post('/select-tenant', async (req: Request, res: Response): Promise<void> => {
	const { userId, tenantId } = req.body as { userId?: string; tenantId?: string };
	if (!userId || !tenantId) {
		res.status(400).json({ error: 'userId and tenantId are required' });
		return;
	}

	try {
		const userTenant = await prisma.userTenant.findUnique({
			where: {
				userId_tenantId: { userId, tenantId },
			},
			include: {
				user: true,
				tenant: true,
			},
		});

		if (!userTenant) {
			res.status(403).json({ error: 'User does not have access to this tenant' });
			return;
		}

		res.json({
			data: {
				token: signAuthToken({
					userId: userTenant.user.id,
					tenantId: userTenant.tenantId,
					role: userTenant.role,
					isSuperAdmin: userTenant.user.isSuperAdmin,
					email: userTenant.user.email,
				}),
			},
		});
	} catch (error) {
		console.error('Select tenant error:', error);
		res.status(500).json({ error: 'Tenant selection failed' });
	}
});

export default router;
