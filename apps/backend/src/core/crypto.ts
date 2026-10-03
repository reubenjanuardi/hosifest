import type { FastifyBaseLogger } from 'fastify';
import { createHash } from 'node:crypto';

/** SHA-256 hex digest of an opaque QR token. Only this is persisted. */
export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Constant-time comparison for secrets and tokens. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export interface RequestContext {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Normalised error log shape. Secrets are never passed in: callers pass
 * business identifiers only.
 */
export function logError(
  logger: FastifyBaseLogger,
  context: RequestContext,
  error: unknown,
  extra: Record<string, unknown> = {},
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error(
    { ...context, err: { message, stack }, ...extra },
    'request failed',
  );
}