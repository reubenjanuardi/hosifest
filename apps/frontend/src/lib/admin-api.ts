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

export function listAuditLogs(signal?: AbortSignal) {
  return adminRequest<ConfigResource[]>('/admin/audit-logs', { signal });
}

export async function searchCheckIn(term: string, signal?: AbortSignal) {
  return adminRequest<ConfigResource[]>('/admin/check-in/search', {
    signal,
    body: term === '' ? undefined : { q: term },
  });
}