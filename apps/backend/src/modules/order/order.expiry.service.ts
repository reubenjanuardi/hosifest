import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import { applyQuotaChange, type QuotaChangeTarget } from '../../db/quota.js';
import type { OrderItemRow, OrderRow } from '../../db/types.js';
import type { PromotionService } from '../promotion/promotion.service.js';

/**
 * Aggregate an order's ticket quantities into one change per
 * (offer, allocation) bucket. `order_items.allocation_id` is a real FK, so the
 * bucket does not have to be recovered from JSONB.
 */
export async function quotaTargetsForOrder(
  client: PoolClient,
  orderId: string,
): Promise<QuotaChangeTarget[]> {
  const { rows: items } = await client.query<OrderItemRow>(
    `SELECT * FROM order_items WHERE order_id = $1 AND item_type = 'TICKET'`,
    [orderId],
  );

  const byKey = new Map<string, QuotaChangeTarget>();
  for (const item of items) {
    const offerId = item.ticket_offer_id ?? '';
    const allocationId = item.allocation_id;
    const key = `${offerId}:${allocationId ?? 'offer'}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      byKey.set(key, {
        offerId,
        allocationId,
        quantity: item.quantity,
        reservedDelta: 0,
        soldDelta: 0,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Order expiration (BR-PAY-04, AC-CHK-06).
 *
 * An unpaid order past its deadline becomes EXPIRED and both its ticket quota
 * reservation and its discount reservation are released. The caller must hold a
 * row lock on the order, which makes this safe from a scheduler, from the lazy
 * check in the payment-proof path, or from an admin sweep.
 */
export class ExpiryService {
  constructor(
    private readonly db: Database,
    private readonly promotions: PromotionService,
  ) {}

  /** Release reserved capacity and the discount reservation. */
  async releaseReservations(client: PoolClient, orderId: string): Promise<void> {
    const targets = await quotaTargetsForOrder(client, orderId);
    const changes = targets
      .map((target) => ({ ...target, reservedDelta: -target.quantity, soldDelta: 0 }))
      .filter((change) => change.reservedDelta !== 0 || change.soldDelta !== 0);
    if (changes.length > 0) {
      await applyQuotaChange(client, changes);
    }
    await this.promotions.release(client, orderId);
  }

  /**
   * Expire a single order. MUST run inside a transaction that already holds
   * `SELECT ... FROM orders WHERE id = $1 FOR UPDATE` on this order.
   */
  async expireWithin(client: PoolClient, orderId: string): Promise<boolean> {
    const { rows } = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = rows[0];
    if (!order) return false;
    if (order.status !== 'WAITING_PAYMENT' && order.status !== 'PAYMENT_REVIEW') return false;
    if (!order.expires_at) return false;
    if (new Date(order.expires_at).getTime() > Date.now()) return false;

    await this.releaseReservations(client, orderId);
    await client.query(
      `UPDATE orders
          SET status = 'EXPIRED', expired_at = now(), updated_at = now()
        WHERE id = $1`,
      [orderId],
    );
    await this.recordTransition(client, order, 'EXPIRED', 'payment window elapsed', null);
    return true;
  }

  /**
   * Append-only order history. `order_status_history` exists for exactly this,
   * and makes every state transition auditable.
   */
  async recordTransition(
    client: PoolClient,
    order: OrderRow,
    toStatus: string,
    reason: string,
    changedBy: string | null,
  ): Promise<void> {
    await client.query(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, reason, changed_by, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [order.id, order.status, toStatus, reason, changedBy],
    );
  }

  /**
   * Sweep overdue orders. Safe to run repeatedly and concurrently: each order is
   * locked individually and the state guard makes the transition a no-op the
   * second time round.
   */
  async sweepExpiredOrders(limit = 200): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT id FROM orders
        WHERE status IN ('WAITING_PAYMENT', 'PAYMENT_REVIEW')
          AND expires_at IS NOT NULL
          AND expires_at <= now()
        ORDER BY expires_at
        LIMIT $1`,
      [limit],
    );

    let expired = 0;
    for (const candidate of rows) {
      const didExpire = await this.db.transaction(async (client) => {
        await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [candidate.id]);
        return this.expireWithin(client, candidate.id);
      });
      if (didExpire) expired += 1;
    }
    return expired;
  }
}

export { AppError };