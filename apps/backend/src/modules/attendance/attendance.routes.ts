import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { parseOrThrow, sendData } from '../../core/response.js';
import { authorize } from '../identity/auth.plugin.js';
import type { Container } from '../container.js';

const searchQuery = z.object({ q: z.string().trim().min(1).max(120) });
const scanBody = z
  .object({
    ticketCode: z.string().trim().min(1).max(80).optional(),
    qrToken: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Boolean(value.ticketCode) !== Boolean(value.qrToken), {
    message: 'Provide exactly one of ticketCode or qrToken.',
  });

/**
 * Attendance endpoints (16-api-specification.md section 6).
 *
 * BR-ATT-08 / AC-ATT-07: an invalid ticket or an invalid state transition must
 * NOT change attendance state. Both are detected before any write, and every
 * attempt (successful or not) is logged through the audit trail so event-day
 * operations have a complete record.
 */
export function adminAttendanceRoutes(container: Container): FastifyPluginAsync {
  const { env } = container;
  const limit = {
    max: env.RATE_LIMIT_ATTENDANCE_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  };

  return async (app) => {
    app.get('/admin/check-in/search', async (request, reply) => {
      authorize(request, 'attendance:scan');
      const { q } = parseOrThrow(searchQuery, request.query);
      return sendData(reply, await container.attendance.search(q));
    });

    app.post('/admin/check-in/entry', { config: { rateLimit: limit } }, async (request, reply) => {
      const user = authorize(request, 'attendance:scan');
      const body = parseOrThrow(scanBody, request.body);
      const lookup = body.ticketCode ? { ticketCode: body.ticketCode } : { qrToken: body.qrToken ?? '' };

      try {
        const result = await container.attendance.entry(lookup, {
          actorUserId: user.id,
          requestId: request.id,
        });
        return sendData(reply, result);
      } catch (error) {
        await logAttendanceAttempt(container, request, user.id, 'ENTRY', error, lookup);
        throw error;
      }
    });

    app.post('/admin/check-in/exit', { config: { rateLimit: limit } }, async (request, reply) => {
      const user = authorize(request, 'attendance:scan');
      const body = parseOrThrow(scanBody, request.body);
      const lookup = body.ticketCode ? { ticketCode: body.ticketCode } : { qrToken: body.qrToken ?? '' };

      try {
        const result = await container.attendance.exit(lookup, {
          actorUserId: user.id,
          requestId: request.id,
        });
        return sendData(reply, result);
      } catch (error) {
        await logAttendanceAttempt(container, request, user.id, 'EXIT', error, lookup);
        throw error;
      }
    });
  };
}

async function logAttendanceAttempt(
  container: Container,
  request: FastifyRequest,
  actorUserId: string,
  action: string,
  error: unknown,
  lookup: { ticketCode?: string; qrToken?: string },
): Promise<void> {
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  try {
    await container.audit.record({
      actorUserId,
      // Never log the raw QR token; record only the submitted ticket code.
      action: `ATTENDANCE_${action}_${code}`,
      entityType: 'ticket',
      entityId: null,
      after: { ticketCode: lookup.ticketCode ?? null, outcome: code },
      requestId: request.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
  } catch {
    // Audit failures must never mask the original attendance error.
  }
}