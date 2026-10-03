/**
 * AC-SOU-01..06 — one custom canvas keychain per paid ticket, mandatory
 * customization, per-ticket variation, dynamic catalog, no extra cost and
 * immutable history.
 *
 * Owner of the behaviour under test: BACKEND. Catalog configuration: DATABASE.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
  souvenirFromGroup,
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

async function buyNormal(tickets: any[]) {
  return container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer: guest(),
    items: [{ ticketOfferId: SEED.offerNormal, quantity: tickets.length, tickets }],
  });
}

/** Create + pay + approve a Normal order and return the issued ticket codes. */
async function buyNormalAndPay(tickets: any[]) {
  const result = await buyNormal(tickets);
  await container.orderQueries.submitPaymentProof(result.order.order_number, {
    method: 'QRIS',
    amount: result.order.total_amount,
    proofFileKey: 'qa/proof.png',
  });
  const approval = await container.payments.approvePayment(result.order.id, {
    actorUserId: SEED.financeUser,
  });
  return { result, codes: approval.issuedTicketCodes };
}

describe('AC-SOU-02 customization is mandatory', () => {
  it('rejects an order whose ticket has no souvenir selection', async () => {
    await expectCode(
      buyNormal([{ souvenirSelections: [] }]),
      'SOUVENIR_SELECTION_REQUIRED',
    );
  });

  it('rejects the whole order when only one of two tickets is customized', async () => {
    const souvenir = await defaultSouvenir(container);
    await expectCode(
      buyNormal([
        { souvenirSelections: souvenir },
        { souvenirSelections: [] },
      ]),
      'SOUVENIR_SELECTION_REQUIRED',
    );
  });

  it('rejects a selection whose option does not belong to the group', async () => {
    const charm = await souvenirFromGroup(container, 'CHARM');
    const base = await souvenirFromGroup(container, 'BASE');
    await expectCode(
      buyNormal([
        { souvenirSelections: [{ ...charm[0], optionId: base[0]!.optionId }] },
      ]),
      'SOUVENIR_SELECTION_INVALID',
    );
  });

  it('rejects an option that belongs to an inactive group', async () => {
    const charm = await defaultSouvenir(container);
    await container.config.update(
      RESOURCES.souvenirOptionGroups,
      charm[0]!.optionGroupId,
      { active: false },
      adminContext(),
    );
    await expectCode(
      buyNormal([{ souvenirSelections: charm }]),
      'SOUVENIR_SELECTION_INVALID',
    );
  });
});

describe('AC-SOU-01 exactly one custom canvas keychain entitlement per paid ticket', () => {
  it('issues one customization record per ticket', async () => {
    const souvenir = await defaultSouvenir(container);
    const { result, codes } = await buyNormalAndPay([
      { souvenirSelections: souvenir },
      { souvenirSelections: souvenir },
      { souvenirSelections: souvenir },
    ]);
    assert.equal(codes.length, 3);

    const rows = await db.query(
      `SELECT count(*)::int AS count
         FROM souvenir_customizations sc
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(
      Number(rows.rows[0].count),
      3,
      'AC-SOU-01: exactly one custom canvas keychain entitlement per paid ticket',
    );
  });

  it('creates no customization until the ticket is paid', async () => {
    const souvenir = await defaultSouvenir(container);
    const result = await buyNormal([{ souvenirSelections: souvenir }]);

    const before = await db.query(
      `SELECT count(*)::int AS count
         FROM souvenir_customizations sc
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(Number(before.rows[0].count), 0, 'No keychain before payment approval');

    await container.orderQueries.submitPaymentProof(result.order.order_number, {
      method: 'QRIS',
      amount: result.order.total_amount,
      proofFileKey: 'qa/proof.png',
    });
    await container.payments.approvePayment(result.order.id, {
      actorUserId: SEED.financeUser,
    });

    const afterCount = await db.query(
      `SELECT count(*)::int AS count
         FROM souvenir_customizations sc
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1`,
      [result.order.id],
    );
    assert.equal(
      Number(afterCount.rows[0].count),
      1,
      'Exactly one keychain customization appears once the ticket is paid',
    );
  });
});

describe('AC-SOU-03 each ticket in a multi-ticket order may differ', () => {
  it('two tickets in one order keep different charm and base selections', async () => {
    const charm = await defaultSouvenir(container);
    const base = await souvenirFromGroup(container, 'BASE');
    const ribbon = await souvenirFromGroup(container, 'RIBBON');

    const { result, codes } = await buyNormalAndPay([
      { souvenirSelections: [...charm, ...base, ...ribbon] },
      { souvenirSelections: [{ ...base[0]!, optionId: (await container.catalog
        .listSouvenirOptionGroups()
        .then((groups: any) => groups.find((g: any) => g.code === 'BASE').options[1])).id }] },
    ]);
    assert.equal(codes.length, 2);

    const rows = await db.query(
      `SELECT t.ticket_code, ss.option_group_id, ss.option_id
         FROM souvenir_selections ss
         JOIN souvenir_customizations sc ON sc.id = ss.customization_id
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY t.sequence_number, ss.option_group_id`,
      [result.order.id],
    );

    const byTicket = new Map<string, Set<string>>();
    for (const row of rows.rows) {
      const key = row.ticket_code as string;
      const set = byTicket.get(key) ?? new Set<string>();
      set.add(`${row.option_group_id}:${row.option_id}`);
      byTicket.set(key, set);
    }
    assert.equal(byTicket.size, 2);
    const [first, second] = [...byTicket.values()];
    const firstIds = [...first!].sort().join(',');
    const secondIds = [...second!].sort().join(',');
    assert.notEqual(firstIds, secondIds, 'AC-SOU-03: the two tickets must differ');
  });
});

describe('AC-SOU-04 / AC-SOU-05 the souvenir catalog is dynamic and free', () => {
  it('an admin-added group and option is immediately selectable', async () => {
    const group = await container.config.create(
      RESOURCES.souvenirOptionGroups,
      { code: 'QA_BADGE', name: 'Badge (QA)', selection_min: 1, selection_max: 1, display_order: 9, active: true },
      adminContext(),
    );
    const option = await container.config.create(
      RESOURCES.souvenirOptions,
      { option_group_id: group.id, code: 'QA_BADGE_STAR', name: 'Badge Star', display_order: 1, active: true },
      adminContext(),
    );
    try {
      const result = await buyNormal([
        { souvenirSelections: [{ optionGroupId: group.id, optionId: option.id, quantity: 1 }] },
      ]);
      const item = await scalar(
        db,
        `SELECT metadata FROM order_items WHERE order_id = $1`,
        [result.order.id],
      );
      const metadata = item.metadata as { tickets: { souvenir_selections: { optionCode: string }[] }[] };
      assert.equal(metadata.tickets[0]?.souvenir_selections[0]?.optionCode, 'QA_BADGE_STAR');
    } finally {
      await db.query(`DELETE FROM souvenir_options WHERE code = 'QA_BADGE_STAR'`);
      await db.query(`DELETE FROM souvenir_option_groups WHERE code = 'QA_BADGE'`);
    }
  });

  it('customization never changes the ticket price', async () => {
    const plain = await buyNormal([{ souvenirSelections: await defaultSouvenir(container) }]);
    const ornate = await buyNormal([
      {
        souvenirSelections: [
          ...(await souvenirFromGroup(container, 'CHARM')),
          ...(await souvenirFromGroup(container, 'BASE')),
          ...(await souvenirFromGroup(container, 'RIBBON')),
        ],
      },
    ]);
    assert.equal(plain.order.total_amount, ornate.order.total_amount);
    assert.equal(plain.order.total_amount, 250_000);
  });
});

describe('AC-SOU-06 historical selections survive later catalog edits', () => {
  it('an order snapshot keeps the original option names after an admin rename', async () => {
    const charm = await defaultSouvenir(container);
    const { result } = await buyNormalAndPay([{ souvenirSelections: charm }]);

    const original = await scalar(
      db,
      `SELECT ss.option_snapshot FROM souvenir_selections ss
         JOIN souvenir_customizations sc ON sc.id = ss.customization_id
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1 LIMIT 1`,
      [result.order.id],
    );
    const before = (original.option_snapshot as { code: string; name: string }).name;

    await db.query(`UPDATE souvenir_options SET name = 'RENAMED BY QA' WHERE id = $1`, [
      charm[0]!.optionId,
    ]);
    try {
      const after_ = await scalar(
        db,
        `SELECT ss.option_snapshot FROM souvenir_selections ss
           JOIN souvenir_customizations sc ON sc.id = ss.customization_id
           JOIN tickets t ON t.id = sc.ticket_id
           JOIN order_items oi ON oi.id = t.order_item_id
          WHERE oi.order_id = $1 LIMIT 1`,
        [result.order.id],
      );
      assert.equal(
        (after_.option_snapshot as { name: string }).name,
        before,
        'AC-SOU-06: the snapshot must not be rewritten by a catalog edit',
      );

      const item = await scalar(
        db,
        `SELECT metadata FROM order_items WHERE order_id = $1`,
        [result.order.id],
      );
      const metadata = item.metadata as {
        tickets: { souvenir_selections: { optionSnapshot: { name: string } }[] }[];
      };
      assert.equal(metadata.tickets[0]?.souvenir_selections[0]?.optionSnapshot.name, before);
    } finally {
      await db.query(`UPDATE souvenir_options SET name = $2 WHERE id = $1`, [
        charm[0]!.optionId,
        before,
      ]);
    }
  });
});





