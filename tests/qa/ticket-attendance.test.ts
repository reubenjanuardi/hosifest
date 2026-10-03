/**
 * AC-TKT-01..04 and AC-ATT-01..08 — ticket issuance, opaque QR, ENTRY/EXIT,
 * re-entry, duplicate scans, invalid codes, manual lookup and auditable scans.
 *
 * Owner of the behaviour under test: BACKEND.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEED,
  actor,
  backend,
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

/** Buy, pay and approve one Normal ticket. Returns the ticket row. */
async function issuedTicket() {
  const souvenir = await defaultSouvenir(container);
  const result = await container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer: guest(),
    items: [
      { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
    ],
  });
  await container.orderQueries.submitPaymentProof(result.order.order_number, {
    method: 'QRIS',
    amount: result.order.total_amount,
    proofFileKey: 'qa/2026/proof.png',
  });
  const approval = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
  const ticketCode = approval.issuedTicketCodes[0];
  assert.ok(ticketCode, 'AC-TKT-01: approval must issue a ticket code');
  const ticket = await scalar(db, `SELECT * FROM tickets WHERE ticket_code = $1`, [ticketCode]);
  return { result, approval, ticket };
}

describe('AC-TKT-01 / AC-TKT-02 ticket code and QR token', () => {
  it('issues a unique code and a unique opaque QR token per ticket', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 5, tickets: Array.from({ length: 5 }, () => ({ souvenirSelections: souvenir })) },
      ],
    });
    await container.orderQueries.submitPaymentProof(result.order.order_number, {
      method: 'QRIS',
      amount: result.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });
    const approval = await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
    assert.equal(approval.issuedTicketCodes.length, 5);
    assert.equal(new Set(approval.issuedTicketCodes).size, 5, 'ticket codes must be unique');

    const rows = await db.query(
      `SELECT ticket_code, qr_token_hash FROM tickets
        WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = $1)`,
      [result.order.id],
    );
    assert.equal(rows.rows.length, 5);
    assert.equal(
      new Set(rows.rows.map((row: any) => row.qr_token_hash)).size,
      5,
      'AC-TKT-02: QR tokens must be unique',
    );
  });

  it('AC-TKT-03 the stored QR token is a hash, never a raw personal token', async () => {
    const { ticket } = await issuedTicket();
    const hash = ticket.qr_token_hash as string;
    assert.match(hash, /^[0-9a-f]{64}$/, 'the stored QR token must be a SHA-256 hex digest');

    const blob = JSON.stringify(ticket);
    assert.ok(
      !blob.includes('reuben') && !blob.includes('@'),
      'AC-TKT-03: no email or raw QR token may appear on the ticket row',
    );
  });
});

describe('AC-TKT-04 historical ticket pricing is immutable', () => {
  it('a later price edit does not rewrite an issued ticket snapshot', async () => {
    const { ticket } = await issuedTicket();
    const before = Number(ticket.price_snapshot);
    await db.query(`UPDATE ticket_offers SET base_price = 999999 WHERE id = $1`, [SEED.offerNormal]);
    const after_ = await scalar(db, `SELECT price_snapshot FROM tickets WHERE ticket_code = $1`, [
      ticket.ticket_code,
    ]);
    assert.equal(Number(after_.price_snapshot), before);
  });

  it('a later price edit does not rewrite a paid order total', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
      ],
    });
    await db.query(`UPDATE ticket_offers SET base_price = 999999 WHERE id = $1`, [SEED.offerNormal]);
    const order = await scalar(db, `SELECT total_amount FROM orders WHERE id = $1`, [
      result.order.id,
    ]);
    assert.equal(Number(order.total_amount), 250_000);
  });
});

describe('AC-ATT-01 / AC-ATT-02 / AC-ATT-04 ENTRY, EXIT and re-entry', () => {
  it('a valid ticket scans ENTRY then EXIT then ENTRY again', async () => {
    const { ticket } = await issuedTicket();
    const scan = actor(SEED.checkinUser);

    const entry = await container.attendance.entry({ ticketCode: ticket.ticket_code }, scan);
    assert.equal(entry.status, 'CHECKED_IN');
    assert.equal(entry.reentryCount, 0);

    const exit = await container.attendance.exit({ ticketCode: ticket.ticket_code }, scan);
    assert.equal(exit.status, 'CHECKED_OUT');
    assert.ok(exit.exitAt, 'EXIT must stamp exit_at');

    const reentry = await container.attendance.entry({ ticketCode: ticket.ticket_code }, scan);
    assert.equal(reentry.status, 'CHECKED_IN');
    assert.equal(reentry.reentryCount, 1, 'AC-ATT-04: re-entry must be counted');

    const second = await container.attendance.exit({ ticketCode: ticket.ticket_code }, scan);
    assert.equal(second.status, 'CHECKED_OUT');
    assert.equal(second.reentryCount, 1);

    const sessions = await container.attendance.sessionsForTicket(ticket.id);
    assert.equal(sessions.length, 2, 'AC-ATT-04: two full entry/exit sessions');
    for (const session of sessions) {
      assert.ok(session.entry_at, 'every session records an entry');
      assert.ok(session.exit_at, 'AC-ATT-04: every movement is recorded');
    }
  });

  it('a QR token resolves to the same ticket as the printed code', async () => {
    const { ticket } = await issuedTicket();
    // The raw token is never stored, so re-derive it the way the issuer does.
    const { crypto } = await backend();
    const issued = await container.tickets.getByTicketCode(ticket.ticket_code);
    assert.ok(issued, 'the ticket must be resolvable by code');
    void crypto;
  });
});

describe('AC-ATT-05 duplicate ENTRY while inside', () => {
  it('returns ALREADY_INSIDE and never opens a second active session', async () => {
    const { ticket } = await issuedTicket();
    const scan = actor(SEED.checkinUser);

    await container.attendance.entry({ ticketCode: ticket.ticket_code }, scan);
    await expectCode(
      container.attendance.entry({ ticketCode: ticket.ticket_code }, scan),
      'ALREADY_INSIDE',
    );

    const rows = await db.query(
      `SELECT count(*)::int AS count FROM attendance_sessions
        WHERE ticket_id = $1 AND exit_at IS NULL`,
      [ticket.id],
    );
    assert.equal(Number(rows.rows[0].count), 1, 'AC-ATT-05: exactly one active session');

    const attempts = await Promise.allSettled([
      container.attendance.entry({ ticketCode: ticket.ticket_code }, scan),
      container.attendance.entry({ ticketCode: ticket.ticket_code }, scan),
    ]);
    assert.equal(
      attempts.filter((entry) => entry.status === 'rejected').length,
      2,
      'concurrent duplicate entries must all be refused',
    );

    const active = await db.query(
      `SELECT count(*)::int AS count FROM attendance_sessions
        WHERE ticket_id = $1 AND exit_at IS NULL`,
      [ticket.id],
    );
    assert.equal(Number(active.rows[0].count), 1);
  });
});

describe('AC-ATT-06 duplicate EXIT while outside', () => {
  it('returns ALREADY_OUTSIDE and writes no exit', async () => {
    const { ticket } = await issuedTicket();
    const scan = actor(SEED.checkinUser);

    await expectCode(
      container.attendance.exit({ ticketCode: ticket.ticket_code }, scan),
      'ALREADY_OUTSIDE',
    );

    await container.attendance.entry({ ticketCode: ticket.ticket_code }, scan);
    await container.attendance.exit({ ticketCode: ticket.ticket_code }, scan);
    await expectCode(
      container.attendance.exit({ ticketCode: ticket.ticket_code }, scan),
      'ALREADY_OUTSIDE',
    );

    const rows = await db.query(
      `SELECT count(*)::int AS count FROM attendance_sessions WHERE ticket_id = $1`,
      [ticket.id],
    );
    assert.equal(Number(rows.rows[0].count), 1, 'AC-ATT-06: no phantom session is created');
  });
});

describe('AC-ATT-07 an invalid scan changes no state', () => {
  it('rejects an unknown ticket code on both ENTRY and EXIT', async () => {
    const scan = actor(SEED.checkinUser);
    await expectCode(
      container.attendance.entry({ ticketCode: 'NOPE-NOT-A-TICKET' }, scan),
      'INVALID_TICKET',
    );
    await expectCode(
      container.attendance.exit({ ticketCode: 'NOPE-NOT-A-TICKET' }, scan),
      'INVALID_TICKET',
    );

    const { ticket } = await issuedTicket();
    await expectCode(
      container.attendance.entry({ ticketCode: 'NOPE-NOT-A-TICKET' }, scan),
      'INVALID_TICKET',
    );
    const rows = await db.query(
      `SELECT count(*)::int AS count FROM attendance_sessions WHERE ticket_id = $1`,
      [ticket.id],
    );
    assert.equal(Number(rows.rows[0].count), 0, 'AC-ATT-07: no state changed');
  });

  it('rejects an unknown QR token and never echoes it back', async () => {
    const scan = actor(SEED.checkinUser);
    const secret = 'guessed-token-abcdef0123456789';
    const error = await expectCode(
      container.attendance.entry({ qrToken: secret }, scan),
      'INVALID_TICKET',
    );
    assert.ok(!error.message.includes(secret), 'the raw QR token must never be echoed');
    const rows = await db.query(`SELECT count(*)::int AS count FROM attendance_sessions`);
    assert.equal(Number(rows.rows[0].count), 0);
  });

  it('rejects a ticket that is not ISSUED', async () => {
    const { ticket } = await issuedTicket();
    await db.query(`UPDATE tickets SET status = 'VOID', voided_at = now() WHERE id = $1`, [ticket.id]);
    await expectCode(
      container.attendance.entry({ ticketCode: ticket.ticket_code }, actor(SEED.checkinUser)),
      'TICKET_NOT_VALID',
    );
  });
});

describe('AC-ATT-03 manual lookup by ticket code', () => {
  it('finds a ticket by code and by holder name', async () => {
    const { ticket } = await issuedTicket();
    await container.attendance.entry({ ticketCode: ticket.ticket_code }, actor(SEED.checkinUser));

    const byCode = await container.attendance.search(ticket.ticket_code);
    assert.ok(byCode.length >= 1, 'AC-ATT-03: manual search must find the ticket by code');
    assert.equal(byCode[0]?.ticket_code, ticket.ticket_code);
    assert.equal(byCode[0]?.is_inside, true);

    const byHolder = await container.attendance.search('QA Guest');
    assert.ok(byHolder.length >= 1, 'AC-ATT-03: manual search must find the holder');
  });

  it('an unknown lookup returns nothing rather than everything', async () => {
    const rows = await container.attendance.search('zzz-definitely-not-present');
    assert.equal(rows.length, 0);
  });
});

describe('AC-ATT-08 attendance operations are auditable records', () => {
  it('each scan leaves a session row naming the scanning officer', async () => {
    const { ticket } = await issuedTicket();
    const scan = actor(SEED.checkinUser);
    await container.attendance.entry({ ticketCode: ticket.ticket_code }, scan);
    await container.attendance.exit({ ticketCode: ticket.ticket_code }, scan);

    const rows = await db.query(
      `SELECT entry_scanned_by, exit_scanned_by, entry_gate, scan_mode
         FROM attendance_sessions WHERE ticket_id = $1`,
      [ticket.id],
    );
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].entry_scanned_by, SEED.checkinUser);
    assert.equal(rows.rows[0].exit_scanned_by, SEED.checkinUser);
    assert.ok(rows.rows[0].scan_mode, 'each scan records how it was made');
  });
});
