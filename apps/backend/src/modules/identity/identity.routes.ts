import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendData } from '../../core/response.js';
import { loginSchema, type IdentityService } from './identity.service.js';

export interface IdentityRoutesOptions {
  identity: IdentityService;
}

export const identityRoutes: FastifyPluginAsync<IdentityRoutesOptions> = async (app, options) => {
  app.post('/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    const result = await options.identity.authenticate(body.email, body.password);
    return sendData(reply, result, {}, 200);
  });

  app.get('/admin/me', async (request, reply) => {
    return sendData(reply, request.currentUser ?? null);
  });
};

export const loginBodySchema = loginSchema;
export const idParamSchema = z.object({ id: z.string().uuid() });