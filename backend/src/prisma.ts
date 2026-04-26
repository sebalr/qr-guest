import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

interface DbRoleFlags {
	role_name: string;
	is_superuser: boolean;
	can_bypass_rls: boolean;
}

export interface RlsContext {
	tenantId: string;
	bypassRls?: boolean;
}

function normalizeTenantId(tenantId: string): string {
	const normalizedTenantId = tenantId.trim();
	if (!normalizedTenantId) {
		throw new Error('tenantId is required');
	}

	return normalizedTenantId;
}

export async function withRls<T>(context: RlsContext, work: (tx: PrismaClient) => Promise<T>): Promise<T> {
	const tenantId = normalizeTenantId(context.tenantId);
	const bypassRls = context.bypassRls === true;

	return prisma.$transaction(async tx => {
		await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
		await tx.$executeRaw`SELECT set_config('app.bypass_rls', ${bypassRls ? 'on' : 'off'}, true)`;

		if (process.env.LOG_TENANT_DB_DEBUG === '1') {
			const rows = await tx.$queryRaw<Array<{ tenant_id: string | null; bypass_rls: string | null }>>`
				SELECT
					current_setting('app.current_tenant_id', true) AS tenant_id,
					current_setting('app.bypass_rls', true) AS bypass_rls
			`;

			console.log('[tenant-rls] transaction context', {
				tenantId,
				bypassRls,
				dbTenantId: rows[0]?.tenant_id ?? null,
				dbBypassRls: rows[0]?.bypass_rls ?? null,
			});
		}

		return work(tx as unknown as PrismaClient);
	});
}

export async function assertRlsSafeDatabaseRole(): Promise<void> {
	if (process.env.SKIP_RLS_ROLE_CHECK === '1' || process.env.NODE_ENV === 'test') {
		return;
	}

	const rows = await prisma.$queryRaw<DbRoleFlags[]>`
		SELECT
			current_user AS role_name,
			r.rolsuper AS is_superuser,
			r.rolbypassrls AS can_bypass_rls
		FROM pg_roles r
		WHERE r.rolname = current_user
	`;

	const role = rows[0];
	if (!role) {
		console.warn('[tenant-rls] unable to verify role flags for current_user');
		return;
	}

	if (role.is_superuser || role.can_bypass_rls) {
		throw new Error(
			`Unsafe database role "${role.role_name}" detected: role can bypass RLS. Use a non-superuser role with NOBYPASSRLS for application runtime.`,
		);
	}
}

export default prisma;
