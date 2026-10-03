import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/database.js';
import { loadEnv } from '../src/config/env.js';

/**
 * Applies every `migrations/*.sql` in ascending filename order.
 *
 * Each file runs inside its own transaction and is recorded in
 * `schema_migrations`, so re-running is safe and a partially applied migration
 * is rolled back rather than left half applied.
 *
 * Migration files are owned by the DATABASE agent; this script only executes
 * them and never writes to that directory.
 */
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the migrations directory for both execution layouts:
 *   - dev via tsx: scripts/migrate.ts   -> <repo>/migrations
 *   - prod compiled: dist/scripts/migrate.js -> <app>/migrations
 * MIGRATIONS_DIR may be set explicitly to override.
 */
function resolveMigrationsDir(): string {
  const override = process.env.MIGRATIONS_DIR;
  if (override) return resolve(override);
  const candidates = [
    resolve(here, '..', '..', '..', 'migrations'), // scripts -> repo/migrations (dev via tsx)
    resolve(here, '..', '..', 'migrations'),      // dist/scripts -> app/migrations (prod image)
    resolve(here, '..', 'migrations'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

const MIGRATIONS_DIR = resolveMigrationsDir();

async function ensureRegistry(db: ReturnType<typeof createDatabase>): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );
}

async function main(): Promise<void> {
  const env = loadEnv();
  const db = createDatabase({ connectionString: env.DATABASE_URL, applicationName: 'hosifest-migrate' });

  try {
    let files: string[];
    try {
      files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
    } catch (error) {
      console.error(`No migrations directory found at ${MIGRATIONS_DIR}.`);
      throw error;
    }

    if (files.length === 0) {
      console.log('No .sql migrations to apply.');
      return;
    }

    await ensureRegistry(db);
    const { rows } = await db.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`- ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`+ ${file}`);
      await db.transaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      });
    }
    console.log('Migrations up to date.');
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});

