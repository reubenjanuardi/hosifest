import { createDatabase, type Database } from '../../src/db/database.js';

/**
 * Integration-test harness.
 *
 * These tests run against a REAL PostgreSQL using the actual `migrations/*.sql`
 * and `seeders/*.sql`. They are skipped automatically when no DATABASE_URL is
 * supplied, so `pnpm test` stays green without a database while CI can still
 * exercise the SQL layer.
 */
// Connection target. When TEST_SOCKET_DIR is set (Windows throwaway
// instance with no TCP listener) the socket is used instead of TCP.
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const TEST_SOCKET_DIR = process.env.TEST_SOCKET_DIR ?? '';
export const TEST_PORT = Number(process.env.TEST_PORT ?? '5432');

export const integrationEnabled =
  TEST_DATABASE_URL.length > 0 || TEST_SOCKET_DIR.length > 0;

/** Deterministic UUIDs from the database agent's seeders. */
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
} as const;

export function makeDatabase(): Database {
  if (!integrationEnabled) {
    throw new Error('TEST_DATABASE_URL is not set');
  }
  return createDatabase({
    connectionString: TEST_DATABASE_URL,
    // On Windows a throwaway instance often has no TCP listener (binding
    // 127.0.0.1 can be denied), so the socket directory is used instead.
    ...(TEST_SOCKET_DIR.length > 0
      ? { host: TEST_SOCKET_DIR, port: TEST_PORT, user: 'postgres', database: 'hosifest_test' }
      : {}),
    max: 30,
    connectionTimeoutMillis: 5_000,
    log: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
  });
}

/** Reset mutable counters AND quota values so each test starts from the seeded baseline. */
export async function resetQuota(db: Database): Promise<void> {
  await db.query(
    `UPDATE ticket_offers o
        SET quota = s.quota, reserved_quantity = 0, sold_quantity = 0, updated_at = now()
       FROM (VALUES
         ('66666666-6666-4666-8666-666666666601'::uuid, 95),
         ('66666666-6666-4666-8666-666666666602'::uuid, 55),
         ('66666666-6666-4666-8666-666666666603'::uuid, 50)
       ) AS s(id, quota)
      WHERE o.id = s.id`,
  );
  await db.query(
    `UPDATE offer_allocations a
        SET quota = s.quota, reserved_quantity = 0, sold_quantity = 0, updated_at = now()
       FROM (VALUES
         ('77777777-7777-4777-8777-777777777701'::uuid, 35),
         ('77777777-7777-4777-8777-777777777702'::uuid, 60),
         ('77777777-7777-4777-8777-777777777703'::uuid, 55),
         ('77777777-7777-4777-8777-777777777704'::uuid, 50)
       ) AS s(id, quota)
      WHERE a.id = s.id`,
  );
  await db.query(`UPDATE discount_usages SET status = 'RELEASED', released_at = now(), ticket_id = NULL`);
}

/** Force every phase/offer window open so tests are not time-dependent. */
export async function openSalesWindows(db: Database): Promise<void> {
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
  // The seeded Early Bird window is closed by design (seeders/003 and
  // seeders/005), so a test that exercises a discount code must open that
  // window itself. Seed dates are business configuration and are never
  // widened to make a test pass; the QA harness already works this way.
  await db.query(
    `UPDATE discount_codes
        SET status = 'ACTIVE',
            active_from  = now() - interval '1 day',
            active_until = now() + interval '1 day'`,
  );
}

export async function cleanupOrders(db: Database): Promise<void> {
  // Order of deletion respects FKs.
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
  await db.query('DELETE FROM audit_logs');
  await db.query('DELETE FROM order_items');
  await db.query('DELETE FROM orders');
  await db.query('DELETE FROM customers');
}
