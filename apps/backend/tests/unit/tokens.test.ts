import { describe, expect, it } from 'vitest';
import { generateQrToken } from '../../src/core/errors.js';
import { safeEqual, sha256 } from '../../src/core/crypto.js';

/**
 * QR security (11-security-and-operations.md): the QR carries a high-entropy
 * opaque token, never customer data, and only its SHA-256 hash is persisted.
 */
describe('QR token hashing', () => {
  it('stores only a SHA-256 digest that never equals the raw token', () => {
    const token = generateQrToken();
    const hash = sha256(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(token);
    expect(token).not.toContain(hash);
  });

  it('hashes deterministically so a scan resolves back to a ticket', () => {
    const token = generateQrToken();
    expect(sha256(token)).toBe(sha256(token));
  });

  it('produces different digests for different tokens', () => {
    const digests = new Set(Array.from({ length: 2000 }, () => sha256(generateQrToken())));
    expect(digests.size).toBe(2000);
  });
});

describe('constant time comparison', () => {
  it('matches identical strings and rejects different ones', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});