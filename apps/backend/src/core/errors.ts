import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Canonical domain error. `code` is the machine-readable contract value
 * surfaced to clients (e.g. QUOTA_EXHAUSTED, ORDER_EXPIRED, INVALID_TICKET).
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'EVENT_NOT_FOUND'
  | 'SALES_PHASE_NOT_ACTIVE'
  | 'OFFER_NOT_AVAILABLE'
  | 'PURCHASE_LIMIT_EXCEEDED'
  | 'QUOTA_EXHAUSTED'
  | 'INVALID_DISCOUNT_CODE'
  | 'DISCOUNT_CODE_EXHAUSTED'
  | 'INVALID_DISCOUNT_CODE_FOR_OFFER'
  | 'CONGREGATION_NOT_ELIGIBLE'
  | 'CONGREGATION_REQUIRED'
  | 'BEVERAGE_REQUIRED'
  | 'SOUVENIR_SELECTION_REQUIRED'
  | 'SOUVENIR_SELECTION_INVALID'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_EXPIRED'
  | 'ORDER_CANCELLED'
  | 'ORDER_ALREADY_PAID'
  | 'ORDER_NOT_PAYABLE'
  | 'PAYMENT_NOT_FOUND'
  | 'PROOF_NOT_FOUND'
  | 'INVALID_PAYMENT_METHOD'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'TICKET_NOT_FOUND'
  | 'INVALID_TICKET'
  | 'TICKET_NOT_VALID'
  | 'ALREADY_INSIDE'
  | 'ALREADY_OUTSIDE'
  | 'STORAGE_ERROR'
  | 'DB_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 400,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError('NOT_FOUND', `${what} not found.`, 404, id ? { id } : {});

/** Order numbers are human readable and appear on payment instructions. */
export function generateOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `HOS-${yy}${mm}-${stamp}-${suffix}`;
}

/** Human-facing ticket code, e.g. HOS-7F3K9Q. Never contains personal data. */
export function generateTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let out = '';
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `HOS-${out}`;
}

/** High entropy opaque QR payload. Only its SHA-256 hash is persisted. */
export function generateQrToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateRequestId(): string {
  return randomUUID();
}
