/**
 * Authenticated admin API client.
 *
 * Every call attaches the Bearer token the backend issued at login. The backend
 * (apps/backend/src/modules/identity/auth.plugin.ts) rejects any /api/v1/admin
 * request without it, and each handler additionally checks a specific
 * permission, so a 403 here means the role genuinely lacks that capability —
 * not that the UI hid a button.
 *
 * This client deliberately does no authorization filtering of its own. It
 * reports what the server said.
 */

import { ApiError, type ApiEnvelope } from './api';
import {
  clearSession,
  readSession,
  type AdminUser,
} from './admin-auth';

const ADMIN_BASE = '/api/v1';

/** Raised when the stored session is no longer accepted. */
export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Performs an authenticated admin request.
 *
 * A 401 means the token was missing, rejected or expired. The stored session is
 * dropped in that case so the app returns to the login form instead of looping
 * on requests that can never succeed.
 */
async function adminRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const session = readSession();
  if (!session) {
    throw new AdminAuthError('Sign in to continue.');
  }

  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${ADMIN_BASE}${path}`, {
      method,
      signal,
      cache: 'no-store',
      headers: {
              Authorization: `Bearer ${session.token}`,
              ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(
      0,
      'BACKEND_UNREACHABLE',
      'The admin service is unavailable. Please try again shortly.',
    );
  }

  if (response.status === 401) {
    clearSession();
    throw new AdminAuthError('Your session has ended. Please sign in again.');
  }

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = 'The request could not be completed.';
    let details: Record<string, unknown> | null = null;
    try {
      const parsed = (await response.json()) as ApiEnvelope<unknown>;
      if (parsed.error) {
        code = parsed.error.code ?? code;
        message = parsed.error.message ?? message;
        details = parsed.error.details ?? null;
      }
    } catch {
      // Non-JSON error body (a proxy timeout page, for example). Keep the
      // generic message rather than surfacing HTML to the operator.
    }
    throw new ApiError(response.status, code, message, details);
  }

  if (response.status === 204) return undefined as T;

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (payload.error) {
    throw new ApiError(
      response.status,
      payload.error.code ?? 'UNKNOWN_ERROR',
      payload.error.message ?? 'The request could not be completed.',
      payload.error.details ?? null,
    );
  }
  return payload.data as T;
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export async function adminLogin(
  email: string,
  password: string,
): Promise<{ token: string; user: AdminUser }> {
  // Login is the one call that does NOT require an existing session.
  // It hits the public /admin/login endpoint directly.
  let response: Response;
  try {
    response = await fetch(`${ADMIN_BASE}/admin/login`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError(
      0,
      'BACKEND_UNREACHABLE',
      'The admin service is unavailable. Please try again shortly.',
    );
  }

  if (response.status === 401) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password.');
  }

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = 'Sign-in failed.';
    try {
      const parsed = (await response.json()) as ApiEnvelope<unknown>;
      if (parsed.error) {
        code = parsed.error.code ?? code;
        message = parsed.error.message ?? message;
      }
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(response.status, code, message, null);
  }

  const payload = (await response.json()) as ApiEnvelope<{ token: string; user: AdminUser }>;
  if (payload.error) {
    throw new ApiError(
      response.status,
      payload.error.code ?? 'UNKNOWN_ERROR',
      payload.error.message ?? 'Sign-in failed.',
      payload.error.details ?? null,
    );
  }
  return payload.data!;
}

export function adminMe(signal?: AbortSignal): Promise<AdminUser | null> {
  return adminRequest<AdminUser | null>('/admin/me', { signal });
}

/* ------------------------------------------------------------------ */
/* Reporting — the dashboard landing data                              */
/* ------------------------------------------------------------------ */

export interface SalesReport {
  [key: string]: unknown;
}

export function getSalesReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/sales${query}`);
}

export function getPaymentsReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/payments${query}`);
}

export function getAttendanceReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/attendance${query}`);
}

export function getSouvenirReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/souvenir${query}`);
}

export function getTicketsReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/tickets${query}`);
}

export function getBeverageReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/beverage${query}`);
}

export function getDiscountsReport(eventSlug?: string) {
  const query = eventSlug ? `?eventSlug=${encodeURIComponent(eventSlug)}` : '';
  return adminRequest<SalesReport>(`/admin/reports/discounts${query}`);
}

/* ------------------------------------------------------------------ */
/* Configuration — read and write through the admin resource endpoints */
/* ------------------------------------------------------------------ */

export interface ConfigResource {
  id: string;
  [key: string]: unknown;
}

export function listConfigResource<T = ConfigResource>(
  resource: string,
): Promise<T[]> {
  return adminRequest<T[]>(`/admin/${resource}`);
}

export function getConfigResource<T = ConfigResource>(
  resource: string,
  id: string,
): Promise<T> {
  return adminRequest<T>(`/admin/${resource}/${encodeURIComponent(id)}`);
}

export function createConfigResource<T = ConfigResource>(
  resource: string,
  body: unknown,
): Promise<T> {
  return adminRequest<T>(`/admin/${resource}`, { method: 'POST', body });
}

export function updateConfigResource<T = ConfigResource>(
  resource: string,
  id: string,
  body: unknown,
): Promise<T> {
  return adminRequest<T>(`/admin/${resource}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
  });
}

/* ------------------------------------------------------------------ */
/* Orders, payments, attendance, audit                                 */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Payment review — finance verifies bank-transfer / QRIS proofs     */
/* ------------------------------------------------------------------ */

/** One row of the review queue (GET /admin/orders). */
export interface ReviewQueueRow {
  id: string;
  order_number: string;
  status: 'WAITING_PAYMENT' | 'PAYMENT_REVIEW';
  total_amount: number;
  subtotal_amount: number;
  discount_amount: number;
  expires_at: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  payment_id: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  payment_status: string | null;
  proof_file_key: string | null;
  external_reference: string | null;
  submitted_at: string | null;
}

export interface ApprovePaymentResult {
  orderId: string;
  status: string;
  /** False on a repeat approval: no new tickets were issued (AC-PAY-03). */
  transitioned: boolean;
  issuedTicketCodes: string[];
}

export interface RejectPaymentResult {
  orderId: string;
  status: string;
  transitioned: boolean;
}

export interface ProofUrlResult {
  url: string;
  expiresInSeconds: number | null;
}

/** Review queue: orders in WAITING_PAYMENT / PAYMENT_REVIEW status. */
export function listOrdersForReview(limit = 100, signal?: AbortSignal) {
  return adminRequest<ReviewQueueRow[]>(
    `/admin/orders?limit=${encodeURIComponent(String(limit))}`,
    { signal },
  );
}

export function approvePayment(orderId: string) {
  return adminRequest<ApprovePaymentResult>(
    `/admin/orders/${encodeURIComponent(orderId)}/approve-payment`,
    { method: 'POST' },
  );
}

export function rejectPayment(orderId: string, reason: string) {
  return adminRequest<RejectPaymentResult>(
    `/admin/orders/${encodeURIComponent(orderId)}/reject-payment`,
    { method: 'POST', body: { reason } },
  );
}

/** Short-lived read URL for the stored proof file. */
export function getPaymentProofUrl(paymentId: string) {
  return adminRequest<ProofUrlResult>(
    `/admin/payments/${encodeURIComponent(paymentId)}/proof-url`,
  );
}

/** Legacy unfiltered audit read, kept for callers that need every row. */
export function listAuditLogs(signal?: AbortSignal) {
  return adminRequest<ConfigResource[]>('/admin/audit-logs', { signal });
}

/* ------------------------------------------------------------------ */
/* Orders — list, detail, expire sweep                                  */
/* ------------------------------------------------------------------ */

/** One row of the order list (GET /admin/orders/:id and the review queue). */
export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  subtotal_amount: number;
  discount_amount: number;
  expires_at: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  payment_id: string | null;
  payment_method: string | null;
  payment_amount: number | null;
  payment_status: string | null;
  proof_file_key: string | null;
  external_reference: string | null;
  submitted_at: string | null;
}

export interface OrderTicket {
  ticket_code: string;
  status: string;
}

export interface OrderDetail extends OrderRow {
  tickets: OrderTicket[];
}

export interface ExpireSweepResult {
  expired: number;
}

/**
 * Order list (GET /admin/orders).
 *
 * The backend currently returns the finance review queue for this path; the
 * optional query values are forwarded so the page keeps working unchanged if the
 * route gains status/limit filters server-side.
 */
export function listOrders(
  params: { status?: string; limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<OrderRow[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const query = search.toString();
  return adminRequest<OrderRow[]>(`/admin/orders${query ? `?${query}` : ''}`, { signal });
}

/** Single order with its issued tickets. GET /admin/orders/:id (order:read). */
export function getOrderDetail(orderId: string, signal?: AbortSignal): Promise<OrderDetail> {
  return adminRequest<OrderDetail>(`/admin/orders/${encodeURIComponent(orderId)}`, { signal });
}

/** Manual sweep for expired orders; safe to call repeatedly (order:write). */
export function runExpireSweep(): Promise<ExpireSweepResult> {
  return adminRequest<ExpireSweepResult>('/admin/orders/expire-sweep', { method: 'POST' });
}

/* ------------------------------------------------------------------ */
/* Audit logs                                                           */
/* ------------------------------------------------------------------ */

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogsParams {
  entityType?: string;
  action?: string;
  limit?: number;
}

/** Filtered audit read. GET /admin/audit-logs (permission audit:read). */
export function listAuditLogsDetailed(
  params: AuditLogsParams = {},
  signal?: AbortSignal,
): Promise<AuditLogRow[]> {
  const search = new URLSearchParams();
  if (params.entityType) search.set('entityType', params.entityType);
  if (params.action) search.set('action', params.action);
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return adminRequest<AuditLogRow[]>(`/admin/audit-logs${query ? `?${query}` : ''}`, {
    signal,
  });
}

/* ------------------------------------------------------------------ */
/* Souvenir customizations                                              */
/* ------------------------------------------------------------------ */

export interface SouvenirCustomizationRow {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  ticket_code: string | null;
  holder_name_snapshot: string | null;
  option_group_id: string | null;
  option_id: string | null;
  quantity: number | null;
  option_group_snapshot: Record<string, unknown> | null;
  option_snapshot: Record<string, unknown> | null;
}

export interface SouvenirAdvanceResult {
  id: string;
  status: string;
}

/** Fulfilment queue. GET /admin/souvenir-customizations (permission report:read). */
export function listSouvenirCustomizations(
  status?: string,
  signal?: AbortSignal,
): Promise<SouvenirCustomizationRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<SouvenirCustomizationRow[]>(`/admin/souvenir-customizations${query}`, {
    signal,
  });
}

/**
 * Advances the fulfilment state. POST /admin/souvenir-customizations/:id/advance
 * (permission config:write). The backend validates the transition and rejects a
 * skip with 409; this client never validates locally.
 */
export function advanceSouvenirStatus(
  customizationId: string,
  status: string,
): Promise<SouvenirAdvanceResult> {
  return adminRequest<SouvenirAdvanceResult>(
    `/admin/souvenir-customizations/${encodeURIComponent(customizationId)}/advance`,
    { method: 'POST', body: { status } },
  );
}

/* ------------------------------------------------------------------ */
/* Attendance scanning                                                  */
/* ------------------------------------------------------------------ */

/** One ticket row from GET /admin/check-in/search (BR-ATT-07). */
export interface CheckInSearchRow {
  ticket_code?: string | null;
  status?: string | null;
  holder_name_snapshot?: string | null;
  congregation_name_snapshot?: string | null;
  offer_name?: string | null;
  is_inside?: boolean | null;
  session_count?: number | null;
  last_entry_at?: string | null;
  [key: string]: unknown;
}

/**
 * Body for POST /admin/check-in/entry and /admin/check-in/exit.
 *
 * The backend requires EXACTLY one of the two fields (attendance.routes.ts
 * `scanBody` refine), so the UI must never send both or neither. Build the body
 * from the scanner origin: a decoded QR yields `qrToken`, a typed or hardware-
 * scanner code yields `ticketCode`.
 */
export type ScanLookup =
  | { ticketCode: string; qrToken?: never }
  | { qrToken: string; ticketCode?: never };

/**
 * Outcome of a scan. `status` is decided entirely by the backend; this client
 * never derives it. The documented vocabulary is CHECKED_IN, CHECKED_OUT,
 * ALREADY_INSIDE, ALREADY_OUTSIDE and INVALID_TICKET, with anything else
 * passed through as a neutral result.
 */
export interface ScanOutcome {
  status: string;
  sessionId?: string | null;
  ticketCode?: string | null;
  holderName?: string | null;
  entryAt?: string | null;
  exitAt?: string | null;
  reentryCount?: number | null;
  [key: string]: unknown;
}

function scanBody(lookup: ScanLookup): Record<string, string> {
  // Exactly one field, matching the backend refine.
  return 'ticketCode' in lookup && lookup.ticketCode
    ? { ticketCode: lookup.ticketCode }
    : { qrToken: (lookup as { qrToken: string }).qrToken };
}

/** Records an ENTRY. POST /admin/check-in/entry, permission attendance:scan. */
export function scanEntry(lookup: ScanLookup): Promise<ScanOutcome> {
  return adminRequest<ScanOutcome>('/admin/check-in/entry', {
    method: 'POST',
    body: scanBody(lookup),
  });
}

/** Records an EXIT. POST /admin/check-in/exit, permission attendance:scan. */
export function scanExit(lookup: ScanLookup): Promise<ScanOutcome> {
  return adminRequest<ScanOutcome>('/admin/check-in/exit', {
    method: 'POST',
    body: scanBody(lookup),
  });
}

/**
 * Autocomplete / manual-lookup helper. GET /admin/check-in/search?q=…
 * (permission attendance:scan), returning rows verbatim for the caller to
 * render. An empty term resolves to [] without hitting the backend, since the
 * route requires a non-empty `q` (searchQuery: min 1).
 */
export function searchCheckIn(
  term: string,
  signal?: AbortSignal,
): Promise<CheckInSearchRow[]> {
  const query = term.trim();
  if (query.length === 0) return Promise.resolve([]);
  return adminRequest<CheckInSearchRow[]>(
    `/admin/check-in/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
}