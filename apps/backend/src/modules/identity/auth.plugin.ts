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
  app.decorateRequest('currentUser', undefined);

  app.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/v1/admin')) return;
    const token = bearerToken(request);
    if (!token) throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
    request.currentUser = await options.identity.userFromToken(token);
  });
};

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