import { AppError } from '../../core/errors.js';
import type { DiscountCodeRow, DiscountType } from '../../db/types.js';

/**
 * Discount rules are entirely data driven (BR-TKT-06).
 *
 * The Hosiana "Rp175.000 -> Rp150.000" rule is expressed ONLY as seed data:
 *   discount_codes.discount_type = 'FIXED_AMOUNT'
 *   discount_codes.discount_value = 25000
 *   discount_codes.max_total_usage = 35
 *   discount_codes.eligible_ticket_offer_id = <EARLY_BIRD offer>
 * Change the row and the effective price changes with no code change.
 */
export function discountAmountForUnit(
  discount: Pick<DiscountCodeRow, 'discount_type' | 'discount_value'>,
  unitPrice: number,
): number {
  switch (discount.discount_type as DiscountType) {
    case 'PERCENTAGE':
      return Math.floor((unitPrice * discount.discount_value) / 100);
    case 'FIXED_PRICE':
      // discount_value IS the price the customer pays.
      return Math.max(0, unitPrice - discount.discount_value);
    case 'FIXED_AMOUNT':
    default:
      return Math.min(discount.discount_value, unitPrice);
  }
}

export class PromotionService {
  /**
   * Steps 5 + 6: validate the code, that it applies to this offer, and that
   * usage capacity remains.
   *
   * The discount code row is locked `FOR UPDATE` for the rest of the
   * transaction, so the read-check-reserve sequence below is atomic with
   * respect to every concurrent checkout using the same code.
   */
  async validateAndReserve(
    client: import('pg').PoolClient,
    code: string,
    offerId: string,
    quantity: number,
    customerId: string,
  ): Promise<DiscountCodeRow> {
    // Lock first: serialises all reservations of this code.
    const { rows: locked } = await client.query<{ id: string }>(
      'SELECT id FROM discount_codes WHERE code = $1 FOR UPDATE',
      [code],
    );
    if (locked.length === 0) {
      throw new AppError('INVALID_DISCOUNT_CODE', 'Discount code is not valid.', 422, { code });
    }

    const { rows } = await client.query<DiscountCodeRow>(
      'SELECT * FROM discount_codes WHERE code = $1',
      [code],
    );
    const discount = rows[0];
    if (!discount) {
      throw new AppError('INVALID_DISCOUNT_CODE', 'Discount code is not valid.', 422, { code });
    }

    this.assertUsable(discount);

    // BR-TKT-06: the code must NOT work on offers other than its target.
    if (
      discount.eligible_ticket_offer_id !== null &&
      discount.eligible_ticket_offer_id !== offerId
    ) {
      throw new AppError(
        'INVALID_DISCOUNT_CODE_FOR_OFFER',
        'This discount code cannot be used for the selected offer.',
        422,
        { code, offerId },
      );
    }

    const perOrder = discount.max_usage_per_order;
    if (typeof perOrder === 'number' && quantity > perOrder) {
      throw new AppError(
        'DISCOUNT_CODE_EXHAUSTED',
        `This discount code can be used for at most ${perOrder} tickets per order.`,
        422,
        { code, maxPerOrder: perOrder, requested: quantity },
      );
    }

    await this.assertCapacity(client, discount, quantity, customerId);
    return discount;
  }

  private assertUsable(discount: DiscountCodeRow): void {
    if (discount.status !== 'ACTIVE') {
      throw new AppError('INVALID_DISCOUNT_CODE', 'Discount code is not active.', 422, {
        status: discount.status,
      });
    }
    const now = Date.now();
    if (discount.active_from && new Date(discount.active_from).getTime() > now) {
      throw new AppError('INVALID_DISCOUNT_CODE', 'Discount code is not yet active.', 422);
    }
    if (discount.active_until && new Date(discount.active_until).getTime() < now) {
      throw new AppError('INVALID_DISCOUNT_CODE', 'Discount code has expired.', 422);
    }
  }

  private async assertCapacity(
    client: import('pg').PoolClient,
    discount: DiscountCodeRow,
    quantity: number,
    customerId: string,
  ): Promise<void> {
    const maxTotal = discount.max_total_usage;
    if (typeof maxTotal === 'number') {
      const { rows } = await client.query<{ used: number }>(
        `SELECT COALESCE(SUM(quantity), 0)::int AS used
           FROM discount_usages
          WHERE discount_code_id = $1
            AND status IN ('RESERVED', 'CONSUMED')`,
        [discount.id],
      );
      const used = rows[0]?.used ?? 0;
      if (used + quantity > maxTotal) {
        throw new AppError(
          'DISCOUNT_CODE_EXHAUSTED',
          'This discount code has reached its usage limit.',
          409,
          { limit: maxTotal, remaining: Math.max(0, maxTotal - used) },
        );
      }
    }

    const maxPerCustomer = discount.max_usage_per_customer;
    if (typeof maxPerCustomer === 'number') {
      const { rows } = await client.query<{ used: number }>(
        `SELECT COALESCE(SUM(du.quantity), 0)::int AS used
           FROM discount_usages du
           JOIN orders o ON o.id = du.order_id
          WHERE du.discount_code_id = $1
            AND o.customer_id = $2
            AND du.status IN ('RESERVED', 'CONSUMED')`,
        [discount.id, customerId],
      );
      const used = rows[0]?.used ?? 0;
      if (used + quantity > maxPerCustomer) {
        throw new AppError(
          'DISCOUNT_CODE_EXHAUSTED',
          'You have reached the usage limit for this discount code.',
          409,
          { limit: maxPerCustomer },
        );
      }
    }
  }

  /**
   * Step 11: append the reservation to the ledger. `ticket_id` is left NULL at
   * order time (tickets do not exist yet); approval links each unit per ticket
   * via the `discount_usages_one_per_ticket` index.
   */
  async reserve(
    client: import('pg').PoolClient,
    discountCodeId: string,
    orderId: string,
    quantity: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO discount_usages
         (discount_code_id, order_id, ticket_id, quantity, status, reserved_at,
          created_at, updated_at)
       VALUES ($1, $2, NULL, $3, 'RESERVED', now(), now(), now())`,
      [discountCodeId, orderId, quantity],
    );
  }

  /** Approval: RESERVED -> CONSUMED (BR-PAY-07). */
  async consume(client: import('pg').PoolClient, orderId: string): Promise<void> {
    await client.query(
      `UPDATE discount_usages
          SET status = 'CONSUMED', consumed_at = now()
        WHERE order_id = $1 AND status = 'RESERVED'`,
      [orderId],
    );
  }

  /** Rejection / expiry: RESERVED -> RELEASED (BR-PAY-04, BR-PAY-05). */
  async release(client: import('pg').PoolClient, orderId: string): Promise<void> {
    await client.query(
      `UPDATE discount_usages
          SET status = 'RELEASED', released_at = now()
        WHERE order_id = $1 AND status = 'RESERVED'`,
      [orderId],
    );
  }
}