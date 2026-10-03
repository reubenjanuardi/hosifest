import { describe, expect, it } from 'vitest';
import { createOrderSchema } from '../../src/modules/order/order.schema.js';
import { buildSelections } from '../../src/modules/order/order.service.js';
import { generateOrderNumber, generateQrToken, generateTicketCode } from '../../src/core/errors.js';

describe('create order schema', () => {
  const valid = {
    eventSlug: 'hosifest',
    customer: { name: 'Reuben', phone: '08123456789' },
    items: [{ ticketOfferId: '11111111-1111-4111-8111-111111111111', quantity: 1, tickets: [] }],
  };

  it('accepts a minimal valid order', () => {
    expect(() => createOrderSchema.parse(valid)).not.toThrow();
  });

  it('rejects a non-uuid ticket offer id', () => {
    expect(() =>
      createOrderSchema.parse({ ...valid, items: [{ ticketOfferId: 'nope', quantity: 1 }] }),
    ).toThrow();
  });

  it('rejects a non-positive quantity', () => {
    expect(() =>
      createOrderSchema.parse({
        ...valid,
        items: [{ ticketOfferId: '11111111-1111-4111-8111-111111111111', quantity: 0 }],
      }),
    ).toThrow();
  });

  /**
   * The client must never be able to influence money. The schema has no
   * total/price field at all, so a client-sent total is structurally ignored
   * rather than merely overwritten.
   */
  it('ignores a client-sent total because the schema does not accept one', () => {
    const parsed = createOrderSchema.parse({
      ...valid,
      totalAmount: 1,
      subtotalAmount: 1,
      items: [
        {
          ticketOfferId: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
          unitPrice: 1,
          totalAmount: 1,
        },
      ],
    });
    expect(parsed).not.toHaveProperty('totalAmount');
    expect(parsed.items[0]).not.toHaveProperty('unitPrice');
    expect(parsed.items[0]).not.toHaveProperty('totalAmount');
  });

  it('requires a phone number (guest checkout still needs a contact)', () => {
    expect(() => createOrderSchema.parse({ ...valid, customer: { name: 'Reuben' } })).toThrow();
  });
});

describe('per-ticket selection expansion (BR-TKT-08)', () => {
  it('expands a quantity without per-ticket data into N selections', () => {
    expect(buildSelections({ quantity: 3, tickets: [] }, 3)).toHaveLength(3);
  });

  it('keeps each supplied ticket distinct (per-ticket benefit/souvenir data)', () => {
    const selections = buildSelections(
      {
        quantity: 2,
        tickets: [
          {
            beverageOptionId: 'bev-1',
            souvenirSelections: [{ optionGroupId: 'g', optionId: 'opt-a', quantity: 1 }],
          },
          {
            beverageOptionId: 'bev-2',
            souvenirSelections: [{ optionGroupId: 'g', optionId: 'opt-b', quantity: 1 }],
          },
        ],
      },
      2,
    );
    expect(selections).toHaveLength(2);
    expect(selections[0]?.beverageOptionId).toBe('bev-1');
    expect(selections[1]?.beverageOptionId).toBe('bev-2');
    // AC-SOU-03: different tickets may carry different configurations.
    expect(selections[0]?.souvenirSelections?.[0]?.optionId).toBe('opt-a');
    expect(selections[1]?.souvenirSelections?.[0]?.optionId).toBe('opt-b');
  });

  it('ignores surplus tickets beyond the declared quantity', () => {
    expect(
      buildSelections({ quantity: 1, tickets: [{ beverageOptionId: 'a' }, { beverageOptionId: 'b' }] }, 1),
    ).toHaveLength(1);
  });

  it('does not invent eligibility data for a missing ticket', () => {
    const selections = buildSelections(
      { quantity: 2, tickets: [{ congregationId: 'c1', discountCode: 'CODE' }] },
      2,
    );
    // The second ticket must stay empty so the mandatory validators raise a
    // precise error instead of silently reusing ticket 1's discount code.
    expect(selections[1]?.discountCode).toBeNull();
    expect(selections[1]?.congregationId).toBeNull();
  });
});

describe('identifier generation', () => {
  it('produces ticket codes matching the public HOS-XXXX format', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateTicketCode()).toMatch(/^HOS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it('excludes visually ambiguous characters from the suffix (I/O/0/1)', () => {
    for (let i = 0; i < 500; i += 1) {
      const suffix = generateTicketCode().replace('HOS-', '');
      expect(suffix).not.toMatch(/[IO01]/);
    }
  });

  it('never repeats ticket codes', () => {
    expect(new Set(Array.from({ length: 2000 }, () => generateTicketCode())).size).toBe(2000);
  });

  it('never repeats order numbers', () => {
    expect(new Set(Array.from({ length: 2000 }, () => generateOrderNumber())).size).toBe(2000);
  });

  it('generates high-entropy opaque QR tokens with no personal data', () => {
    const token = generateQrToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toMatch(/@|HOS-|hosiana/i);
    expect(new Set(Array.from({ length: 2000 }, () => generateQrToken())).size).toBe(2000);
  });
});