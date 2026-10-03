import type { DiscountCodeRow } from '../../db/types.js';
import { discountAmountForUnit } from '../promotion/promotion.service.js';

/**
 * Authoritative price calculation. Pure function: no database access, no
 * environment reads, no hardcoded amounts. Every input comes from
 * configuration rows, so a price change in the database takes effect
 * immediately without a deployment.
 */
export interface PricedTicket {
  unitPrice: number;
  discount: number;
}

export function priceTicket(
  unitPrice: number,
  discount: Pick<DiscountCodeRow, 'discount_type' | 'discount_value'> | null,
): PricedTicket {
  if (!discount) return { unitPrice, discount: 0 };
  return { unitPrice, discount: discountAmountForUnit(discount, unitPrice) };
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  total: number;
}

export function computeTotals(tickets: readonly PricedTicket[]): OrderTotals {
  const subtotal = tickets.reduce((sum, ticket) => sum + ticket.unitPrice, 0);
  const discount = tickets.reduce((sum, ticket) => sum + ticket.discount, 0);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}