import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

/** Minimum reCAPTCHA Enterprise score to accept (0.0 = bot, 1.0 = human). */
const RECAPTCHA_MIN_SCORE = 0.5;

/**
 * Verifies a reCAPTCHA Enterprise token via the Assessment API.
 * Returns true when:
 *   - Enterprise is not configured (dev mode) — all three env vars must be set to enable.
 *   - The token is valid and the risk score meets the minimum threshold.
 *
 * Docs: https://cloud.google.com/recaptcha/docs/create-assessment
 */
async function verifyRecaptchaEnterprise(token: string | undefined, action: string): Promise<boolean> {
	const projectId = process.env.RECAPTCHA_PROJECT_ID;
	const apiKey = process.env.RECAPTCHA_API_KEY;
	const siteKey = process.env.RECAPTCHA_SITE_KEY;

	// Skip verification when not fully configured (dev / test environment)
	if (!projectId || !apiKey || !siteKey) return true;
	if (!token) return false;

	try {
		const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
		const res = await fetch(url, {
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

		if (!res.ok) return false;

		const data = (await res.json()) as {
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

router.post('/register', async (req: Request, res: Response): Promise<void> => {
	const { tenantName, email, password, recaptchaToken } = req.body;
	if (!tenantName || !email || !password) {
		res.status(400).json({ error: 'tenantName, email, and password are required' });
		return;
	}

	const captchaOk = await verifyRecaptchaEnterprise(recaptchaToken as string | undefined, 'register');
	if (!captchaOk) {
		res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
		return;
	}

	const existing = await prisma.user.findUnique({ where: { email } });
	if (existing) {
		res.status(409).json({ error: 'Email already in use' });
		return;
	}

	const passwordHash = await bcrypt.hash(password, 12);

	const tenant = await prisma.tenant.create({ data: { name: tenantName } });
	const user = await prisma.user.create({
		data: {
			tenantId: tenant.id,
			email,
			passwordHash,
			role: 'owner',
			isSuperAdmin: isSuperAdminEmail(email),
		},
	});

	const secret = process.env.JWT_SECRET!;
	const token = jwt.sign({ userId: user.id, tenantId: tenant.id, role: user.role, isSuperAdmin: user.isSuperAdmin }, secret, {
		expiresIn: '7d',
	});

	res.status(201).json({ data: { token } });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
	const { email, password, recaptchaToken } = req.body;
	if (!email || !password) {
		res.status(400).json({ error: 'email and password are required' });
		return;
	}

	const captchaOk = await verifyRecaptchaEnterprise(recaptchaToken as string | undefined, 'login');
	if (!captchaOk) {
		res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
		return;
	}

	const user = await prisma.user.findUnique({
		where: { email },
		include: { tenant: true },
	});

	if (!user) {
		res.status(401).json({ error: 'Invalid credentials' });
		return;
	}

	const valid = await bcrypt.compare(password, user.passwordHash);
	if (!valid) {
		res.status(401).json({ error: 'Invalid credentials' });
		return;
	}

	if (user.role === 'scanner' && user.tenant.plan === 'free') {
		res.status(403).json({ error: 'Scanner role not allowed on free plan' });
		return;
	}

	const secret = process.env.JWT_SECRET!;
	const token = jwt.sign({ userId: user.id, tenantId: user.tenantId, role: user.role, isSuperAdmin: user.isSuperAdmin }, secret, {
		expiresIn: '7d',
	});

	res.json({ data: { token } });
});

export default router;
