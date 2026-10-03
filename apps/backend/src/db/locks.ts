import type { LockableClient } from './types.js';

/**
 * SELECT ... FOR UPDATE helpers.
 *
 * Quota and discount reservation MUST be serialised. We take row-level
 * exclusive locks on the specific `ticket_offers` / `offer_allocations` /
 * `discount_codes` rows involved, ordered by UUID so that concurrent
 * transactions touching multiple rows always acquire locks in the same
 * order and cannot deadlock.
 *
 * The subsequent quota arithmetic is done in the WHERE clause of a guarded
 * UPDATE, so `sold + reserved` can never exceed quota even if a caller
 * forgets to hold the lock: the database itself rejects the write.
 */

/** Lock rows in a deterministic order to avoid deadlocks between concurrent orders. */
export async function lockInStableOrder<T extends LockableClient>(
  client: T,
  table: 'ticket_offers' | 'offer_allocations',
  ids: readonly string[],
): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  await client.query(`SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [
    unique,
  ]);
}

export async function lockTicketOffers(client: LockableClient, ids: readonly string[]): Promise<void> {
  await lockInStableOrder(client, 'ticket_offers', ids);
}

export async function lockOfferAllocations(
  client: LockableClient,
  ids: readonly string[],
): Promise<void> {
  await lockInStableOrder(client, 'offer_allocations', ids);
}

/**
 * Row lock on a single discount code row. The aggregate usage sum is then
 * computed inside the same transaction while holding this lock, which
 * serialises all reservations for that code.
 */
export async function lockDiscountCode(client: LockableClient, id: string): Promise<void> {
  await client.query('SELECT id FROM discount_codes WHERE id = $1 FOR UPDATE', [id]);
}

/** Row lock used to make order state transitions idempotent and mutually exclusive. */
export async function lockOrder(client: LockableClient, id: string): Promise<void> {
  await client.query('SELECT id FROM orders WHERE id = $1 FOR UPDATE', [id]);
}

export async function lockOrderByNumber(client: LockableClient, orderNumber: string): Promise<void> {
  await client.query('SELECT id FROM orders WHERE order_number = $1 FOR UPDATE', [orderNumber]);
}

/** Row lock on a ticket before reading/creating its active attendance session. */
export async function lockTicket(client: LockableClient, id: string): Promise<void> {
  await client.query('SELECT id FROM tickets WHERE id = $1 FOR UPDATE', [id]);
}