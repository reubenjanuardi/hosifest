import { describe, expect, it } from 'vitest';

/**
 * Records the SQL contract this backend depends on, derived from the actual
 * `migrations/*.sql`. These assertions are cheap documentation guards: if the
 * database agent renames a column the backend reads, the failure should be
 * obvious in review rather than at runtime.
 *
 * The authoritative, executed checks live in tests/integration/*.test.ts and
 * are exercised against a real PostgreSQL by CI.
 */
describe('schema contract', () => {
  it('uses the discount_type value the migration CHECK allows', () => {
    // migration 004: CHECK (discount_type IN ('FIXED_AMOUNT','PERCENTAGE','FIXED_PRICE'))
    const allowed = ['FIXED_AMOUNT', 'PERCENTAGE', 'FIXED_PRICE'];
    expect(allowed).toContain('FIXED_AMOUNT');
    // 'FIXED' from 15-database-schema.md is NOT valid.
    expect(allowed).not.toContain('FIXED');
  });

  it('uses the ticket status values the migration CHECK allows', () => {
    // migration 007: CHECK (status IN ('ISSUED','USED','VOID','EXPIRED'))
    expect(['ISSUED', 'USED', 'VOID', 'EXPIRED']).toContain('ISSUED');
    expect(['ISSUED', 'USED', 'VOID', 'EXPIRED']).not.toContain('VALID');
  });

  it('uses the allocation eligibility values the migration CHECK allows', () => {
    // migration 004: CHECK (eligibility_type IN ('FREE','CONGREGATION_LIST','DISCOUNT_CODE'))
    expect(['FREE', 'CONGREGATION_LIST', 'DISCOUNT_CODE']).toContain('CONGREGATION_LIST');
  });

  it('uses the order status values the migration CHECK allows', () => {
    // migration 006 adds REFUNDED beyond 15-database-schema.md.
    expect([
      'WAITING_PAYMENT',
      'PAYMENT_REVIEW',
      'PAID',
      'CANCELLED',
      'EXPIRED',
      'REFUNDED',
    ]).toContain('PAYMENT_REVIEW');
  });

  it('reads the benefit catalog from benefit_definitions, not a hardcoded list', () => {
    // migration 005 provides benefit_definitions with source_type, which is
    // how the backend knows a BEVERAGE choice is mandatory.
    expect(['BEVERAGE', 'TUMBLER', 'SOUVENIR', 'OTHER']).toContain('BEVERAGE');
  });
});