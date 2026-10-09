import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors.js';
import type { Permission } from './rbac.js';
import type { AuthenticatedUser, IdentityService } from './identity.service.js';
import { requirePermission } from './identity.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: AuthenticatedUser;
  }
}

const bearerPattern = /^Bearer\s+(.+)$/i;

/**
 * Endpoints under /api/v1/admin that MUST stay reachable without a token, or
 * nobody could ever obtain one. `/admin/login` is the credential exchange and
 * is the only such path — `/admin/me` answers "who am I" and must still be
 * rejected without a token, otherwise it leaks nothing but lies to the client
 * about being authenticated.
 */
const PUBLIC_ADMIN_PATHS = new Set(['/api/v1/admin/login']);

function isPublicAdminPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return PUBLIC_ADMIN_PATHS.has(path);
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = bearerPattern.exec(header);
  return match?.[1] ?? null;
}

export interface AuthPluginOptions {
  identity: IdentityService;
}

/**
 * Public endpoints stay open; everything under /api/v1/admin requires a valid
 * bearer token. Authorization is enforced server side on every request.
 */
export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  registerAdminAuthHook(app, options);
};

/**
 * Registers the global /admin guard DIRECTLY on the root fastify instance.
 * Must be called without going through `app.register()`, because a registered
 * async plugin creates an encapsulated context whose `onRequest` hooks never
 * fire for routes added outside that context (this bit us: every /admin route
 * silently skipped authentication and `/admin/me` returned `data: null` even
 * with a valid token).
 */
export function registerAdminAuthHook(
  app: Parameters<FastifyPluginAsync<AuthPluginOptions>>[0],
  options: AuthPluginOptions,
): void {
  try {
    app.decorateRequest('currentUser', undefined);
  } catch {
    // Already decorated (hot reload in tests). Safe to skip.
  }

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/v1/admin')) return;
    if (isPublicAdminPath(request.url)) return;
    const token = bearerToken(request);
    if (!token) throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
    request.currentUser = await options.identity.userFromToken(token);
  });
}

export function currentUserOrThrow(request: FastifyRequest): AuthenticatedUser {
  const user = request.currentUser;
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
  return user;
}

/** Guard used inside every /admin handler. */
export function authorize(request: FastifyRequest, permission: Permission): AuthenticatedUser {
  const user = currentUserOrThrow(request);
  requirePermission(user, permission);
  return user;
}