import { Request } from 'express';

import { RlsContext } from '../prisma';

interface ResolveRlsContextOptions {
	allowSuperAdminTenantOverride?: boolean;
	allowSuperAdminBypass?: boolean;
}

function parseFlag(rawValue: unknown): boolean {
	if (typeof rawValue === 'boolean') return rawValue;
	if (typeof rawValue !== 'string') return false;

	const normalized = rawValue.trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function extractTenantOverride(req: Request): string {
	const queryTenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
	const body = req.body as { tenantId?: unknown } | undefined;
	const bodyTenantId = typeof body?.tenantId === 'string' ? body.tenantId : '';

	return (queryTenantId || bodyTenantId).trim();
}

export function resolveRlsContext(req: Request, options: ResolveRlsContextOptions = {}): RlsContext {
	if (!req.user) {
		throw new Error('Unauthorized');
	}

	const allowOverride = options.allowSuperAdminTenantOverride !== false;
	const allowBypass = options.allowSuperAdminBypass === true;
	const tenantOverride = extractTenantOverride(req);

	const tenantId = req.user.isSuperAdmin && allowOverride && tenantOverride ? tenantOverride : req.user.tenantId;
	if (!tenantId?.trim()) {
		throw new Error('tenantId is required');
	}

	const bypassFlagFromQuery = req.query.bypassRls;
	const bypassFlagFromHeader = req.headers['x-rls-bypass'];
	const body = req.body as { bypassRls?: unknown } | undefined;
	const bypassFlagFromBody = body?.bypassRls;

	const bypassRequested = parseFlag(bypassFlagFromQuery) || parseFlag(bypassFlagFromHeader) || parseFlag(bypassFlagFromBody);

	return {
		tenantId: tenantId.trim(),
		bypassRls: req.user.isSuperAdmin && allowBypass && bypassRequested,
	};
}
