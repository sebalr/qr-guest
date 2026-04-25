import 'dotenv/config';

import path from 'node:path';

import { applyTenantSchemaMigrations } from '../lib/tenantMigrations/runner';

interface ParsedArgs {
	dryRun: boolean;
	schemas: string[];
	migrationDir?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
	const parsed: ParsedArgs = {
		dryRun: false,
		schemas: [],
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			parsed.dryRun = true;
			continue;
		}

		if (arg === '--schema') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error('--schema requires a value');
			}
			parsed.schemas.push(value);
			i += 1;
			continue;
		}

		if (arg.startsWith('--schema=')) {
			parsed.schemas.push(arg.slice('--schema='.length));
			continue;
		}

		if (arg === '--migration-dir') {
			const value = argv[i + 1];
			if (!value) {
				throw new Error('--migration-dir requires a value');
			}
			parsed.migrationDir = path.resolve(process.cwd(), value);
			i += 1;
			continue;
		}

		if (arg.startsWith('--migration-dir=')) {
			parsed.migrationDir = path.resolve(process.cwd(), arg.slice('--migration-dir='.length));
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return parsed;
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	const summary = await applyTenantSchemaMigrations({
		dryRun: args.dryRun,
		schemas: args.schemas.length > 0 ? args.schemas : undefined,
		migrationDir: args.migrationDir,
	});

	console.log('Tenant migration summary:');
	console.log(`- dryRun: ${summary.dryRun}`);
	console.log(`- schemas discovered: ${summary.schemasDiscovered}`);
	console.log(`- schemas targeted: ${summary.schemasTargeted}`);
	console.log(`- tenant migration files: ${summary.migrationsDiscovered}`);
	console.log(`- applied: ${summary.applied}`);
	console.log(`- skipped: ${summary.skipped}`);
	console.log(`- failed: ${summary.failed.length}`);

	if (summary.failed.length > 0) {
		for (const failure of summary.failed) {
			console.error(`  * ${failure.schema} :: ${failure.migration} :: ${failure.error}`);
		}
		process.exitCode = 1;
	}
}

main().catch(error => {
	console.error('Tenant migration runner failed:', error);
	process.exitCode = 1;
});
