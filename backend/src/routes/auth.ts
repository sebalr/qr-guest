import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma, { getPrismaForTenant } from '../prisma';

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
 *   - Enterprise is not configured (dev mode) - all three env vars must be set to enable.
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

/**
 * Initialize a tenant schema with required tables
 */
async function initializeTenantSchema(tenantId: string): Promise<void> {
	const tenantClient = await getPrismaForTenant(tenantId);

	try {
		// Create tables in tenant-specific schema
		// Note: Schema is set via connection string parameter schema=tenant_{tenantId}
		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS events (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name VARCHAR(255) NOT NULL,
				description TEXT,
				image_url VARCHAR(255),
				starts_at TIMESTAMP WITH TIME ZONE,
				ends_at TIMESTAMP WITH TIME ZONE,
				version INTEGER DEFAULT 0,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`;

		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS tickets (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				event_id UUID NOT NULL REFERENCES events(id),
				guest_id UUID,
				name VARCHAR(255) NOT NULL,
				status VARCHAR(50) DEFAULT 'active',
				version INTEGER DEFAULT 0,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`;

		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS guests (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				name VARCHAR(255) NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`;

		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS scans (
				id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				ticket_id UUID NOT NULL REFERENCES tickets(id),
				event_id UUID NOT NULL REFERENCES events(id),
				device_id VARCHAR(255) NOT NULL,
				user_id UUID NOT NULL,
				dedupe_key VARCHAR(255) UNIQUE,
				scanned_at TIMESTAMP WITH TIME ZONE NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`;

		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS sync_state (
				device_id VARCHAR(255) NOT NULL,
				event_id UUID NOT NULL,
				last_ticket_version INTEGER DEFAULT 0,
				last_scan_cursor TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (device_id, event_id)
			)
		`;

		await tenantClient.$executeRaw`
			CREATE TABLE IF NOT EXISTS device_event_debug_data (
				id UUID PRIMARY KEY,
				event_id UUID NOT NULL,
				device_id VARCHAR(255) NOT NULL,
				user_id UUID NOT NULL,
				payload JSONB NOT NULL,
				created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`;

		// Create indexes
		await tenantClient.$executeRaw`
			CREATE INDEX IF NOT EXISTS idx_device_event_debug_data_event_created
			ON device_event_debug_data(event_id, created_at)
		`;

		await tenantClient.$executeRaw`
			CREATE INDEX IF NOT EXISTS idx_scans_event_id
			ON scans(event_id)
		`;

		await tenantClient.$executeRaw`
			CREATE INDEX IF NOT EXISTS idx_tickets_event_id
			ON tickets(event_id)
		`;
	} catch (error) {
		console.error(`Error initializing tenant schema for ${tenantId}:`, error);
		throw error;
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

	try {
		// Create tenant and user in public schema
		const tenant = await prisma.tenant.create({ data: { name: tenantName } });
		const user = await prisma.user.create({
			data: {
				email,
				passwordHash,
				isSuperAdmin: isSuperAdminEmail(email),
			},
		});

		// Create user-tenant relationship
		const userTenant = await prisma.userTenant.create({
			data: {
				userId: user.id,
				tenantId: tenant.id,
				role: 'owner',
			},
		});

		// Initialize tenant-specific schema
		await initializeTenantSchema(tenant.id);

		const secret = process.env.JWT_SECRET!;
		const token = jwt.sign({ userId: user.id, tenantId: tenant.id, role: userTenant.role, isSuperAdmin: user.isSuperAdmin }, secret, {
			expiresIn: '7d',
		});

		res.status(201).json({ data: { token } });
	} catch (error) {
		console.error('Registration error:', error);
		res.status(500).json({ error: 'Registration failed' });
	}
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

	try {
		const user = await prisma.user.findUnique({
			where: { email },
			include: {
				userTenants: {
					include: {
						tenant: true,
					},
				},
			},
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

		if (user.userTenants.length === 0) {
			res.status(401).json({ error: 'User has no associated tenants' });
			return;
		}

		// If user belongs to exactly one tenant, auto-login
		if (user.userTenants.length === 1) {
			const userTenant = user.userTenants[0];
			const secret = process.env.JWT_SECRET!;
			const token = jwt.sign(
				{ userId: user.id, tenantId: userTenant.tenantId, role: userTenant.role, isSuperAdmin: user.isSuperAdmin },
				secret,
				{ expiresIn: '7d' },
			);
			res.json({ data: { token } });
			return;
		}

		// If user belongs to multiple tenants, return list of tenants for selection
		const tenantList = user.userTenants.map(ut => ({
			id: ut.tenantId,
			name: ut.tenant.name,
			role: ut.role,
		}));

		res.json({ data: { tenants: tenantList, userId: user.id } });
	} catch (error) {
		console.error('Login error:', error);
		res.status(500).json({ error: 'Login failed' });
	}
});

router.post('/select-tenant', async (req: Request, res: Response): Promise<void> => {
	const { userId, tenantId } = req.body;
	if (!userId || !tenantId) {
		res.status(400).json({ error: 'userId and tenantId are required' });
		return;
	}

	try {
		// Verify user has access to tenant
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

		const secret = process.env.JWT_SECRET!;
		const token = jwt.sign(
			{ userId: userTenant.user.id, tenantId: userTenant.tenantId, role: userTenant.role, isSuperAdmin: userTenant.user.isSuperAdmin },
			secret,
			{ expiresIn: '7d' },
		);

		res.json({ data: { token } });
	} catch (error) {
		console.error('Select tenant error:', error);
		res.status(500).json({ error: 'Tenant selection failed' });
	}
});

export default router;
