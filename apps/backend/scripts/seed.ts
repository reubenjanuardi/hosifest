import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/db/database.js';
import { loadEnv } from '../src/config/env.js';

/**
 * Applies every `seeders/*.sql` in ascending filename order.
 *
 * Seeds are DATA, not schema: they load the initial configuration rows
 * (event, phases, offers, allocations, congregations, discount code, beverage
 * and souvenir catalogs, dev users). All of it is editable through the admin
 * API, so nothing here is a source-code constant.
 *
 * Files are idempotent (ON CONFLICT DO NOTHING), so re-running is safe.
 *
 * Usage:
 *   npm run seed                     # all seeders
 *   npm run seed -- --include-dev     # also load dev-only users
 *
 * NOTE: `seeders/002_dev_users.sql` is development-only and is skipped unless
 * --include-dev is passed, so production never receives seeded accounts.
 */
const here = dirname(fileURLToPath(import.meta.url));

function resolveSeedersDir(): string {
  const override = process.env.SEEDERS_DIR;
  if (override) return resolve(override);
  const candidates = [
    resolve(here, '..', '..', '..', 'seeders'), // scripts -> repo/seeders (dev)
    resolve(here, '..', '..', 'seeders'), // dist/scripts -> app/seeders (prod image)
    resolve(here, '..', 'seeders'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

const SEEDERS_DIR = resolveSeedersDir();
const DEV_ONLY = /^002_dev_users\.sql$/;

async function main(): Promise<void> {
  const includeDev = process.argv.includes('--include-dev');
  const env = loadEnv();
  const db = createDatabase({
    connectionString: env.DATABASE_URL,
    applicationName: 'hosifest-seed',
  });

  try {
    let files: string[];
    try {
      files = (await readdir(SEEDERS_DIR))
        .filter((file) => file.endsWith('.sql'))
        .sort();
    } catch (error) {
      console.error(`No seeders directory found at ${SEEDERS_DIR}.`);
      throw error;
    }

    if (files.length === 0) {
      console.log('No .sql seeders to apply.');
      return;
    }

    for (const file of files) {
      if (DEV_ONLY.test(file) && !includeDev) {
        console.log(`- ${file} (skipped: dev-only, pass --include-dev to load)`);
        continue;
      }
      console.log(`+ ${file}`);
      const sql = await readFile(join(SEEDERS_DIR, file), 'utf8');
      await db.transaction(async (client) => {
        await client.query(sql);
      });
    }
    console.log('Seed data applied.');
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
