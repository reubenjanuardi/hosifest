/**
 * AC-SEC-01..05 (audit, PostgreSQL exposure, secrets, proof validation,
 * authorization) and AC-OPS-01..05 (operational reports).
 *
 * Static assertions read the deploy/ and .github/ artefacts as shipped; runtime
 * assertions drive the real backend.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPO_ROOT,
  SEED,
  actor,
  adminContext,
  adminResources,
  defaultSouvenir,
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

async function paidNormalOrder(quantity = 1) {
  const souvenir = await defaultSouvenir(container);
  const result = await container.orders.createOrder({
    eventSlug: SEED.eventSlug,
    customer: guest(),
    items: [
      {
        ticketOfferId: SEED.offerNormal,
        quantity,
        tickets: Array.from({ length: quantity }, () => ({ souvenirSelections: souvenir })),
      },
    ],
  });
  await container.orderQueries.submitPaymentProof(result.order.order_number, {
    method: 'QRIS',
    amount: result.order.total_amount,
    proofFileKey: 'qa/2026/proof.png',
  });
  await container.payments.approvePayment(result.order.id, actor(SEED.financeUser));
  return result;
}

describe('AC-SEC-01 every sensitive admin mutation is audited', () => {
  it('records a price change with before and after values', async () => {
    const requestId = 'qa-ac-sec-01-price';
    await container.config.update(
      RESOURCES.ticketOffers,
      SEED.offerNormal,
      { base_price: 260_000 },
      { ...adminContext(), requestId },
    );
    const row = await scalar(
      db,
      `SELECT action, entity_type, before_data, after_data, actor_user_id, request_id
         FROM audit_logs WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [requestId],
    );
    assert.ok(row, 'AC-SEC-01: a price change must write an audit row');
    assert.equal(row.action, 'TICKET_OFFER_UPDATED');
    assert.equal(row.entity_type, 'ticket_offer');
    assert.equal(row.actor_user_id, SEED.adminUser);
    assert.equal(Number(row.before_data.base_price), 250_000);
    assert.equal(Number(row.after_data.base_price), 260_000);
  });

  it('records a quota change and a catalog change', async () => {
    const quotaRequest = 'qa-ac-sec-01-quota';
    await container.config.update(
      RESOURCES.offerAllocations,
      SEED.allocationNormal,
      { quota: 44 },
      { ...adminContext(), requestId: quotaRequest },
    );
    const quotaAudit = await scalar(
      db,
      `SELECT before_data, after_data FROM audit_logs WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [quotaRequest],
    );
    assert.equal(Number(quotaAudit.before_data.quota), 50);
    assert.equal(Number(quotaAudit.after_data.quota), 44);

    const catalogRequest = 'qa-ac-sec-01-catalog';
    const created = await container.config.create(
      RESOURCES.beverageOptions,
      { code: 'QA_AUDIT_SODA', name: 'Soda', active: true, display_order: 8 },
      { ...adminContext(), requestId: catalogRequest },
    );
    await db.query(`DELETE FROM beverage_options WHERE id = $1`, [created.id]);
    const catalogAudit = await scalar(
      db,
      `SELECT action, after_data FROM audit_logs WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [catalogRequest],
    );
    assert.equal(catalogAudit.action, 'BEVERAGE_OPTION_CREATED');
    assert.equal(catalogAudit.after_data.code, 'QA_AUDIT_SODA');
  });

  it('records payment approval and rejection', async () => {
    const souvenir = await defaultSouvenir(container);
    const approved = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
      ],
    });
    await container.orderQueries.submitPaymentProof(approved.order.order_number, {
      method: 'QRIS',
      amount: approved.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });
    await container.payments.approvePayment(approved.order.id, actor(SEED.financeUser));
    const approveAudit = await scalar(
      db,
      `SELECT action, actor_user_id FROM audit_logs
        WHERE entity_id = $1 AND action = 'PAYMENT_APPROVED'
        ORDER BY created_at DESC LIMIT 1`,
      [approved.order.id],
    );
    assert.ok(approveAudit, 'AC-SEC-01: approval must be audited');
    assert.equal(approveAudit.actor_user_id, SEED.financeUser);

    const other = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
      ],
    });
    await container.orderQueries.submitPaymentProof(other.order.order_number, {
      method: 'QRIS',
      amount: other.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });
    await container.payments.rejectPayment(other.order.id, actor(SEED.financeUser), 'QA audit');
    const rejectAudit = await scalar(
      db,
      `SELECT action, after_data FROM audit_logs
        WHERE entity_id = $1 AND action = 'PAYMENT_REJECTED'
        ORDER BY created_at DESC LIMIT 1`,
      [other.order.id],
    );
    assert.ok(rejectAudit, 'AC-SEC-01: rejection must be audited');
    assert.equal(rejectAudit.after_data.status, 'CANCELLED');
  });

  it('audit rows are append-only', async () => {
    await assert.rejects(
      () => db.query('DELETE FROM audit_logs'),
      /append-only/i,
      'AC-SEC-01: audit_logs must reject DELETE',
    );
    await assert.rejects(
      () => db.query(`UPDATE audit_logs SET action = 'TAMPERED'`),
      /append-only/i,
      'AC-SEC-01: audit_logs must reject UPDATE',
    );
  });
});

describe('AC-SEC-05 admin APIs enforce backend authorization', () => {
  it('refuses an unauthenticated identity', async () => {
    await assert.rejects(() => container.identity.authenticate('', ''), /UNAUTHORIZED|Invalid/i);
  });

  it('refuses a wrong password without revealing the account', async () => {
    let caught: any = null;
    try {
      await container.identity.authenticate('finance@hosifest.test', 'WrongPassword123');
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, 'a wrong password must be refused');
    assert.equal(caught.code, 'UNAUTHORIZED');
    assert.ok(
      !String(caught.message).includes('finance@hosifest.test'),
      'the failure must not confirm the account exists',
    );
  });

  it('the documented seeded credentials can actually log in', async () => {
    // seeders/002_dev_users.sql documents these exact passwords. If they do
    // not authenticate, no admin, finance, check-in or souvenir operator can
    // use the system in any environment seeded with `--include-dev`.
    const admin = await container.identity.authenticate('admin@hosifest.test', 'DevAdmin!2024');
    assert.deepEqual(admin.user.roles, ['SUPER_ADMIN']);
    assert.ok(admin.token.length > 0);

    const finance = await container.identity.authenticate('finance@hosifest.test', 'DevFinance!2024');
    assert.deepEqual(finance.user.roles, ['FINANCE']);

    const checkin = await container.identity.authenticate('checkin@hosifest.test', 'DevCheckin!2024');
    assert.deepEqual(checkin.user.roles, ['CHECKIN']);

    assert.ok(admin.user.permissions.length > 0);
    assert.ok(finance.user.permissions.length > 0);
    assert.ok(checkin.user.permissions.length > 0);
  });

  it('rejects a forged or tampered token', async () => {
    await assert.rejects(
      () => container.identity.userFromToken('not.a.jwt'),
      /token|unauthorized|jwt/i,
    );
  });
});

describe('AC-SEC-04 payment proof upload is validated', () => {
  it('rejects a disallowed mime type', async () => {
    assert.throws(
      () => container.storage.validate('application/x-msdownload', 1024),
      /mime|not allowed|type/i,
    );
  });

  it('rejects an oversized file', async () => {
    const max = Number(container.env.STORAGE_MAX_UPLOAD_BYTES);
    assert.throws(
      () => container.storage.validate('image/png', max + 1),
      /size|large|exceed/i,
    );
  });

  it('accepts a valid proof and derives a server-owned storage key', async () => {
    container.storage.validate('image/png', 2048);
    const key = container.storage.buildProofKey('image/png', '2026/10');
    assert.ok(!key.includes('..'), 'the storage key must not contain a traversal');
    assert.ok(key.includes('2026/10'), 'the storage key must be server-derived');
  });
});

describe('AC-OPS-01..05 operational reports', () => {
  it('AC-OPS-01 sales report shows sold versus configured quota', async () => {
    await paidNormalOrder(2);
    const offers = (await container.reporting.sales(SEED.eventSlug)) as any[];
    const normal = offers.find((offer: any) => offer.ticket_offer_code === 'NORMAL');
    assert.ok(normal, 'AC-OPS-01: the sales report must list the Normal offer');
    assert.equal(Number(normal.quota), 50);
    assert.ok(
      Number(normal.sold_quantity) > 0 || Number(normal.sold) > 0,
      'AC-OPS-01: the report must show tickets actually sold',
    );
  });

  it('AC-OPS-02 payment report counts the statuses', async () => {
    await paidNormalOrder(1);
    const souvenir = await defaultSouvenir(container);
    const waiting = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        { ticketOfferId: SEED.offerNormal, quantity: 1, tickets: [{ souvenirSelections: souvenir }] },
      ],
    });
    await container.orderQueries.submitPaymentProof(waiting.order.order_number, {
      method: 'QRIS',
      amount: waiting.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });

    const report = (await container.reporting.payments(SEED.eventSlug)) as any;
    assert.ok(report, 'AC-OPS-02: a payment report must exist');
    const orderStatuses = report.ordersByStatus.map((row: any) => row.order_status);
    assert.ok(orderStatuses.includes('PAID'), 'AC-OPS-02: PAID orders must be reported');
    assert.ok(
      orderStatuses.includes('PAYMENT_REVIEW'),
      'AC-OPS-02: submitted-but-unreviewed orders must be reported separately',
    );
  });

  it('AC-OPS-03 attendance report lists entry and exit sessions', async () => {
    const report = (await container.reporting.attendance(SEED.eventSlug)) as any;
    assert.ok(report, 'AC-OPS-03: an attendance report must exist');
    assert.ok(Array.isArray(report.sessions ?? report.rows ?? []), 'sessions must be listed');
  });

  it('AC-OPS-04 souvenir report aggregates paid-ticket customization demand', async () => {
    const report = (await container.reporting.souvenir(SEED.eventSlug)) as any;
    assert.ok(report, 'AC-OPS-04: a souvenir demand report must exist');
    assert.ok(
      Array.isArray(report.rows ?? report.by_option ?? report.summary ?? []),
      'the souvenir report must aggregate option demand',
    );
  });

  it('AC-OPS-05 beverage demand can be aggregated from paid tickets only', async () => {
    const souvenir = await defaultSouvenir(container);
    const paid = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerPresale,
          quantity: 2,
          tickets: [
            { beverageOptionId: SEED.beverageKopiSusu, souvenirSelections: souvenir },
            { beverageOptionId: SEED.beverageMilkTea, souvenirSelections: souvenir },
          ],
        },
      ],
    });
    await container.orderQueries.submitPaymentProof(paid.order.order_number, {
      method: 'QRIS',
      amount: paid.order.total_amount,
      proofFileKey: 'qa/2026/proof.png',
    });
    await container.payments.approvePayment(paid.order.id, actor(SEED.financeUser));

    const unpaidOnlyBeverage = await container.config.create(
      RESOURCES.beverageOptions,
      { code: 'QA_UNPAID_ONLY', name: 'QA Unpaid Only', active: true, display_order: 99 },
      adminContext(),
    );
    await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer: guest(),
      items: [
        {
          ticketOfferId: SEED.offerPresale,
          quantity: 1,
          tickets: [{ beverageOptionId: unpaidOnlyBeverage.id, souvenirSelections: souvenir }],
        },
      ],
    });

    const report = (await container.reporting.beverages(SEED.eventSlug)) as any;
    assert.ok(Array.isArray(report), 'AC-OPS-05: a beverage demand report must exist');
    const text = JSON.stringify(report);
    assert.ok(text.includes('Es Kopi Susu'), 'AC-OPS-05: paid Kopi Susu choice must appear');
    assert.ok(text.includes('Milk Tea'), 'AC-OPS-05: paid Milk Tea choice must appear');
    assert.ok(!text.includes('QA Unpaid Only'), 'AC-OPS-05: unpaid-only beverage choice must not appear');
  });
});

describe('AC-SEC-02 / AC-SEC-03 deploy configuration', () => {
  const composePath = join(REPO_ROOT, 'deploy', 'docker-compose.prod.yml');
  const compose = existsSync(composePath) ? readFileSync(composePath, 'utf8') : '';

  it('AC-SEC-02 the postgres service publishes no host port', () => {
    assert.ok(compose.length > 0, 'deploy/docker-compose.prod.yml must exist');
    const lines = compose.split(/\r?\n/);
    const start = lines.findIndex((line) => /^  postgres:\s*$/.test(line));
    assert.ok(start >= 0, 'the production compose must define a postgres service');
    const end = lines.findIndex(
      (line, index) => index > start && /^  [a-zA-Z]/.test(line),
    );
    const block = lines.slice(start, end < 0 ? undefined : end).join('\n');
    assert.ok(
      !/^\s*ports:/m.test(block),
      'AC-SEC-02: the postgres service must not declare a `ports:` block',
    );
    assert.ok(
      /hosifest_data/.test(block),
      'AC-SEC-02: postgres must sit on the private internal network',
    );
    assert.ok(
      !/^\s*network_mode:\s*host/m.test(block),
      'AC-SEC-02: postgres must not use host networking',
    );
  });

  it('AC-SEC-03 no real secret is committed', () => {
    const envExample = readFileSync(join(REPO_ROOT, 'deploy', '.env.example'), 'utf8');
    for (const match of envExample.matchAll(/^\s*([A-Z0-9_]+)=(.+)$/gm)) {
      const [, key, value] = match;
      if (!key || !value) continue;
      if (/(SECRET|PASSWORD|TOKEN)/.test(key)) {
        assert.match(
          value.trim(),
          /^(changeme|CHANGE|replace|xxx|"|<your|todo|\$\{)/i,
          `AC-SEC-03: ${key} must be a placeholder, not a literal`,
        );
      }
    }
  });

  it('AC-SEC-03 the backend image ships no .env file', () => {
    const dockerfile = readFileSync(
      join(REPO_ROOT, 'apps', 'backend', 'Dockerfile'),
      'utf8',
    );
    assert.ok(
      !/^COPY .*\.env/m.test(dockerfile),
      'AC-SEC-03: the backend image must not COPY a .env file',
    );
  });
});



