/**
 * HOSIFEST QA acceptance harness.
 *
 * QA owns `tests/` exclusively. This file is the shared fixture used by every
 * acceptance suite in this directory.
 *
 * These tests are BLACK BOX against the compiled backend (`apps/backend/dist`)
 * and a REAL PostgreSQL database that already has `migrations/*.sql` and
 * `seeders/*.sql` applied. Nothing here re-implements business logic: every
 * assertion observes what the backend and the database actually do.
 *
 * Rules honoured by this harness (AGENTS.md section 5, qa.toml):
 *   - never edit application code, migrations, seeders or deploy files
 *   - never weaken a business rule to make a test pass
 *   - restore every row a test mutates, so test ordering never matters
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Locate the repository root by walking up from this module until a directory
 * contains the backend. Doing the lookup at runtime keeps the suite
 * independent of the TypeScript `outDir`, so the same source runs from
 * `tests/qa/` and from `tests/.build/qa/`.
 */
function findRepoRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, 'apps', 'backend', 'dist', 'modules', 'container.js'))) {
      return current;
    }
    if (existsSync(join(current, 'apps', 'backend', 'src', 'modules', 'container.ts'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    'Could not locate the HOSIFEST repository root from ' +
      fileURLToPath(import.meta.url) +
      '. Build the backend first: cd apps/backend && pnpm build',
  );
}

export const REPO_ROOT = findRepoRoot();
export const BACKEND_DIST = join(REPO_ROOT, 'apps', 'backend', 'dist');

const backendUrl = (relative: string): string => pathToFileURL(join(BACKEND_DIST, relative)).href;

let cached: any = null;

/** Load the compiled backend modules once per test process. */
export async function backend(): Promise<any> {
  if (cached) return cached;
  const [container, env, database, errors, locks, quota, crypto] = await Promise.all([
    import(backendUrl('modules/container.js')),
    import(backendUrl('config/env.js')),
    import(backendUrl('db/database.js')),
    import(backendUrl('core/errors.js')),
    import(backendUrl('db/locks.js')),
    import(backendUrl('db/quota.js')),
    import(backendUrl('core/crypto.js')),
  ]);
  cached = { container, env, database, errors, locks, quota, crypto };
  return cached;
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

if (TEST_DATABASE_URL.length === 0) {
  throw new Error(
    'TEST_DATABASE_URL is not set. QA acceptance tests require a real ' +
      'PostgreSQL with migrations and seeders applied.',
  );
}

export function qaEnv(overrides: Record<string, string> = {}): any {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    // Deterministic, non-secret, throwaway values for the throwaway test DB only.
    JWT_SECRET: 'qa-acceptance-secret-value-32ch',
    STORAGE_LOCAL_ROOT: resolve(REPO_ROOT, 'tests', '.storage'),
    LOG_LEVEL: 'silent',
    ...overrides,
  };
}

const silentLogger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
};

export async function makeContainer(overrides: Record<string, string> = {}): Promise<any> {
  const { container, env } = await backend();
  // `loadEnv` memoises; the QA process builds a fixed env so the cache is safe.
  return container.buildContainer(env.loadEnv(qaEnv(overrides)), silentLogger);
}

export async function makeDatabase(): Promise<any> {
  const { database } = await backend();
  return database.createDatabase({ connectionString: TEST_DATABASE_URL, log: silentLogger });
}

/**
 * Seed identifiers owned by DATABASE (seeders/*.sql). QA asserts against these
 * values; it never assumes the backend hardcodes them.
 */
export const SEED = {
  eventSlug: 'hosifest',
  eventId: '44444444-4444-4444-8444-444444444401',
  phaseEarlyBird: '44444444-4444-4444-8444-444444444411',
  phasePresale: '44444444-4444-4444-8444-444444444412',
  phaseNormal: '44444444-4444-4444-8444-444444444413',
  offerEarlyBird: '66666666-6666-4666-8666-666666666601',
  offerPresale: '66666666-6666-4666-8666-666666666602',
  offerNormal: '66666666-6666-4666-8666-666666666603',
  allocationHosiana: '77777777-7777-4777-8777-777777777701',
  allocationMupel: '77777777-7777-4777-8777-777777777702',
  allocationPresale: '77777777-7777-4777-8777-777777777703',
  allocationNormal: '77777777-7777-4777-8777-777777777704',
  discountHosiana: '88888888-8888-4888-8888-888888888801',
  discountCode: 'HOSIFEST_DEV_HOSIANA',
  congregationPaulus: '55555555-5555-4555-8555-555555555501',
  congregationHosiana: '55555555-5555-4555-8555-555555555507',
  beverageKopiSusu: '99999999-9999-4999-8999-999999999901',
  beverageMilkTea: '99999999-9999-4999-8999-999999999902',
  groupCharm: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  groupBase: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  groupRibbon: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  adminUser: '33333333-3333-4333-8333-333333333301',
  financeUser: '33333333-3333-4333-8333-333333333302',
  checkinUser: '33333333-3333-4333-8333-333333333303',
} as const;

/** AC-SALES-04: the initial seed allocation the release gate pins. */
export const EXPECTED_SEED_QUOTAS = {
  earlyBirdOffer: 95,
  hosianaAllocation: 35,
  mupelAllocation: 60,
  presale: 55,
  normal: 50,
  plannedTotal: 200,
} as const;

/** AC-EB-06 / AC-PS-01: seed prices, in rupiah. */
export const EXPECTED_SEED_PRICES = {
  earlyBirdBase: 175_000,
  hosianaDiscount: 25_000,
  hosianaEffective: 150_000,
  presale: 225_000,
  normal: 250_000,
} as const;

/* ------------------------------------------------------------------ *
 * Reset helpers
 * ------------------------------------------------------------------ */

/** Remove transactional rows so each test starts from the seeded baseline. */
export async function cleanupOrders(db: any): Promise<void> {
  await db.query('DELETE FROM attendance_sessions');
  await db.query('DELETE FROM discount_usages');
  await db.query(
    `DELETE FROM souvenir_selections
      WHERE customization_id IN (SELECT id FROM souvenir_customizations)`,
  );
  await db.query('DELETE FROM souvenir_customizations');
  await db.query('DELETE FROM ticket_benefit_selections');
  await db.query('DELETE FROM tickets');
  await db.query('DELETE FROM payments');
  await db.query('DELETE FROM order_status_history');
  await db.query('DELETE FROM payment_proof_files');
  await db.query('DELETE FROM order_items');
  await db.query('DELETE FROM orders');
  await db.query('DELETE FROM customers');
}

/** Reset every mutable capacity counter. */
export async function resetQuota(db: any): Promise<void> {
  await db.query(
    'UPDATE ticket_offers SET reserved_quantity = 0, sold_quantity = 0, updated_at = now()',
  );
  await db.query(
    'UPDATE offer_allocations SET reserved_quantity = 0, sold_quantity = 0, updated_at = now()',
  );
  await db.query(
    `UPDATE discount_usages SET status = 'RELEASED', released_at = now(), ticket_id = NULL`,
  );
}

/**
 * Force every phase and offer window open so wall-clock time never influences a
 * result. Tests that verify phase boundaries restore the seeded values instead.
 */
export async function openSalesWindows(db: any): Promise<void> {
  await db.query(
    `UPDATE sales_phases
        SET status = 'ACTIVE',
            start_at = now() - interval '1 day',
            end_at   = now() + interval '1 day'
      WHERE id = ANY($1::uuid[])`,
    [[SEED.phaseEarlyBird, SEED.phasePresale, SEED.phaseNormal]],
  );
  await db.query(
    `UPDATE ticket_offers
        SET status = 'ACTIVE',
            active_from  = now() - interval '1 day',
            active_until = now() + interval '1 day'`,
  );
  await db.query(
    `UPDATE discount_codes
        SET status = 'ACTIVE',
            active_from  = now() - interval '1 day',
            active_until = now() + interval '1 day'`,
  );
  await db.query(`UPDATE offer_allocations SET status = 'ACTIVE'`);
}

/** Restore the exact seeded configuration of every table a test mutates. */
export async function restoreSeedConfiguration(db: any): Promise<void> {
  await db.query(
    `UPDATE ticket_offers SET
       base_price = CASE code WHEN 'EARLY_BIRD' THEN 175000 WHEN 'PRESALE' THEN 225000 ELSE 250000 END,
       quota = CASE code WHEN 'EARLY_BIRD' THEN 95 WHEN 'PRESALE' THEN 55 ELSE 50 END,
       purchase_limit_min = 1, purchase_limit_max = 10,
       visibility = CASE code WHEN 'EARLY_BIRD' THEN 'RESTRICTED' ELSE 'PUBLIC' END,
       sales_channel = CASE code WHEN 'NORMAL' THEN 'BOTH' ELSE 'ONLINE' END,
       status = 'ACTIVE', active_from = NULL, active_until = NULL, updated_at = now()`,
  );
  await db.query(
    `UPDATE offer_allocations SET
       quota = CASE code
                  WHEN 'EARLY_BIRD_HOSIANA' THEN 35
                  WHEN 'EARLY_BIRD_MUPEL_JKP' THEN 60
                  WHEN 'PRESALE_DEFAULT' THEN 55
                  ELSE 50 END,
       status = 'ACTIVE', updated_at = now()`,
  );
  await db.query(
    `UPDATE discount_codes SET
       discount_value = 25000,
       max_total_usage = 35,
       status = 'ACTIVE',
       active_from = '2026-09-01T00:00:00+07',
       active_until = '2026-09-30T23:59:59+07',
       updated_at = now()`,
  );
  await db.query(
    `UPDATE sales_phases SET
       status = CASE code WHEN 'EARLY_BIRD' THEN 'ACTIVE' ELSE 'SCHEDULED' END,
       start_at = CASE code
                     WHEN 'EARLY_BIRD' THEN '2026-09-01T00:00:00+07'::timestamptz
                     WHEN 'PRESALE'    THEN '2026-10-01T00:00:00+07'::timestamptz
                     ELSE '2026-11-01T00:00:00+07'::timestamptz END,
       end_at = CASE code
                  WHEN 'EARLY_BIRD' THEN '2026-09-30T23:59:59+07'::timestamptz
                  WHEN 'PRESALE'    THEN '2026-10-31T23:59:59+07'::timestamptz
                  ELSE '2026-11-14T07:59:59+07'::timestamptz END
     WHERE id = ANY($1::uuid[])`,
    [[SEED.phaseEarlyBird, SEED.phasePresale, SEED.phaseNormal]],
  );
  await db.query(`DELETE FROM beverage_options WHERE code NOT IN ('ES_KOPI_SUSU','MILK_TEA')`);
  await db.query(`UPDATE beverage_options SET active = TRUE`);
  await db.query(`UPDATE souvenir_option_groups SET active = TRUE`);
  await db.query(`UPDATE souvenir_options SET active = TRUE`);
  await db.query(`UPDATE congregations SET active = TRUE`);
  await db.query(`DELETE FROM congregations WHERE code = 'OUTSIDER_TEST'`);
}

/** Full reset used before and after every test. */
export async function resetAll(db: any): Promise<void> {
  await cleanupOrders(db);
  await resetQuota(db);
  await restoreSeedConfiguration(db);
  await openSalesWindows(db);
}

/* ------------------------------------------------------------------ *
 * Domain helpers
 * ------------------------------------------------------------------ */

let customerCounter = 0;

/** A distinct guest per call so per-customer limits never cross-contaminate. */
export function guest(): { name: string; email: string; phone: string } {
  customerCounter += 1;
  return {
    name: `QA Guest ${customerCounter}`,
    email: `qa+${customerCounter}@hosifest.test`,
    phone: `0812000${String(customerCounter).padStart(5, '0')}`,
  };
}

export interface SouvenirPick {
  optionGroupId: string;
  optionId: string;
  quantity: number;
}

/** A valid, mandatory customization taken from the first active group. */
export async function defaultSouvenir(container: any): Promise<SouvenirPick[]> {
  const groups = await container.catalog.listSouvenirOptionGroups();
  const group = groups[0];
  const option = group?.options[0];
  if (!group || !option) throw new Error('Souvenir catalog is empty; seeders did not load.');
  return [{ optionGroupId: group.id, optionId: option.id, quantity: 1 }];
}

export async function souvenirFromGroup(
  container: any,
  groupCode: string,
): Promise<SouvenirPick[]> {
  const groups = await container.catalog.listSouvenirOptionGroups();
  const group = groups.find((candidate: any) => candidate.code === groupCode);
  const option = group?.options[0];
  if (!group || !option) throw new Error(`Souvenir group ${groupCode} missing.`);
  return [{ optionGroupId: group.id, optionId: option.id, quantity: 1 }];
}

export async function beverageIds(container: any): Promise<string[]> {
  const rows = await container.catalog.listBeverageOptions();
  return rows.map((row: any) => row.id as string);
}

/** Assert that `promise` rejects with the given application error code. */
export async function expectCode(promise: Promise<unknown>, code: string): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    const actual = (error as { code?: string }).code;
    if (actual !== code) {
      throw new Error(
        `Expected error code ${code} but received ${String(actual)}: ${String(
          (error as Error).message,
        )}`,
      );
    }
    return error as Error;
  }
  throw new Error(`Expected rejection with code ${code} but the call resolved.`);
}

export async function scalar<T = any>(
  db: any,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const { rows } = await db.query(sql, params);
  return rows[0] as T;
}

export async function count(db: any, sql: string, params: unknown[] = []): Promise<number> {
  const row = await scalar<{ count: number }>(db, sql, params);
  return Number(row?.count ?? 0);
}

/** Quota snapshot for an offer and (optionally) one of its allocations. */
export async function quotaSnapshot(
  db: any,
  offerId: string,
  allocationId?: string,
): Promise<{ offer: any; allocation: any }> {
  const offer = await scalar(
    db,
    `SELECT quota, reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
    [offerId],
  );
  const allocation = allocationId
    ? await scalar(
        db,
        `SELECT quota, reserved_quantity, sold_quantity FROM offer_allocations WHERE id = $1`,
        [allocationId],
      )
    : null;
  return { offer, allocation };
}

/* ------------------------------------------------------------------ *
 * Acceptance bookkeeping
 * ------------------------------------------------------------------ */

export interface AcceptanceResult {
  ac: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  owner?: string;
  detail?: string;
}

const results: AcceptanceResult[] = [];

export function record(result: AcceptanceResult): void {
  const existing = results.findIndex((entry) => entry.ac === result.ac);
  if (existing >= 0) results[existing] = result;
  else results.push(result);
}

export function acceptanceResults(): readonly AcceptanceResult[] {
  return results;
}

/** AC ids no suite may claim. Missing ones are reported as coverage gaps. */
export const CLAIMED_ACCEPTANCE_IDS = [
  'AC-SALES-01', 'AC-SALES-02', 'AC-SALES-03', 'AC-SALES-04', 'AC-SALES-05',
  'AC-EB-01', 'AC-EB-02', 'AC-EB-03', 'AC-EB-04', 'AC-EB-05', 'AC-EB-06', 'AC-EB-07',
  'AC-PS-01', 'AC-PS-02', 'AC-PS-03', 'AC-PS-04', 'AC-PS-05',
  'AC-SOU-01', 'AC-SOU-02', 'AC-SOU-03', 'AC-SOU-04', 'AC-SOU-05', 'AC-SOU-06',
  'AC-CHK-01', 'AC-CHK-02', 'AC-CHK-03', 'AC-CHK-04', 'AC-CHK-05', 'AC-CHK-06',
  'AC-PAY-01', 'AC-PAY-02', 'AC-PAY-03', 'AC-PAY-04', 'AC-PAY-05', 'AC-PAY-06', 'AC-PAY-07',
  'AC-TKT-01', 'AC-TKT-02', 'AC-TKT-03', 'AC-TKT-04',
  'AC-ATT-01', 'AC-ATT-02', 'AC-ATT-03', 'AC-ATT-04', 'AC-ATT-05', 'AC-ATT-06',
  'AC-ATT-07', 'AC-ATT-08',
  'AC-SEC-01', 'AC-SEC-02', 'AC-SEC-03', 'AC-SEC-04', 'AC-SEC-05',
  'AC-DEVOPS-01', 'AC-DEVOPS-02', 'AC-DEVOPS-03', 'AC-DEVOPS-04', 'AC-DEVOPS-05',
  'AC-DEVOPS-06', 'AC-DEVOPS-07', 'AC-DEVOPS-08', 'AC-DEVOPS-09',
  'AC-OPS-01', 'AC-OPS-02', 'AC-OPS-03', 'AC-OPS-04', 'AC-OPS-05', 'AC-OPS-06',
] as const;

/**
 * Resource definitions exposed by the admin config service. Tests drive the
 * same audited CRUD surface an administrator would use, never raw SQL, when
 * the acceptance criterion is about configurability.
 */
/** Import any compiled backend module by its path under `dist/`. */
export async function backendModule(relative: string): Promise<any> {
  return import(backendUrl(relative));
}

let resourceCache: any = null;

export async function adminResources(): Promise<any> {
  if (!resourceCache) {
    const module = await import(backendUrl('modules/admin-config/resources.js'));
    resourceCache = module.RESOURCES;
  }
  return resourceCache;
}

/** Actor context for audited admin mutations. Uses the seeded SUPER_ADMIN. */
export function adminContext(): {
  actorUserId: string;
  requestId: string;
  ipAddress: string;
  userAgent: string;
} {
  return {
    actorUserId: SEED.adminUser,
    requestId: 'qa-acceptance',
    ipAddress: '127.0.0.1',
    userAgent: 'hosifest-qa/1.0',
  };
}

export function actor(userId: string): {
  actorUserId: string;
  requestId: string;
  ipAddress: string;
  userAgent: string;
} {
  return {
    actorUserId: userId,
    requestId: 'qa-acceptance',
    ipAddress: '127.0.0.1',
    userAgent: 'hosifest-qa/1.0',
  };
}





