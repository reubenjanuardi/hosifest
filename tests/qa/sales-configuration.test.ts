/**
 * AC-SALES-01..05 — sales configuration is data, quotas are enforced.
 *
 * Owner of the behaviour under test: BACKEND (business logic) and
 * DATABASE (schema/config rows). QA asserts only observable behaviour.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_SEED_PRICES,
  EXPECTED_SEED_QUOTAS,
  SEED,
  defaultSouvenir,
  expectCode,
  guest,
  makeContainer,
  makeDatabase,
  quotaSnapshot,
  adminContext,
  adminResources,
  resetAll,
  scalar,
} from './harness.js';

let db: any;
let container: any;
let RESOURCES: any;

before(async () => {
  db = await makeDatabase();
  container = await makeContainer();
  RESOURCES = await adminResources();
});

after(async () => {
  if (db) await resetAll(db);
  if (db) await db.close();
});

beforeEach(async () => {
  await resetAll(db);
});

describe('AC-SALES-04 initial seed configuration', () => {
  it('seeds Early Bird 95 = 35 Hosiana + 60 Mupel, Presale 55, Normal 50', async () => {
    const offer = await scalar(
      db,
      `SELECT quota FROM ticket_offers WHERE id = $1`,
      [SEED.offerEarlyBird],
    );
    assert.equal(Number(offer.quota), EXPECTED_SEED_QUOTAS.earlyBirdOffer);

    const hosiana = await scalar(
      db,
      `SELECT quota FROM offer_allocations WHERE id = $1`,
      [SEED.allocationHosiana],
    );
    const mupel = await scalar(
      db,
      `SELECT quota FROM offer_allocations WHERE id = $1`,
      [SEED.allocationMupel],
    );
    const presale = await scalar(
      db,
      `SELECT quota FROM offer_allocations WHERE id = $1`,
      [SEED.allocationPresale],
    );
    const normal = await scalar(
      db,
      `SELECT quota FROM offer_allocations WHERE id = $1`,
      [SEED.allocationNormal],
    );

    assert.equal(Number(hosiana.quota), EXPECTED_SEED_QUOTAS.hosianaAllocation);
    assert.equal(Number(mupel.quota), EXPECTED_SEED_QUOTAS.mupelAllocation);
    assert.equal(Number(presale.quota), EXPECTED_SEED_QUOTAS.presale);
    assert.equal(Number(normal.quota), EXPECTED_SEED_QUOTAS.normal);

    const planned =
      Number(hosiana.quota) + Number(mupel.quota) + Number(presale.quota) + Number(normal.quota);
    assert.equal(planned, EXPECTED_SEED_QUOTAS.plannedTotal);
  });

  it('seeds exactly three sales phases with the pinned codes', async () => {
    const phases = await container.sales.listSalesPhases(SEED.eventId);
    assert.deepEqual(
      phases.map((phase: any) => phase.code).sort(),
      ['EARLY_BIRD', 'NORMAL', 'PRESALE'],
    );
  });
});

describe('AC-SALES-01 phase dates are configurable without a code change', () => {
  it('a phase window moved by an admin immediately gates sales', async () => {
    const souvenir = await defaultSouvenir(container);

    // Presale phase is currently forced open by openSalesWindows(); close it.
    await container.config.update(
      RESOURCES.salesPhases,
      SEED.phasePresale,
      { status: 'SCHEDULED' },
      adminContext(),
    );
    await expectCode(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: guest(),
        items: [
          {
            ticketOfferId: SEED.offerPresale,
            quantity: 1,
            tickets: [
              { beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir },
            ],
          },
        ],
      }),
      'SALES_PHASE_NOT_ACTIVE',
    );

    // Re-open it through the same admin surface; no rebuild, no restart.
    await container.config.update(
      RESOURCES.salesPhases,
      SEED.phasePresale,
      { status: 'ACTIVE' },
      adminContext(),
    );
    const reopened = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerPresale,
          quantity: 1,
          tickets: [{ beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir }],
        },
      ],
    });
    assert.equal(reopened.order.status, 'WAITING_PAYMENT');
  });
});

describe('AC-SALES-02 prices are configurable without a code change', () => {
  it('an admin price change is what the server charges', async () => {
    const souvenir = await defaultSouvenir(container);

    await container.config.update(
      RESOURCES.ticketOffers,
      SEED.offerNormal,
      { base_price: 300_000 },
      adminContext(),
    );
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [{ ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] }],
    });

    assert.equal(result.order.total_amount, 300_000);
    assert.equal(result.order.subtotal_amount, 300_000);
  });
});

describe('AC-SALES-03 quotas are configurable without a code change', () => {
  it('an admin quota change is what the reservation engine enforces', async () => {
    const souvenir = await defaultSouvenir(container);

    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationNormal,
      { quota: 1 },
      adminContext(),
    );

    const buy = (phone: string) =>
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { name: 'Quota Guest', email: `${phone}@hosifest.test`, phone },
        items: [
          { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
        ],
      });

    await buy('081300000001');
    await expectCode(buy('081300000002'), 'QUOTA_EXHAUSTED');

    const snapshot = await quotaSnapshot(db, SEED.offerNormal, SEED.allocationNormal);
    assert.equal(Number(snapshot.allocation.reserved_quantity), 1);
  });
});

describe('AC-SALES-05 sales never exceed the configured allocation', () => {
  it('refuses to sell beyond a ticket offer quota and never oversells it', async () => {
    const souvenir = await defaultSouvenir(container);
    await container.config.update(
      RESOURCES.ticketOffers,
      SEED.offerNormal,
      { quota: 2 },
      adminContext(),
    );

    const buy = (phone: string) =>
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { name: 'Oversell Guest', email: `${phone}@hosifest.test`, phone },
        items: [
          { ticketOfferId: SEED.offerNormal, quantity: 3, tickets: [{ souvenirSelections: souvenir }] },
        ],
      });

    await expectCode(buy('081400000001'), 'QUOTA_EXHAUSTED');

    // A quantity inside the quota still succeeds, so the guard is quota driven.
    const ok = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 2, tickets: [{ souvenirSelections: souvenir }] },
      ],
    });
    assert.equal(ok.order.status, 'WAITING_PAYMENT');

    const snapshot = await quotaSnapshot(db, SEED.offerNormal, SEED.allocationNormal);
    assert.equal(Number(snapshot.offer.reserved_quantity), 2);
    assert.ok(
      Number(snapshot.offer.reserved_quantity) + Number(snapshot.offer.sold_quantity) <=
        Number(snapshot.offer.quota),
      'reserved + sold must never exceed quota',
    );
  });

  it('seeded prices are the values the release gate pins', async () => {
    const rows = await db.query(`SELECT code, base_price FROM ticket_offers ORDER BY code`);
    const byCode = new Map(rows.rows.map((row: any) => [row.code, Number(row.base_price)]));
    assert.equal(byCode.get('EARLY_BIRD'), EXPECTED_SEED_PRICES.earlyBirdBase);
    assert.equal(byCode.get('PRESALE'), EXPECTED_SEED_PRICES.presale);
    assert.equal(byCode.get('NORMAL'), EXPECTED_SEED_PRICES.normal);
  });
});


