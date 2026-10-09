/**
 * Admin session state.
 *
 * The backend enforces authorization on every /api/v1/admin request: a Bearer
 * JWT is required, and each handler checks a permission from the matrix in
 * hosifest-system-design/02-actors-roles-use-cases.md. This module only stores
 * the token the backend issued and exposes the resulting identity. It never
 * decides what an operator is allowed to see — that is the backend's job, and a
 * client-side check would be cosmetic.
 *
 * The token is held in localStorage rather than a cookie because the login
 * endpoint is a plain JSON POST with no CSRF token and the admin surface is a
 * separate origin path from the storefront. That is a deliberate trade-off, not
 * an oversight: the alternative (httpOnly cookie) requires the backend to set
 * credentials and emit CORS headers, which the current API contract does not
 * define. Anything rendered from this state is still gated server-side, so a
 * tampered client only ever changes what is drawn, never what is permitted.
 */

const TOKEN_KEY = 'hosifest.admin.token';
const USER_KEY = 'hosifest.admin.user';

/** The identity shape returned by POST /admin/login and GET /admin/me. */
export interface AdminUser {
  id: string;
  email: string;
  fullName?: string | null;
  roles: string[];
  permissions: string[];
}

export function isAdminUser(value: unknown): value is AdminUser {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<AdminUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    Array.isArray(candidate.roles) &&
    Array.isArray(candidate.permissions)
  );
}

/**
 * Read the stored session. Guarded for the server render pass, where
 * localStorage does not exist; callers must handle null.
 */
export function readSession(): { token: string; user: AdminUser } | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const raw = window.localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isAdminUser(parsed)) return null;
    return { token, user: parsed };
  } catch {
    return null;
  }
}

export function writeSession(token: string, user: AdminUser): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/**
 * Used by the admin route guard. A session that cannot be read is not a valid
 * session; the caller redirects to the login form rather than rendering a
 * shell that would fail every request with 401 anyway.
 */
export function hasSession(): boolean {
  return readSession() !== null;
}