import fs from 'node:fs/promises';
import path from 'node:path';

import { Pool, type PoolClient } from 'pg';

export interface ApplyTenantMigrationsOptions {
	schemas?: string[];
	dryRun?: boolean;
	migrationDir?: string;
	createMissingSchemas?: boolean;
}

export interface TenantMigrationFailure {
	schema: string;
	migration: string;
	error: string;
}

export interface TenantMigrationSummary {
	dryRun: boolean;
	schemasDiscovered: number;
	schemasTargeted: number;
	migrationsDiscovered: number;
	applied: number;
	skipped: number;
	failed: TenantMigrationFailure[];
}

interface TenantMigrationFile {
	name: string;
	sql: string;
}

const TENANT_SCHEMA_PREFIX = 'tenant_';
const DEFAULT_MIGRATION_DIR = path.resolve(process.cwd(), 'prisma', 'tenant-migrations');

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replace(/"/g, '""')}"`;
}

function assertValidTenantSchema(schemaName: string): void {
	if (!schemaName.startsWith(TENANT_SCHEMA_PREFIX)) {
		throw new Error(`Invalid tenant schema name: ${schemaName}`);
	}
}

function toTenantSchema(tenantId: string): string {
	if (!tenantId.trim()) {
		throw new Error('tenantId is required');
	}

	return `${TENANT_SCHEMA_PREFIX}${tenantId}`;
}

async function ensureTrackingTable(client: PoolClient): Promise<void> {
	await client.query(`
		CREATE TABLE IF NOT EXISTS public.tenant_schema_migrations (
			schema_name TEXT NOT NULL,
			migration_name TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (schema_name, migration_name)
		)
	`);
}

async function getTenantSchemas(client: PoolClient): Promise<string[]> {
	const result = await client.query<{ schema_name: string }>(
		`SELECT schema_name
		 FROM information_schema.schemata
		 WHERE schema_name LIKE 'tenant_%'
		 ORDER BY schema_name ASC`,
	);

	return result.rows.map(row => row.schema_name);
}

async function loadMigrationFiles(migrationDir: string): Promise<TenantMigrationFile[]> {
	const directoryEntries = await fs.readdir(migrationDir, { withFileTypes: true });
	const migrationFiles = directoryEntries
		.filter(entry => entry.isFile() && entry.name.endsWith('.sql'))
		.map(entry => entry.name)
		.sort((a, b) => a.localeCompare(b));

	const files: TenantMigrationFile[] = [];
	for (const migrationFileName of migrationFiles) {
		const fullPath = path.join(migrationDir, migrationFileName);
		const sql = await fs.readFile(fullPath, 'utf8');
		files.push({
			name: migrationFileName,
			sql,
		});
	}

	return files;
}

async function hasMigrationBeenApplied(client: PoolClient, schemaName: string, migrationName: string): Promise<boolean> {
	const result = await client.query<{ exists: boolean }>(
		`SELECT EXISTS (
			SELECT 1
			FROM public.tenant_schema_migrations
			WHERE schema_name = $1 AND migration_name = $2
		) AS exists`,
		[schemaName, migrationName],
	);

	return Boolean(result.rows[0]?.exists);
}

async function runMigrationForSchema(
	client: PoolClient,
	schemaName: string,
	migration: TenantMigrationFile,
	dryRun: boolean,
): Promise<'applied' | 'skipped'> {
	const alreadyApplied = await hasMigrationBeenApplied(client, schemaName, migration.name);
	if (alreadyApplied) {
		return 'skipped';
	}

	if (dryRun) {
		return 'applied';
	}

	await client.query('BEGIN');
	try {
		await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schemaName)}, public`);
		await client.query(migration.sql);
		await client.query(
			`INSERT INTO public.tenant_schema_migrations (schema_name, migration_name)
			 VALUES ($1, $2)`,
			[schemaName, migration.name],
		);
		await client.query('COMMIT');
		return 'applied';
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	}
}

export async function applyTenantSchemaMigrations(options: ApplyTenantMigrationsOptions = {}): Promise<TenantMigrationSummary> {
	const dryRun = options.dryRun === true;
	const migrationDir = options.migrationDir ?? DEFAULT_MIGRATION_DIR;
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });

	const summary: TenantMigrationSummary = {
		dryRun,
		schemasDiscovered: 0,
		schemasTargeted: 0,
		migrationsDiscovered: 0,
		applied: 0,
		skipped: 0,
		failed: [],
	};

	try {
		const migrations = await loadMigrationFiles(migrationDir);
		summary.migrationsDiscovered = migrations.length;

		if (migrations.length === 0) {
			throw new Error(`No tenant migration SQL files found in ${migrationDir}`);
		}

		const client = await pool.connect();
		try {
			await ensureTrackingTable(client);

			const discoveredSchemas = await getTenantSchemas(client);
			summary.schemasDiscovered = discoveredSchemas.length;

			const requestedSchemas = options.schemas ? [...new Set(options.schemas)] : discoveredSchemas;
			for (const schemaName of requestedSchemas) {
				assertValidTenantSchema(schemaName);
			}

			for (const schemaName of requestedSchemas) {
				const exists = discoveredSchemas.includes(schemaName);
				if (!exists) {
					if (!options.createMissingSchemas) {
						summary.failed.push({
							schema: schemaName,
							migration: '(schema-check)',
							error: 'Schema does not exist',
						});
						continue;
					}

					if (!dryRun) {
						await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
					}
				}

				summary.schemasTargeted += 1;

				for (const migration of migrations) {
					try {
						const result = await runMigrationForSchema(client, schemaName, migration, dryRun);
						if (result === 'applied') {
							summary.applied += 1;
						} else {
							summary.skipped += 1;
						}
					} catch (error) {
						summary.failed.push({
							schema: schemaName,
							migration: migration.name,
							error: error instanceof Error ? error.message : String(error),
						});
					}
				}
			}
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}

	return summary;
}

export async function initializeSingleTenantSchema(tenantId: string): Promise<TenantMigrationSummary> {
	const schemaName = toTenantSchema(tenantId);
	return applyTenantSchemaMigrations({
		schemas: [schemaName],
		createMissingSchemas: true,
	});
}
