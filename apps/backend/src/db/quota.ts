import { AppError } from '../core/errors.js';
import type { Database } from './database.js';
import { lockOfferAllocations, lockTicketOffers } from './locks.js';
import type { OfferAllocationRow, TicketOfferRow } from './types.js';

export interface QuotaTarget {
  offerId: string;
  /** Allocation id when the ticket belongs to a specific allocation bucket. */
  allocationId?: string | null;
  quantity: number;
}

export interface QuotaChangeTarget extends QuotaTarget {
  /** Positive reserves, negative releases. */
  reservedDelta: number;
  /** Positive converts reserved->sold, negative converts sold->reserved. */
  soldDelta: number;
}

/**
 * Merges identical quota changes so one (offer, allocation) bucket produces a
 * single guarded UPDATE. Deltas are summed rather than overwritten.
 */
export function mergeQuotaChanges(
  changes: readonly QuotaChangeTarget[],
): QuotaChangeTarget[] {
  const merged = new Map<string, QuotaChangeTarget>();
  for (const change of changes) {
    if (change.reservedDelta === 0 && change.soldDelta === 0) continue;
    const key = changeKey(change);
    const existing = merged.get(key);
    if (existing) {
      existing.reservedDelta += change.reservedDelta;
      existing.soldDelta += change.soldDelta;
      existing.quantity += change.quantity;
    } else {
      merged.set(key, { ...change });
    }
  }
  return [...merged.values()];
}

function changeKey(target: { offerId: string; allocationId?: string | null }): string {
  return `${target.offerId}:${target.allocationId ?? 'offer'}`;
}

/**
 * Aggregates identical targets so one offer with several tickets produces a
 * single guarded UPDATE instead of N sequential ones.
 */
export function aggregateQuotaTargets(targets: readonly QuotaTarget[]): QuotaTarget[] {
  const merged = new Map<string, QuotaTarget>();
  for (const target of targets) {
    if (target.quantity <= 0) continue;
    const key = changeKey(target);
    const existing = merged.get(key);
    if (existing) existing.quantity += target.quantity;
    else merged.set(key, { ...target, quantity: target.quantity });
  }
  return [...merged.values()];
}

/**
 * Applies a reserved/sold delta to ticket_offers and offer_allocations.
 *
 * `reservedDelta` moves the reservation bucket; `soldDelta` moves reserved
 * capacity into sold capacity (or returns sold capacity to reserved).
 *
 * Capacity is enforced by the WHERE clause: if the update affects zero rows
 * the caller asked for more than the configured quota allows and we raise
 * QUOTA_EXHAUSTED. The check is therefore race-free at the database level.
 */
export async function applyQuotaChange(
  client: import('pg').PoolClient,
  changes: readonly QuotaChangeTarget[],
): Promise<void> {
  for (const change of mergeQuotaChanges(changes)) {
    const { offerId, allocationId, reservedDelta, soldDelta } = change;
    if (reservedDelta === 0 && soldDelta === 0) continue;

    const offerResult = await client.query<TicketOfferRow>(
      `UPDATE ticket_offers
          SET reserved_quantity = reserved_quantity + $2,
              sold_quantity      = sold_quantity + $3,
              updated_at         = now()
        WHERE id = $1
          AND reserved_quantity + $2 >= 0
          AND sold_quantity      + $3 >= 0
          AND sold_quantity + reserved_quantity + $2 + $3 <= quota
        RETURNING id`,
      [offerId, reservedDelta, soldDelta],
    );

    if (offerResult.rowCount === 0) {
      throw new AppError(
        'QUOTA_EXHAUSTED',
        'Ticket quota is no longer available.',
        409,
        { offerId, allocationId: allocationId ?? null, requested: reservedDelta + soldDelta },
      );
    }

    if (allocationId) {
      const allocationResult = await client.query<OfferAllocationRow>(
        `UPDATE offer_allocations
            SET reserved_quantity = reserved_quantity + $2,
                sold_quantity      = sold_quantity + $3,
                updated_at         = now()
          WHERE id = $1
            AND reserved_quantity + $2 >= 0
            AND sold_quantity      + $3 >= 0
            AND sold_quantity + reserved_quantity + $2 + $3 <= quota
          RETURNING id`,
        [allocationId, reservedDelta, soldDelta],
      );

      if (allocationResult.rowCount === 0) {
        // Undo the offer-level change so the transaction stays consistent
        // before propagating the failure.
        await client.query(
          `UPDATE ticket_offers
              SET reserved_quantity = reserved_quantity - $2,
                  sold_quantity      = sold_quantity - $3,
                  updated_at         = now()
            WHERE id = $1`,
          [offerId, reservedDelta, soldDelta],
        );
        throw new AppError(
          'QUOTA_EXHAUSTED',
          'Ticket quota for this allocation is no longer available.',
          409,
          { offerId, allocationId, requested: reservedDelta + soldDelta },
        );
      }
    }
  }
}

/** Locks every offer/allocation row participating in a quota change. */
export async function lockQuotaRows(
  client: import('pg').PoolClient,
  targets: readonly QuotaTarget[],
): Promise<void> {
  await lockTicketOffers(
    client,
    targets.map((target) => target.offerId),
  );
  await lockOfferAllocations(
    client,
    targets
      .map((target) => target.allocationId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

export interface QuotaSnapshot {
  quota: number;
  reserved: number;
  sold: number;
  available: number;
}

export async function readOfferQuota(
  client: import('pg').PoolClient,
  offerId: string,
): Promise<QuotaSnapshot> {
  const { rows } = await client.query<{
    quota: number;
    reserved_quantity: number;
    sold_quantity: number;
  }>(
    `SELECT quota, reserved_quantity, sold_quantity
       FROM ticket_offers
      WHERE id = $1
      FOR UPDATE`,
    [offerId],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError('OFFER_NOT_AVAILABLE', 'Ticket offer not found.', 404, { offerId });
  }
  return {
    quota: row.quota,
    reserved: row.reserved_quantity,
    sold: row.sold_quantity,
    available: Math.max(0, row.quota - row.reserved_quantity - row.sold_quantity),
  };
}