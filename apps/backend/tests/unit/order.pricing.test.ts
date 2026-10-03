import { describe, expect, it } from 'vitest';
import { discountAmountForUnit } from '../../src/modules/promotion/promotion.service.js';
import { computeTotals, priceTicket } from '../../src/modules/order/order.pricing.js';
import type { DiscountType } from '../../src/db/types.js';

const discount = (type: DiscountType, value: number) => ({
  discount_type: type,
  discount_value: value,
});

/**
 * The backend is authoritative for price. These tests use ARBITRARY numbers,
 * never the real business values, which proves the calculation is driven by
 * configuration input rather than hardcoded constants.
 */
describe('order pricing', () => {
  it('returns the offer price unchanged when no discount applies', () => {
    expect(priceTicket(175_000, null)).toEqual({ unitPrice: 175_000, discount: 0 });
  });

  it('applies a FIXED_AMOUNT discount (the Hosiana Early Bird pattern)', () => {
    const priced = priceTicket(175_000, discount('FIXED_AMOUNT', 25_000));
    expect(priced.discount).toBe(25_000);
    expect(priced.unitPrice - priced.discount).toBe(150_000);
  });

  it('applies a PERCENTAGE discount', () => {
    expect(discountAmountForUnit(discount('PERCENTAGE', 10), 200_000)).toBe(20_000);
  });

  it('treats FIXED_PRICE as a target price, not an amount off', () => {
    // discount_value IS the price the customer pays.
    expect(discountAmountForUnit(discount('FIXED_PRICE', 150_000), 175_000)).toBe(25_000);
  });

  it('applies no reduction when FIXED_PRICE equals the offer price', () => {
    expect(discountAmountForUnit(discount('FIXED_PRICE', 175_000), 175_000)).toBe(0);
  });

  it('never discounts a single ticket below zero', () => {
    const priced = priceTicket(175_000, discount('FIXED_AMOUNT', 999_999));
    expect(priced.discount).toBeLessThanOrEqual(175_000);
    expect(computeTotals([priced]).total).toBe(0);
  });

  it('computes subtotal, discount and total from per-ticket prices', () => {
    const totals = computeTotals([
      { unitPrice: 225_000, discount: 0 },
      { unitPrice: 225_000, discount: 0 },
    ]);
    expect(totals).toEqual({ subtotal: 450_000, discount: 0, total: 450_000 });
  });

  it('supports mixed discounted and full-price tickets in one order', () => {
    const totals = computeTotals([
      { unitPrice: 175_000, discount: 25_000 },
      { unitPrice: 175_000, discount: 0 },
    ]);
    expect(totals.subtotal).toBe(350_000);
    expect(totals.discount).toBe(25_000);
    expect(totals.total).toBe(325_000);
  });

  it('is a pure function of its inputs', () => {
    const a = computeTotals([{ unitPrice: 1_000, discount: 100 }]);
    const b = computeTotals([{ unitPrice: 1_000, discount: 100 }]);
    expect(a).toEqual(b);
  });
});