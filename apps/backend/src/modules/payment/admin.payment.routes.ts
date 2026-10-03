import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { parseOrThrow, sendData } from '../../core/response.js';
import { authorize } from '../identity/auth.plugin.js';
import type { Container } from '../container.js';

const idParams = z.object({ id: z.string().uuid() });
const rejectBody = z.object({ reason: z.string().trim().min(3).max(1000) });

export function adminOrderRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.post('/admin/orders/:id/approve-payment', async (request, reply) => {
      const user = authorize(request, 'payment:review');
      const { id } = parseOrThrow(idParams, request.params);

      const result = await container.payments.approvePayment(id, {
        actorUserId: user.id,
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return sendData(reply, {
        orderId: result.order.id,
        status: result.order.status,
        // `transitioned: false` means this was a repeat approval: no new
        // tickets were issued (AC-PAY-03).
        transitioned: result.transitioned,
        issuedTicketCodes: result.issuedTicketCodes,
      });
    });

    app.post('/admin/orders/:id/reject-payment', async (request, reply) => {
      const user = authorize(request, 'payment:review');
      const { id } = parseOrThrow(idParams, request.params);
      const body = parseOrThrow(rejectBody, request.body ?? {});

      const result = await container.payments.rejectPayment(id, body.reason, {
        actorUserId: user.id,
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      return sendData(reply, {
        orderId: result.order.id,
        status: result.order.status,
        transitioned: result.transitioned,
      });
    });

    app.get('/admin/orders/:id', async (request, reply) => {
      authorize(request, 'order:read');
      const { id } = parseOrThrow(idParams, request.params);
      const { rows } = await container.db.query(
        `SELECT ord.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
           FROM orders ord JOIN customers c ON c.id = ord.customer_id
          WHERE ord.id = $1`,
        [id],
      );
      const order = rows[0];
      if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.', 404, { id });
      const { rows: tickets } = await container.db.query(
        `SELECT t.ticket_code, t.status FROM tickets t
           JOIN order_items oi ON oi.id = t.order_item_id
          WHERE oi.order_id = $1 ORDER BY t.ticket_code`,
        [id],
      );
      return sendData(reply, { ...order, tickets });
    });

  };
}