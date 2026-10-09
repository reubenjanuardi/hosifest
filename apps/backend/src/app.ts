import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { loadEnv, type Env } from './config/env.js';
import { AppError } from './core/errors.js';
import { errorFromUnknown } from './core/response.js';
import { buildContainer, type Container } from './modules/container.js';
import { registerAdminAuthHook } from './modules/identity/auth.plugin.js';
import { identityRoutes } from './modules/identity/identity.routes.js';
import { publicEventRoutes } from './modules/event/public.routes.js';
import { publicOrderRoutes } from './modules/order/order.routes.js';
import { ticketRoutes } from './modules/ticketing/ticketing.routes.js';
import { adminOrderRoutes } from './modules/payment/admin.payment.routes.js';
import { adminAttendanceRoutes } from './modules/attendance/attendance.routes.js';
import { adminConfigRoutes } from './modules/admin-config/admin.config.routes.js';
import { adminReportingRoutes, adminOpsRoutes } from './modules/reporting/reporting.routes.js';

export const API_PREFIX = '/api/v1';

declare module 'fastify' {
  interface FastifyInstance {
    /** Container access for background jobs and tests. */
    hosifest: Container;
  }
}

export interface BuildAppOptions {
  env?: Env;
  container?: Container;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Structured JSON logs (NFR-04).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'body.password',
          'body.proofFileKey',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: true,
    disableRequestLogging: false,
    genReqId: () => `req_${Math.random().toString(36).slice(2, 12)}`,
  });

  const container =
    options.container ??
    buildContainer(env, {
      warn: (...args: unknown[]) => app.log.warn(...(args as [object, string])),
      error: (...args: unknown[]) => app.log.error(...(args as [object, string])),
      info: (...args: unknown[]) => app.log.info(...(args as [object, string])),
      debug: (...args: unknown[]) => app.log.debug(...(args as [object, string])),
    });

  // Rate limiting is global; public-sensitive routes tighten it per route.
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // Do not fail health probes.
    allowList: (request) => request.url === '/health' || request.url === '/ready',
  });

  // Authentication + RBAC gate for /admin (registered DIRECTLY on root,
  // NOT via app.register(), so its global onRequest hook covers the
  // /api/v1/admin routes registered later under the API_PREFIX context).
  registerAdminAuthHook(app, { identity: container.identity });

  // Multipart upload for payment-proof files. Limits duplicate the env
  // values so oversized bodies are rejected before buffering.
  await app.register(multipart, {
    limits: { fileSize: env.STORAGE_MAX_UPLOAD_BYTES, files: 1 },
    attachFieldsToBody: false,
  });

  app.decorate('hosifest', container);

  // Health / readiness (NFR-04, AC-DEVOPS-08).
  app.get('/health', async (_request, reply) => {
    return reply.send({
      data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
      meta: {},
      error: null,
    });
  });

  app.get('/ready', async (_request, reply) => {
    const dbReady = await container.db.healthCheck();
    const body = {
      data: { status: dbReady ? 'ready' : 'not_ready', database: dbReady },
      meta: {},
      error: null,
    };
    return reply.status(dbReady ? 200 : 503).send(body);
  });

  await app.register(
    async (api) => {
      // Error envelope + 404 MUST be set on the `api` scope itself: handlers
      // registered on the root AFTER routes do not cover errors thrown inside
      // them (observed: raw Fastify 500 JSON for a ZodError in /admin/login).
      api.setNotFoundHandler((request, reply) => {
        return reply.status(404).send({
          data: null,
          meta: {},
          error: { code: 'NOT_FOUND', message: 'Resource not found.', details: { path: request.url } },
        });
      });

      api.setErrorHandler((error, request, reply) => {
        // Rate limit errors carry their own status.
        if ((error as { statusCode?: number }).statusCode === 429) {
          return reply.status(429).send({
            data: null,
            meta: {},
            error: { code: 'RATE_LIMITED', message: 'Too many requests.', details: {} },
          });
        }

        const { statusCode, body } = errorFromUnknown(error);
        const logPayload = {
          requestId: request.id,
          method: request.method,
          url: request.url,
          code: body.error.code,
          statusCode,
          // Never log secrets or raw QR tokens.
          message: error instanceof Error ? error.message : String(error),
        };
        if (statusCode >= 500) api.log.error(logPayload, 'unhandled error');
        else api.log.warn(logPayload, 'request rejected');

        return reply.status(statusCode).send(body);
      });

      await api.register(publicEventRoutes(container));
      await api.register(publicOrderRoutes(container));
      await api.register(ticketRoutes(container));
      await api.register(identityRoutes, { identity: container.identity });
      await api.register(adminOrderRoutes(container));
      await api.register(adminAttendanceRoutes(container));
      await api.register(adminConfigRoutes(container));
      await api.register(adminReportingRoutes(container));
      await api.register(adminOpsRoutes(container));
    },
    { prefix: API_PREFIX },
  );

  app.addHook('onClose', async () => {
    await container.db.close();
  });

  return app;
}

export { AppError, ZodError };