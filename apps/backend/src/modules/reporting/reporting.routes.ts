import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendData } from '../../core/response.js';
import { authorize } from '../identity/auth.plugin.js';
import type { Container } from '../container.js';

const reportQuery = z.object({ eventSlug: z.string().trim().min(1).max(200).optional() });

/** Reporting stubs (16-api-specification.md section 8). */
export function adminReportingRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    const reports: Record<string, (eventSlug?: string) => Promise<unknown>> = {
      sales: (slug) => container.reporting.sales(slug),
      tickets: (slug) => container.reporting.tickets(slug),
      payments: (slug) => container.reporting.payments(slug),
      attendance: (slug) => container.reporting.attendance(slug),
      souvenir: (slug) => container.reporting.souvenir(slug),
      beverage: (slug) => container.reporting.beverages(slug),
      discounts: (slug) => container.reporting.discounts(slug),
    };

    for (const [name, run] of Object.entries(reports)) {
      app.get(`/admin/reports/${name}`, async (request, reply) => {
        authorize(request, 'report:read');
        const { eventSlug } = parseOrThrow(reportQuery, request.query ?? {});
        const result = await run(eventSlug);
        return sendData(reply, result, { report: name, eventSlug: eventSlug ?? null });
      });
    }
  };
}

/** Souvenir fulfilment + audit read endpoints for admin UI. */
export function adminOpsRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.get('/admin/souvenir-customizations', async (request, reply) => {
      authorize(request, 'report:read');
      const query = z
        .object({ status: z.string().trim().min(1).max(30).optional() })
        .parse(request.query ?? {});
      return sendData(reply, await container.souvenir.listCustomizations(query.status));
    });

    app.post('/admin/souvenir-customizations/:id/advance', async (request, reply) => {
      const user = authorize(request, 'config:write');
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params ?? {});
      const body = z.object({ status: z.string().trim().min(1).max(30) }).parse(request.body ?? {});
      const result = await container.souvenir.advanceStatus(id, body.status, user.id);
      return sendData(reply, result);
    });

    app.get('/admin/audit-logs', async (request, reply) => {
      authorize(request, 'audit:read');
      const query = z
        .object({
          entityType: z.string().trim().max(100).optional(),
          action: z.string().trim().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
        })
        .parse(request.query ?? {});
      const { rows } = await container.db.query(
        `SELECT id, actor_user_id, action, entity_type, entity_id, before_data, after_data,
                request_id, ip_address, created_at
           FROM audit_logs
          WHERE ($1::text IS NULL OR entity_type = $1)
            AND ($2::text IS NULL OR action = $2)
          ORDER BY created_at DESC
          LIMIT $3`,
        [query.entityType ?? null, query.action ?? null, query.limit],
      );
      return sendData(reply, rows, { limit: query.limit });
    });

    /** Manual sweep for expired orders; safe to call repeatedly. */
    app.post('/admin/orders/expire-sweep', async (request, reply) => {
      authorize(request, 'order:write');
      const expired = await container.expiry.sweepExpiredOrders();
      return sendData(reply, { expired });
    });
  };
}