/**
 * AC-EB-01..07 — Early Bird eligibility, the Hosiana discount limit and the
 * Mupel Jakarta Pusat allocation.
 *
 * Owner of the behaviour under test: BACKEND. Configuration rows: DATABASE.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_SEED_PRICES,
  EXPECTED_SEED_QUOTAS,
  SEED,
  adminContext,
  adminResources,
  defaultSouvenir,
  expectCode,
  guest,
  makeContainer,
  makeDatabase,
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

/** One Mupel JakPus Early Bird ticket, congregation taken from the seed. */
async function buyEarlyBird(congregationId: string | null, discountCode?: string) {
  const souvenir = await defaultSouvenir(container);
  return container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer: guest(),
    items: [
      {
        ticketOfferId: SEED.offerEarlyBird,
        quantity: 1,
        tickets: [
          {
            congregationId,
            discountCode: discountCode ?? null,
            souvenirSelections: souvenir,
          },
        ],
      },
    ],
  });
}

describe('AC-EB-03 the 12 GPIB Mupel Jakarta Pusat congregations are seeded', () => {
  it('seeds exactly twelve active Jakarta Pusat congregations', async () => {
    const rows = await db.query(
      `SELECT code, region FROM congregations WHERE active = TRUE ORDER BY display_order`,
    );
    assert.equal(rows.rows.length, 12);
    for (const row of rows.rows) {
      assert.equal(row.region, 'Jakarta Pusat', `${row.code} must be Jakarta Pusat`);
    }
  });

  it('links all twelve to the Mupel Jakarta Pusat Early Bird allocation', async () => {
    const row = await scalar<{ count: number }>(
      db,
      `SELECT count(*)::int AS count
         FROM offer_allocation_congregations
        WHERE allocation_id = $1`,
      [SEED.allocationMupel],
    );
    assert.equal(Number(row.count), 12);
  });
});

describe('AC-EB-01 a restricted Early Bird offer is not publicly exposed', () => {
  it('is configured RESTRICTED at both phase and offer level', async () => {
    const offer = await scalar(
      db,
      `SELECT o.visibility AS offer_visibility, p.visibility AS phase_visibility
         FROM ticket_offers o
         JOIN sales_phases p ON p.id = o.sales_phase_id
        WHERE o.id = $1`,
      [SEED.offerEarlyBird],
    );
    assert.equal(offer.offer_visibility, 'RESTRICTED');
    assert.equal(offer.phase_visibility, 'RESTRICTED');
  });

  it('is hidden from the public ticket-offer listing', async () => {
    const offers = await container.sales.listTicketOffers(SEED.eventId);
    const earlyBird = offers.find((offer: any) => offer.code === 'EARLY_BIRD');
    assert.ok(
      earlyBird === undefined,
      'AC-EB-01: Early Bird must not be listed by the public, unauthenticated ' +
        'ticket-offer endpoint while it is configured RESTRICTED, but it was ' +
        'returned with visibility=RESTRICTED and full pricing/quotas.',
    );
  });
});

describe('AC-EB-02 Early Bird requires an eligible configured congregation', () => {
  it('rejects Early Bird with no congregation at all', async () => {
    await expectCode(buyEarlyBird(null), 'CONGREGATION_REQUIRED');
  });

  it('rejects an unknown congregation id', async () => {
    await expectCode(
      buyEarlyBird('11111111-1111-4111-8111-111111111111'),
      'CONGREGATION_NOT_ELIGIBLE',
    );
  });

  it('rejects a congregation that exists but is not an eligible Mupel JakPus congregation', async () => {
    // A real, active congregation row that is deliberately NOT a member of the
    // Early Bird Mupel allocation. AC-EB-02 says eligibility comes from the
    // configured list, not from "some active congregation exists".
    const outsider = await scalar<{ id: string }>(
      db,
      `INSERT INTO congregations (name, code, region, active, display_order)
       VALUES ('GPIB.externer', 'OUTSIDER_TEST', 'Jakarta Selatan', TRUE, 99)
       ON CONFLICT (code) DO UPDATE SET active = TRUE
       RETURNING id`,
    );
    try {
      await expectCode(
        buyEarlyBird(outsider.id),
        'CONGREGATION_NOT_ELIGIBLE',
      );
    } finally {
      await db.query(`DELETE FROM congregations WHERE code = 'OUTSIDER_TEST'`);
    }
  });

  it('accepts a configured Mupel JakPus congregation', async () => {
    const result = await buyEarlyBird(SEED.congregationPaulus);
    assert.equal(result.order.status, 'WAITING_PAYMENT');
  });
});

describe('AC-EB-04 the Hosiana discount requires the configured code', () => {
  it('rejects a Hosiana Early Bird purchase with no code', async () => {
    await expectCode(buyEarlyBird(SEED.congregationHosiana), 'INVALID_DISCOUNT_CODE');
  });

  it('rejects a wrong code', async () => {
    await expectCode(
      buyEarlyBird(SEED.congregationHosiana, 'NOT_A_REAL_CODE'),
      'INVALID_DISCOUNT_CODE',
    );
  });

  it('rejects the Hosiana code on a non-Hosiana Early Bird congregation', async () => {
    await expectCode(
      buyEarlyBird(SEED.congregationPaulus, SEED.discountCode),
      'INVALID_DISCOUNT_CODE_FOR_OFFER',
    );
  });

  it('rejects the Hosiana code on a non-Early-Bird offer', async () => {
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: guest(),
        items: [
          {
            ticketOfferId: SEED.offerPresale,
            quantity: 1,
            tickets: [
              {
                discountCode: SEED.discountCode,
                beverageOptionId: SEED.beverageKopiSusu,
                souvenirSelections: souvenir,
              },
            ],
          },
        ],
      }),
      'INVALID_DISCOUNT_CODE_FOR_OFFER',
    );
  });
});

describe('AC-EB-06 seeded Early Bird pricing', () => {
  it('charges Rp175.000 base and Rp150.000 effective for Hosiana', async () => {
    const base = await buyEarlyBird(SEED.congregationPaulus);
    assert.equal(base.order.subtotal_amount, EXPECTED_SEED_PRICES.earlyBirdBase);
    assert.equal(base.order.total_amount, EXPECTED_SEED_PRICES.earlyBirdBase);

    const hosiana = await buyEarlyBird(SEED.congregationHosiana, SEED.discountCode);
    assert.equal(hosiana.order.subtotal_amount, EXPECTED_SEED_PRICES.earlyBirdBase);
    assert.equal(
      hosiana.order.discount_amount,
      EXPECTED_SEED_PRICES.hosianaDiscount,
    );
    assert.equal(
      hosiana.order.total_amount,
      EXPECTED_SEED_PRICES.hosianaEffective,
    );
  });
});

describe('AC-EB-05 the Hosiana discount is capped at 35 tickets', () => {
  it('refuses the 36th discounted ticket and never oversells the allocation', async () => {
    // Configuration is the source of the cap: shrink the code and the bucket to
    // 2 so the 35-ticket rule is proven without creating 35 orders.
    await container.config.update(
      RESOURCES.discountCodes,
      SEED.discountHosiana,
      { max_total_usage: 2 },
      adminContext(),
    );
    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationHosiana,
      { quota: 2 },
      adminContext(),
    );
    await db.query(
      `UPDATE ticket_offers SET quota = 2 WHERE id = $1`,
      [SEED.offerEarlyBird],
    );

    const souvenir = await defaultSouvenir(container);
    const buyTwo = (phone: string) =>
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { name: 'Hosiana Guest', email: `${phone}@hosifest.test`, phone },
        items: [
          {
            ticketOfferId: SEED.offerEarlyBird,
            quantity: 2,
            tickets: [
              {
                congregationId: SEED.congregationHosiana,
                discountCode: SEED.discountCode,
                souvenirSelections: souvenir,
              },
              {
                congregationId: SEED.congregationHosiana,
                discountCode: SEED.discountCode,
                souvenirSelections: souvenir,
              },
            ],
          },
        ],
      });

    await buyTwo('081500000001');
    await expectCode(buyTwo('081500000002'), 'DISCOUNT_CODE_EXHAUSTED');

    const snapshot = await scalar(
      db,
      `SELECT quota, reserved_quantity, sold_quantity FROM offer_allocations WHERE id = $1`,
      [SEED.allocationHosiana],
    );
    assert.equal(Number(snapshot.reserved_quantity), 2);
    assert.ok(Number(snapshot.reserved_quantity) + Number(snapshot.sold_quantity) <= 2);
  });

  it('the seeded cap is the release-gate value of 35', async () => {
    const code = await scalar(
      db,
      `SELECT max_total_usage FROM discount_codes WHERE id = $1`,
      [SEED.discountHosiana],
    );
    const allocation = await scalar(
      db,
      `SELECT quota FROM offer_allocations WHERE id = $1`,
      [SEED.allocationHosiana],
    );
    assert.equal(Number(code.max_total_usage), EXPECTED_SEED_QUOTAS.hosianaAllocation);
    assert.equal(Number(allocation.quota), EXPECTED_SEED_QUOTAS.hosianaAllocation);
  });
});

describe('AC-EB-07 business values are configuration, not source constants', () => {
  it('changing the seeded discount value changes what the server charges', async () => {
    await container.config.update(
      RESOURCES.discountCodes,
      SEED.discountHosiana,
      { discount_value: 75_000 },
      adminContext(),
    );

    const result = await buyEarlyBird(SEED.congregationHosiana, SEED.discountCode);
    assert.equal(result.order.subtotal_amount, EXPECTED_SEED_PRICES.earlyBirdBase);
    assert.equal(
      result.order.total_amount,
      EXPECTED_SEED_PRICES.earlyBirdBase - 75_000,
    );
  });

  it('changing the Mupel allocation quota changes what the server sells', async () => {
    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationMupel,
      { quota: 1 },
      adminContext(),
    );
    const souvenir = await defaultSouvenir(container);
    const buy = (phone: string) =>
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { name: 'Mupel Guest', email: `${phone}@hosifest.test`, phone },
        items: [
          {
            ticketOfferId: SEED.offerEarlyBird,
            quantity: 1,
            tickets: [{ congregationId: SEED.congregationPaulus, souvenirSelections: souvenir }],
          },
        ],
      });

    await buy('081600000001');
    await expectCode(buy('081600000002'), 'QUOTA_EXHAUSTED');
  });
});
