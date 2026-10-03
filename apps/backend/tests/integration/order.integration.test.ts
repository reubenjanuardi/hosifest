import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/core/errors.js';
import { buildContainer } from '../../src/modules/container.js';
import type { Container } from '../../src/modules/container.js';
import { loadEnv } from '../../src/config/env.js';
import type { Database } from '../../src/db/database.js';
import {
  cleanupOrders,
  integrationEnabled,
  makeDatabase,
  openSalesWindows,
  resetQuota,
  SEED,
} from './harness.js';

const describeIfDb = integrationEnabled ? describe : describe.skip;

describeIfDb('order creation against the real schema', () => {
  let db: Database;
  let container: Container;

  beforeAll(() => {
    db = makeDatabase();
    container = buildContainer(
      loadEnv({
        ...process.env,
        // Socket-based runs (Windows throwaway instance) still need a non-empty
        // DATABASE_URL to satisfy env validation; the actual host/port are
        // passed separately by makeDatabase().
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://localhost/hosifest_test',
        JWT_SECRET: 'integration-test-secret-value-32ch',
      }),
      { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await cleanupOrders(db);
    await resetQuota(db);
    await openSalesWindows(db);
  });

  const customer = {
    name: 'Reuben P',
    email: 'reuben@example.com',
    phone: '08123456789',
  };

  async function catalog() {
    const [beverages, groups] = await Promise.all([
      container.catalog.listBeverageOptions(),
      container.catalog.listSouvenirOptionGroups(),
    ]);
    return {
      beverage: beverages[0]?.id ?? '',
      group: groups[0]?.id ?? '',
      option: groups[0]?.options[0]?.id ?? '',
    };
  }

  it('AC-CHK-01/02: prices the order server-side and sets a 30-minute deadline', async () => {
    const { beverage, group, option } = await catalog();
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerNormal,
          quantity: 1,
          tickets: [{ souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] }],
        },
      ],
    });

    // Normal/OTS is seeded at Rp250.000 and takes no discount.
    expect(result.order.total_amount).toBe(250_000);
    expect(result.order.discount_amount).toBe(0);
    expect(result.order.status).toBe('WAITING_PAYMENT');

    // AC-CHK-04: expires_at is ~30 minutes after creation.
    const windowMs =
      new Date(result.order.expires_at as string).getTime() -
      new Date(result.order.created_at).getTime();
    expect(Math.round(windowMs / 60_000)).toBe(30);
  });

  it('AC-CHK-03: reserves quota on the offer and its allocation', async () => {
    const { group, option } = await catalog();
    await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerNormal,
          quantity: 2,
          tickets: [
            { souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] },
            { souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] },
          ],
        },
      ],
    });

    const { rows } = await db.query<{ reserved: number }>(
      'SELECT reserved_quantity AS reserved FROM ticket_offers WHERE id = $1',
      [SEED.offerNormal],
    );
    expect(rows[0]?.reserved).toBe(2);

    const { rows: alloc } = await db.query<{ reserved: number }>(
      'SELECT reserved_quantity AS reserved FROM offer_allocations WHERE id = $1',
      [SEED.allocationNormal],
    );
    expect(alloc[0]?.reserved).toBe(2);
  });

  it('AC-CHK-03: refuses to oversell when the reservation would exceed quota', async () => {
    await db.query('UPDATE ticket_offers SET quota = 1 WHERE id = $1', [SEED.offerNormal]);
    await db.query('UPDATE offer_allocations SET quota = 1 WHERE id = $1', [SEED.allocationNormal]);

    const { group, option } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerNormal,
            quantity: 1,
            tickets: [{ souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] }],
          },
        ],
      }),
    ).resolves.toBeTruthy();

    // Second order exceeds the configured quota of 1.
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { ...customer, phone: '08999999999' },
        items: [
          {
            ticketOfferId: SEED.offerNormal,
            quantity: 1,
            tickets: [{ souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });

    // The failed attempt must not have leaked a reservation.
    const { rows } = await db.query<{ reserved: number; sold: number }>(
      'SELECT reserved_quantity AS reserved, sold_quantity AS sold FROM ticket_offers WHERE id = $1',
      [SEED.offerNormal],
    );
    expect(rows[0]?.reserved).toBe(1);
    expect(rows[0]?.sold).toBe(0);
  });

  it('AC-PS-03: requires a beverage for a mandatory Presale benefit', async () => {
    const { group, option } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerPresale,
            quantity: 1,
            tickets: [{ souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'BEVERAGE_REQUIRED' });
  });

  it('AC-PS-01/02: Presale accepts a beverage and prices at the configured amount', async () => {
    const { beverage, group, option } = await catalog();
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerPresale,
          quantity: 1,
          tickets: [
            {
              beverageOptionId: beverage,
              souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
            },
          ],
        },
      ],
    });
    expect(result.order.total_amount).toBe(225_000);
  });

  it('AC-SOU-02: souvenir customization is mandatory', async () => {
    const { beverage } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerPresale,
            quantity: 1,
            tickets: [{ beverageOptionId: beverage }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'SOUVENIR_SELECTION_REQUIRED' });
  });

  it('AC-EB-04/06: a Hosiana Early Bird needs the code and gets the effective price', async () => {
    const { group, option } = await catalog();
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerEarlyBird,
          quantity: 1,
          tickets: [
            {
              congregationId: SEED.congregationHosiana,
              discountCode: SEED.discountCode,
              souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
            },
          ],
        },
      ],
    });
    // Rp175.000 base - Rp25.000 configured discount = Rp150.000.
    expect(result.order.subtotal_amount).toBe(175_000);
    expect(result.order.discount_amount).toBe(25_000);
    expect(result.order.total_amount).toBe(150_000);
  });

  it('AC-EB-04: the Hosiana allocation rejects a missing discount code', async () => {
    const { group, option } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerEarlyBird,
            quantity: 1,
            tickets: [
              {
                congregationId: SEED.congregationHosiana,
                souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DISCOUNT_CODE' });
  });

  it('AC-EB-05: the discount is capped at its configured total usage', async () => {
    const { group, option } = await catalog();
    // Configure a cap of 1 to keep the test fast; production seed is 35.
    await db.query('UPDATE discount_codes SET max_total_usage = 1 WHERE id = $1', [
      SEED.discountHosiana,
    ]);

    const buy = (phone: string) =>
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer: { ...customer, phone },
        items: [
          {
            ticketOfferId: SEED.offerEarlyBird,
            quantity: 1,
            tickets: [
              {
                congregationId: SEED.congregationHosiana,
                discountCode: SEED.discountCode,
                souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
              },
            ],
          },
        ],
      });

    await expect(buy('081100000001')).resolves.toBeTruthy();
    await expect(buy('081100000002')).rejects.toMatchObject({ code: 'DISCOUNT_CODE_EXHAUSTED' });

    await db.query('UPDATE discount_codes SET max_total_usage = 35 WHERE id = $1', [
      SEED.discountHosiana,
    ]);
  });

  it('AC-EB-02: an Early Bird congregation must come from the configured list', async () => {
    const { group, option } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerEarlyBird,
            quantity: 1,
            tickets: [
              {
                // Not a configured congregation id.
                congregationId: '11111111-1111-4111-8111-111111111111',
                souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'CONGREGATION_NOT_ELIGIBLE' });
  });

  it('BR-TKT-06: the discount must not work on a non-Early-Bird offer', async () => {
    const { beverage, group, option } = await catalog();
    await expect(
      container.orders.createOrder({
        eventSlug: SEED.eventSlug,
        customer,
        items: [
          {
            ticketOfferId: SEED.offerPresale,
            quantity: 1,
            tickets: [
              {
                discountCode: SEED.discountCode,
                beverageOptionId: beverage,
                souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_DISCOUNT_CODE_FOR_OFFER' });
  });

  it('AC-SOU-03: two tickets in one order may carry different souvenirs', async () => {
    const beverages = await container.catalog.listBeverageOptions();
    const groups = await container.catalog.listSouvenirOptionGroups();
    const beverage = beverages[0]?.id ?? '';
    const first = groups[0];
    const second = groups[1];
    expect(first && second).toBeTruthy();
    expect(beverage, 'AC-SOU-03: the Presale offer requires a real beverage option').not.toBe('');
    if (!first || !second) return;

    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerPresale,
          quantity: 2,
          tickets: [
            {
              beverageOptionId: beverage,
              souvenirSelections: [
                { optionGroupId: first.id, optionId: first.options[0]?.id ?? '', quantity: 1 },
              ],
            },
            {
              beverageOptionId: beverage,
              souvenirSelections: [
                { optionGroupId: second.id, optionId: second.options[0]?.id ?? '', quantity: 1 },
              ],
            },
          ],
        },
      ],
    });

    const metadata = result.items[0]?.metadata as { tickets: { souvenir_selections: unknown[] }[] };
    expect(metadata.tickets).toHaveLength(2);
    expect(metadata.tickets[0]?.souvenir_selections[0]).not.toEqual(
      metadata.tickets[1]?.souvenir_selections[0],
    );
  });

  it('AC-TKT-04: a later price change does not rewrite an existing order', async () => {
    const { group, option } = await catalog();
    const result = await container.orders.createOrder({
      eventSlug: SEED.eventSlug,
      customer,
      items: [
        {
          ticketOfferId: SEED.offerNormal,
          quantity: 1,
          tickets: [{ souvenirSelections: [{ optionGroupId: group, optionId: option, quantity: 1 }] }],
        },
      ],
    });

    await db.query('UPDATE ticket_offers SET base_price = 999999 WHERE id = $1', [SEED.offerNormal]);

    const { rows } = await db.query<{ total_amount: number }>(
      'SELECT total_amount FROM orders WHERE id = $1',
      [result.order.id],
    );
    expect(rows[0]?.total_amount).toBe(250_000);

    await db.query('UPDATE ticket_offers SET base_price = 250000 WHERE id = $1', [SEED.offerNormal]);
  });
});
