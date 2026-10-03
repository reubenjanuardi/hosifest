import { describe, expect, it } from 'vitest';
import { aggregateQuotaTargets, mergeQuotaChanges } from '../../src/db/quota.js';

describe('quota target aggregation', () => {
  it('merges identical offer/allocation pairs into one reservation', () => {
    const merged = aggregateQuotaTargets([
      { offerId: 'o1', allocationId: 'a1', quantity: 1 },
      { offerId: 'o1', allocationId: 'a1', quantity: 1 },
      { offerId: 'o1', allocationId: 'a1', quantity: 1 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantity).toBe(3);
  });

  it('keeps different allocations separate', () => {
    const merged = aggregateQuotaTargets([
      { offerId: 'o1', allocationId: 'a1', quantity: 2 },
      { offerId: 'o1', allocationId: 'a2', quantity: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('treats a null allocation as distinct from a real one', () => {
    const merged = aggregateQuotaTargets([
      { offerId: 'o1', allocationId: null, quantity: 1 },
      { offerId: 'o1', allocationId: 'a1', quantity: 1 },
    ]);
    expect(merged).toHaveLength(2);
  });

  it('drops non-positive quantities', () => {
    expect(aggregateQuotaTargets([{ offerId: 'o1', allocationId: null, quantity: 0 }])).toEqual([]);
  });
});

describe('quota change merging', () => {
  it('sums deltas for the same bucket', () => {
    const merged = mergeQuotaChanges([
      { offerId: 'o1', allocationId: 'a1', quantity: 1, reservedDelta: 1, soldDelta: 0 },
      { offerId: 'o1', allocationId: 'a1', quantity: 1, reservedDelta: 2, soldDelta: 0 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.reservedDelta).toBe(3);
  });

  it('skips no-op changes', () => {
    const merged = mergeQuotaChanges([
      { offerId: 'o1', allocationId: null, quantity: 1, reservedDelta: 0, soldDelta: 0 },
    ]);
    expect(merged).toEqual([]);
  });

  it('keeps reserve and commit as separate buckets in time', () => {
    // Reservation: reserved +N. Commit: reserved -N, sold +N. Net effect on a
    // bucket must keep sold + reserved invariant intact.
    const reserve = mergeQuotaChanges([
      { offerId: 'o1', allocationId: null, quantity: 2, reservedDelta: 2, soldDelta: 0 },
    ]);
    const commit = mergeQuotaChanges([
      { offerId: 'o1', allocationId: null, quantity: 2, reservedDelta: -2, soldDelta: 2 },
    ]);
    expect(reserve[0]?.reservedDelta).toBe(2);
    expect(commit[0]?.reservedDelta).toBe(-2);
    expect(commit[0]?.soldDelta).toBe(2);

    // Apply reserve then commit cumulatively. sold + reserved is the capacity
    // consumed, so it must be identical before and after the commit. This is
    // what makes sold + reserved <= quota safe at approval time.
    const reservedAfterReserve = reserve[0]?.reservedDelta ?? 0;
    const soldAfterReserve = reserve[0]?.soldDelta ?? 0;
    const reservedAfterCommit = reservedAfterReserve + (commit[0]?.reservedDelta ?? 0);
    const soldAfterCommit = soldAfterReserve + (commit[0]?.soldDelta ?? 0);

    expect(reservedAfterCommit).toBe(0);
    expect(soldAfterCommit).toBe(2);
    expect(reservedAfterCommit + soldAfterCommit).toBe(reservedAfterReserve + soldAfterReserve);
  });
});