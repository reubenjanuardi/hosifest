/**
 * AC-PS-01..05 (Presale beverage + tumbler entitlements) and
 * AC-PS-03 beverage choice is mandatory.
 *
 * Owner of the behaviour under test: BACKEND. Catalog configuration: DATABASE.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_SEED_PRICES,
  SEED,
  adminContext,
  adminResources,
  beverageIds,
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

async function buyPresale(tickets: any[]) {
  return container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer: guest(),
    items: [{ ticketOfferId: SEED.offerPresale, quantity: tickets.length, tickets }],
  });
}

describe('AC-PS-01 seeded Presale price', () => {
  it('charges Rp225.000', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await buyPresale([
      { beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir },
    ]);
    assert.equal(result.order.total_amount, EXPECTED_SEED_PRICES.presale);
  });
});

describe('AC-PS-02 each Presale ticket carries one beverage and one tumbler', () => {
  it('the offer is configured with exactly one beverage and one tumbler entitlement', async () => {
    const benefits = await db.query(
      `SELECT benefit_type, quantity, is_mandatory
         FROM benefit_definitions
        WHERE ticket_offer_id = $1
        ORDER BY benefit_type`,
      [SEED.offerPresale],
    );
    const rows = benefits.rows;
    assert.equal(rows.length, 2, 'Presale must define exactly two entitlements');

    const beverage = rows.find((row: any) => row.benefit_type === 'BEVERAGE');
    const tumbler = rows.find((row: any) => row.benefit_type === 'TUMBLER');
    assert.ok(beverage, 'Presale must include a BEVERAGE entitlement');
    assert.ok(tumbler, 'Presale must include a TUMBLER entitlement');
    assert.equal(Number(beverage.quantity), 1);
    assert.equal(Number(tumbler.quantity), 1);
    assert.equal(
      beverage.is_mandatory,
      true,
      'AC-PS-03: the beverage entitlement is mandatory',
    );
  });

  it('issues exactly one tumbler and one beverage benefit row per Presale ticket', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await buyPresale([
      { beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir },
      { beverageOptionId: SEED.beverageMilkTea, souvenirSelections: souvenir },
    ]);
    await container.orderQueries.submitPaymentProof(result.order.order_number, {
      method: 'QRIS',
      amount: result.order.total_amount,
      proofFileKey: 'qa/proof.png',
    });
    const approval = await container.payments.approvePayment(result.order.id, {
      actorUserId: SEED.financeUser,
    });
    assert.equal(approval.issuedTicketCodes.length, 2);

    const rows = await db.query(
      `SELECT b.benefit_type, count(*)::int AS count
         FROM ticket_benefit_selections bs
         JOIN benefit_definitions b ON b.id = bs.benefit_definition_id
        WHERE bs.ticket_id IN (
                SELECT t.id FROM tickets t
                  JOIN order_items oi ON oi.id = t.order_item_id
                 WHERE oi.order_id = $1)
        GROUP BY b.benefit_type
        ORDER BY b.benefit_type`,
      [result.order.id],
    );
    const byType = new Map(rows.rows.map((row: any) => [row.benefit_type, Number(row.count)]));
    assert.equal(
      byType.get('TUMBLER'),
      2,
      'AC-PS-02: exactly one tumbler entitlement per Presale ticket',
    );
    assert.equal(
      byType.get('BEVERAGE'),
      2,
      'AC-PS-02: exactly one beverage entitlement per Presale ticket',
    );
  });

  it('Early Bird and Normal carry no beverage or tumbler entitlement', async () => {
    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM benefit_definitions
        WHERE ticket_offer_id = ANY($1::uuid[])`,
      [[SEED.offerEarlyBird, SEED.offerNormal]],
    );
    assert.equal(Number(rows.rows[0].count), 0);
  });
});

describe('AC-PS-03 a beverage choice is required per Presale ticket', () => {
  it('rejects a Presale ticket with no beverage', async () => {
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      buyPresale([{ beverageOptionId: null, souvenirSelections: souvenir }]),
      'BEVERAGE_REQUIRED',
    );
  });

  it('rejects the whole order when only one of two tickets has a beverage', async () => {
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      buyPresale([
        { beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir },
        { beverageOptionId: null, souvenirSelections: souvenir },
      ]),
      'BEVERAGE_REQUIRED',
    );
  });

  it('rejects an unknown beverage id', async () => {
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      buyPresale([
        { beverageOptionId: '21111111-1111-4111-8111-111111111111', souvenirSelections: souvenir },
      ]),
      'BEVERAGE_REQUIRED',
    );
  });

  it('does not require a beverage on an offer with no beverage entitlement', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerNormal,
          quantity: 1,
          tickets: [{ souvenirSelections: souvenir }],
        },
      ],
    });
    assert.equal(result.order.status, 'WAITING_PAYMENT');
  });
});

describe('AC-PS-04 / AC-PS-05 the beverage catalog is dynamic', () => {
  it('seeds Es Kopi Susu and Milk Tea', async () => {
    const ids = await beverageIds(container);
    assert.ok(ids.includes(SEED.beverageKopiSusu), 'Es Kopi Susu must be seeded');
    assert.ok(ids.includes(SEED.beverageMilkTea), 'Milk Tea must be seeded');
  });

  it('an admin-added beverage is immediately purchasable with no deployment', async () => {
    const created = await container.config.create(
      RESOURCES.beverageOptions,
      {
        code: 'QA_TEH_TARIK',
        name: 'Teh Tarik (QA)',
        description: 'Added by QA.',
        active: true,
        display_order: 3,
      },
      adminContext(),
    );
    try {
      const ids = await beverageIds(container);
      assert.ok(ids.includes(created.id));

      const souvenir = await defaultSouvenir(container);
      const result = await buyPresale([
        { beverageOptionId: created.id, souvenirSelections: souvenir },
      ]);
      const item = await scalar(
        db,
        `SELECT metadata FROM order_items WHERE order_id = $1`,
        [result.order.id],
      );
      const metadata = item.metadata as { tickets: { beverage: { code: string } }[] };
      assert.equal(metadata.tickets[0]?.beverage.code, 'QA_TEH_TARIK');
    } finally {
      await db.query(`DELETE FROM beverage_options WHERE code = 'QA_TEH_TARIK'`);
    }
  });

  it('a deactivated beverage is no longer purchasable', async () => {
    await container.config.update(
      RESOURCES.beverageOptions,
      SEED.beverageMilkTea,
      { active: false },
      adminContext(),
    );
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      buyPresale([{ beverageOptionId: SEED.beverageMilkTea, souvenirSelections: souvenir }]),
      'BEVERAGE_REQUIRED',
    );
  });
});



