/**
 * Regression probe for the two release-blocking defects found in the Wave 1
 * acceptance run. Both assertions describe the CORRECT behaviour required by
 * `23-acceptance-criteria.md`; both fail today and must pass before the
 * release gate can be re-evaluated.
 *
 *   D1  every discounted order must be creatable (AC-EB-04/05/06, AC-CHK-02)
 *   D2  payment approval must issue tickets exactly once (AC-PAY-02/03, AC-TKT-01)
 *
 * This file is deliberately narrow so it can be run on its own by the owning
 * agent while fixing the defect.
 *
 *   TEST_DATABASE_URL=... node --test .build/qa/probe.js
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_SEED_PRICES,
  SEED,
  actor,
  defaultSouvenir,
  guest,
  makeContainer,
  makeDatabase,
  resetAll,
  scalar,
} from './harness.js';

let db: any;
let container: any;

before(async () => {
  db = await makeDatabase();
  container = await makeContainer();
});

after(async () => {
  if (db) await resetAll(db);
  if (db) await db.close();
});

beforeEach(async () => {
  await resetAll(db);
});

describe('D1 a discounted order must be creatable', () => {
  it('creates a single-ticket Hosiana Early Bird order at the effective price', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerEarlyBird,
          quantity: 1,
          tickets: [
            {
              congregationId: SEED.congregationHosiana,
              discountCode: SEED.discountCode,
              souvenirSelections: souvenir,
            },
          ],
        },
      ],
    });
    assert.equal(result.order.subtotal_amount, EXPECTED_SEED_PRICES.earlyBirdBase);
    assert.equal(result.order.discount_amount, EXPECTED_SEED_PRICES.hosianaDiscount);
    assert.equal(result.order.total_amount, EXPECTED_SEED_PRICES.hosianaEffective);

    const item = await scalar(
      db,
      `SELECT quantity, unit_price, discount_amount, subtotal_amount
         FROM order_items WHERE order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(item.quantity), 1);
    assert.equal(Number(item.discount_amount), EXPECTED_SEED_PRICES.hosianaDiscount);
    // The order item must satisfy the migration's own contract:
    //   order_items_subtotal_chk CHECK (subtotal_amount = unit_price*quantity - discount_amount)
    assert.equal(
      Number(item.subtotal_amount),
      Number(item.unit_price) * Number(item.quantity) - Number(item.discount_amount),
    );
  });

  it('creates a two-ticket Hosiana Early Bird order', async () => {
    const souvenir = await defaultSouvenir(container);
    const ticket = () => ({
      congregationId: SEED.congregationHosiana,
      discountCode: SEED.discountCode,
      souvenirSelections: souvenir,
    });
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [{ ticketOfferId: SEED.offerEarlyBird, quantity: 2, tickets: [ticket(), ticket()] }],
    });
    assert.equal(result.order.total_amount, EXPECTED_SEED_PRICES.hosianaEffective * 2);
  });
});

describe('D2 payment approval must issue tickets exactly once', () => {
  it('approves a Normal order and issues one ticket per ticket', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerNormal,
          quantity: 2,
          tickets: [{ souvenirSelections: souvenir }, { souvenirSelections: souvenir }],
        },
      ],
    });
    await container.orderQueries.submitPaymentProof(result.order.order_number, {
      method: 'QRIS',
      amount: result.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });

    const approval = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(approval.order.status, 'PAID');
    assert.equal(approval.transitioned, true);
    assert.equal(approval.issuedTicketCodes.length, 2);

    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(rows.rows[0].count), 2);
  });

  it('a repeat approval issues nothing further', async () => {
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
    await container.orderQueries.submitPaymentProof(result.order.order_number, {
      method: 'QRIS',
      amount: result.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });
    const first = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    const second = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(second.transitioned, false);
    assert.deepEqual([...second.issuedTicketCodes].sort(), [...first.issuedTicketCodes].sort());
  });
});
