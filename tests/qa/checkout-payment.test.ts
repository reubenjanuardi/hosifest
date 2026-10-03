/**
 * AC-CHK-01..07 and AC-PAY-01..07 — checkout, quota reservation, the 30-minute
 * proof deadline, rejection -> CANCELLED, reservation release and idempotent
 * approval.
 *
 * Owner of the behaviour under test: BACKEND.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPECTED_SEED_PRICES,
  SEED,
  actor,
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

async function buyNormal(quantity = 1, customer = guest()) {
  const souvenir = await defaultSouvenir(container);
  return container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer,
    items: [
      {
        ticketOfferId: SEED.offerNormal,
        quantity,
        tickets: Array.from({ length: quantity }, () => ({ souvenirSelections: souvenir })),
      },
    ],
  });
}

async function submitProof(order: any, method = 'QRIS') {
  return container.orderQueries.submitPaymentProof(order.order_number, {
    method,
    amount: order.total_amount,
    proofFileKey: 'qa/2026/proof.png',
  });
}

describe('AC-CHK-01 / AC-CHK-02 multiple tickets and an authoritative total', () => {
  it('sells several tickets in one order and computes the total server-side', async () => {
    const result = await buyNormal(4);
    assert.equal(result.order.subtotal_amount, EXPECTED_SEED_PRICES.normal * 4);
    assert.equal(result.order.discount_amount, 0);
    assert.equal(result.order.total_amount, EXPECTED_SEED_PRICES.normal * 4);

    const tickets = await db.query(
      `SELECT t.sequence_number, t.price_snapshot
         FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY t.sequence_number`,
      [result.order.id],
    );
    assert.equal(tickets.rows.length, 0, 'No tickets before payment approval');

    const item = await scalar(db, `SELECT quantity, unit_price FROM order_items WHERE order_id = $1`, [
      result.order.id,
    ]);
    assert.equal(Number(item.quantity), 4);
    assert.equal(Number(item.unit_price), EXPECTED_SEED_PRICES.normal);
  });

  it('the request contract has no price or total field a client could dictate', async () => {
    const { backendModule } = await import('./harness.js');
    const schemaModule = await backendModule('modules/order/order.schema.js');
    const shape = (schemaModule.createOrderSchema as any).shape ?? {};
    const allowed = new Set(Object.keys(shape));
    for (const forbidden of ['total', 'total_amount', 'subtotal', 'price', 'amount', 'discount']) {
      assert.ok(
        !allowed.has(forbidden),
        `AC-CHK-02: the client must not be able to send "${forbidden}"`,
      );
    }
    assert.ok(allowed.has('items') && allowed.has('customer'));
  });
});

describe('AC-CHK-03 quota reservation is concurrency safe', () => {
  it('two concurrent buyers competing for the last ticket: exactly one wins', async () => {
    await container.config.update(
      RESOURCES.ticketOffers,
      SEED.offerNormal,
      { quota: 1 },
      adminContext(),
    );
    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationNormal,
      { quota: 1 },
      adminContext(),
    );

    const results = await Promise.allSettled([
      buyNormal(1, { name: 'Race A', email: 'race-a@hosifest.test', phone: '081700000001' }),
      buyNormal(1, { name: 'Race B', email: 'race-b@hosifest.test', phone: '081700000002' }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent buyer may reserve the last ticket');
    assert.equal(rejected.length, 1);

    const offer = await scalar(
      db,
      `SELECT quota, reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(Number(offer.reserved_quantity) + Number(offer.sold_quantity), 1);
    assert.ok(Number(offer.reserved_quantity) + Number(offer.sold_quantity) <= 1);
  });

  it('ten concurrent single-ticket buyers against a quota of five never oversell', async () => {
    await container.config.update(
      RESOURCES.ticketOffers,
      SEED.offerNormal,
      { quota: 5 },
      adminContext(),
    );
    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationNormal,
      { quota: 5 },
      adminContext(),
    );

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_unused, index) =>
        buyNormal(1, {
          name: `Bulk ${index}`,
          email: `bulk-${index}@hosifest.test`,
          phone: `0818000000${String(index).padStart(2, '0')}`,
        }),
      ),
    );
    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    assert.equal(fulfilled.length, 5, 'Exactly five buyers may be served');

    const offer = await scalar(
      db,
      `SELECT quota, reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(Number(offer.reserved_quantity) + Number(offer.sold_quantity), 5);
  });
});

describe('AC-CHK-04 / AC-CHK-05 the 30-minute payment deadline', () => {
  it('sets expires_at and payment_deadline_at to 30 minutes after creation', async () => {
    const result = await buyNormal(1);
    const order = await scalar(
      db,
      `SELECT created_at, expires_at, payment_deadline_at FROM orders WHERE id = $1`,
      [result.order.id],
    );
    for (const column of ['expires_at', 'payment_deadline_at']) {
      const minutes =
        (new Date(order[column]).getTime() - new Date(order.created_at).getTime()) / 60_000;
      assert.equal(
        Math.round(minutes),
        30,
        `AC-CHK-04: ${column} must be exactly 30 minutes after creation`,
      );
    }
  });

  it('refuses proof on an overdue order', async () => {
    const result = await buyNormal(1);
    await db.query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      result.order.id,
    ]);
    await expectCode(submitProof(result.order), 'ORDER_EXPIRED');
  });

  it('expires the overdue order and releases its quota when proof arrives late', async () => {
    const result = await buyNormal(2);
    await db.query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      result.order.id,
    ]);
    await expectCode(submitProof(result.order), 'ORDER_EXPIRED');

    const order = await scalar(db, `SELECT status, expired_at FROM orders WHERE id = $1`, [
      result.order.id,
    ]);
    assert.equal(
      order.status,
      'EXPIRED',
      'AC-CHK-05 / BR-PAY-03: an overdue order must end up EXPIRED once a late ' +
        'proof arrives, not stay WAITING_PAYMENT',
    );
    assert.ok(order.expired_at, 'EXPIRED orders must stamp expired_at');

    const offer = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(
      Number(offer.reserved_quantity),
      0,
      'AC-CHK-06: the late-proof expiry must actually release the reservation',
    );
  });

  it('a rejected amount is refused', async () => {
    const result = await buyNormal(1);
    await expectCode(
      container.orderQueries.submitPaymentProof(result.order.order_number, {
        method: 'QRIS',
        amount: result.order.total_amount - 1,
      }),
      'PAYMENT_AMOUNT_MISMATCH',
    );
  });
});

describe('AC-CHK-06 / AC-PAY-05 / AC-PAY-06 expiry releases every reservation', () => {
  it('an expired order releases ticket quota so it can be sold again', async () => {
    const result = await buyNormal(2);
    let offer = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(Number(offer.reserved_quantity), 2);

    await db.query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
      result.order.id,
    ]);
    const swept = await container.expiry.sweepExpiredOrders();
    assert.ok(swept >= 1, 'the sweeper must expire the overdue order');

    const order = await scalar(db, `SELECT status FROM orders WHERE id = $1`, [result.order.id]);
    assert.equal(order.status, 'EXPIRED');

    offer = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(Number(offer.reserved_quantity), 0, 'AC-CHK-06: quota must be released');

    const allocation = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM offer_allocations WHERE id = $1`,
      [SEED.allocationNormal],
    );
    assert.equal(Number(allocation.reserved_quantity), 0);
    assert.equal(Number(allocation.sold_quantity), 0);
  });
});

describe('AC-PAY-01 / AC-PAY-02 proof submission and review', () => {
  it('accepts QRIS and bank transfer proofs and moves the order to review', async () => {
    for (const method of ['QRIS', 'BANK_TRANSFER']) {
      const result = await buyNormal(1);
      const submitted = await submitProof(result.order, method);
      assert.equal(submitted.payment.status, 'SUBMITTED');
      assert.equal(submitted.payment.method, method);
      assert.equal(submitted.order.status, 'PAYMENT_REVIEW');
      await db.query('DELETE FROM payments');
      await db.query(`UPDATE orders SET status = 'WAITING_PAYMENT' WHERE id = $1`, [result.order.id]);
      await db.query(`UPDATE ticket_offers SET reserved_quantity = 0 WHERE id = $1`, [
        SEED.offerNormal,
      ]);
      await db.query(`UPDATE offer_allocations SET reserved_quantity = 0 WHERE id = $1`, [
        SEED.allocationNormal,
      ]);
    }
  });

  it('an already paid order cannot take another proof', async () => {
    const result = await buyNormal(1);
    await submitProof(result.order);
    const approval = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(approval.order.status, 'PAID');
    await expectCode(submitProof(result.order), 'ORDER_ALREADY_PAID');
  });
});

describe('AC-PAY-03 approval issues tickets exactly once', () => {
  it('a repeat approval returns the same tickets and creates no duplicates', async () => {
    const result = await buyNormal(2);
    await submitProof(result.order);

    const first = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(first.order.status, 'PAID');
    assert.equal(first.transitioned, true);
    assert.equal(first.issuedTicketCodes.length, 2);

    const second = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(second.transitioned, false, 'A repeat approval must not transition again');
    assert.deepEqual(
      [...second.issuedTicketCodes].sort(),
      [...first.issuedTicketCodes].sort(),
      'A repeat approval must return the same tickets',
    );

    const third = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(third.transitioned, false);

    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(rows.rows[0].count), 2, 'AC-PAY-03: exactly two tickets, never four');

    const approvals = await db.query(
      `SELECT count(*)::int AS count FROM payments
        WHERE order_id = $1 AND status = 'APPROVED'`,
      [result.order.id],
    );
    assert.equal(Number(approvals.rows[0].count), 1);
  });

  it('concurrent approvals of the same order issue each ticket once', async () => {
    const result = await buyNormal(2);
    await submitProof(result.order);

    const approvals = await Promise.allSettled([
      container.payments.approvePayment(result.order.id, actor(SEED.financeUser)),
      container.payments.approvePayment(result.order.id, actor(SEED.financeUser)),
      container.payments.approvePayment(result.order.id, actor(SEED.financeUser)),
    ]);
    const fulfilled = approvals.filter((entry) => entry.status === 'fulfilled');
    assert.ok(fulfilled.length > 0, 'at least one approval must succeed');

    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(rows.rows[0].count), 2, 'AC-PAY-03: no duplicate tickets under races');
  });
});

describe('AC-PAY-04 / AC-PAY-05 / AC-PAY-06 / AC-PAY-07 rejection', () => {
  it('rejection cancels immediately, releases quota and refuses any retry', async () => {
    const result = await buyNormal(2);
    await submitProof(result.order);

    const rejected = await container.payments.rejectPayment(
      result.order.id,
      actor(SEED.financeUser),
      'Proof does not match the order.',
    );
    assert.equal(rejected.order.status, 'CANCELLED');

    const order = await scalar(db, `SELECT cancelled_at FROM orders WHERE id = $1`, [
      result.order.id,
    ]);
    assert.ok(order.cancelled_at, 'AC-PAY-04: cancellation must be stamped immediately');

    const offer = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM ticket_offers WHERE id = $1`,
      [SEED.offerNormal],
    );
    assert.equal(Number(offer.reserved_quantity), 0, 'AC-PAY-05: quota released');
    assert.equal(Number(offer.sold_quantity), 0);

    const allocation = await scalar(
      db,
      `SELECT reserved_quantity, sold_quantity FROM offer_allocations WHERE id = $1`,
      [SEED.allocationNormal],
    );
    assert.equal(Number(allocation.reserved_quantity), 0);
    assert.equal(Number(allocation.sold_quantity), 0);

    await expectCode(submitProof(result.order), 'ORDER_CANCELLED');

    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(rows.rows[0].count), 0, 'A rejected order issues no ticket');

    // AC-PAY-07: the customer must be able to start a new order.
    const replacement = await buyNormal(1);
    assert.equal(replacement.order.status, 'WAITING_PAYMENT');
  });

  it('rejection releases the reserved discount usage', async () => {
    // The discounted path is currently unreachable (see the Early Bird report),
    // so the release is asserted directly against the ledger the rejection path
    // drives, using a manually seeded reservation.
    const { crypto } = await import('./harness.js').then((h) => h.backend());
    void crypto;

    const result = await buyNormal(1);
    await submitProof(result.order);
    await db.query(
      `INSERT INTO discount_usages (order_id, discount_code_id, quantity, status)
       VALUES ($1, $2, 1, 'RESERVED')`,
      [result.order.id, SEED.discountHosiana],
    );

    await container.payments.rejectPayment(
      result.order.id,
      actor(SEED.financeUser),
      'QA ledger release check',
    );

    const usage = await scalar(
      db,
      `SELECT status, released_at FROM discount_usages WHERE order_id = $1`,
      [result.order.id],
    );
    assert.equal(usage.status, 'RELEASED', 'AC-PAY-06: discount usage must be released');
    assert.ok(usage.released_at);
  });
});



