import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

// Cache for tenant-specific Prisma clients
const tenantClients = new Map<string, PrismaClient>();
const tenantClientsInitialized = new Map<string, Promise<PrismaClient>>();

/**
 * Get a Prisma client for a specific tenant schema
 * Caches clients to avoid creating new ones for each request
 * Each client is initialized with SET search_path to its tenant schema
 */
export async function getPrismaForTenant(tenantId: string): Promise<PrismaClient> {
	// Return cached client if available
	if (tenantClients.has(tenantId)) {
		return tenantClients.get(tenantId)!;
	}

	// Prevent race conditions during initialization
	if (tenantClientsInitialized.has(tenantId)) {
		return tenantClientsInitialized.get(tenantId)!;
	}

	// Initialize the client
	const initPromise = (async () => {
		const tenantAdapter = new PrismaPg({
			connectionString: process.env.DATABASE_URL,
		});

		const tenantClient = new PrismaClient({ adapter: tenantAdapter });

		// Set the search_path to the tenant schema
		// This is connection-level, so it persists for the lifetime of the connection
		await tenantClient.$executeRawUnsafe(`SET search_path = 'tenant_${tenantId}', 'public'`);

		tenantClients.set(tenantId, tenantClient);
		tenantClientsInitialized.delete(tenantId);

		return tenantClient;
	})();

	tenantClientsInitialized.set(tenantId, initPromise);
	return initPromise;
}

export default prisma;
