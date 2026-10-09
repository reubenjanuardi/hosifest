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

    /**
     * Review queue: orders awaiting a finance decision.
     *
     * Both statuses are listed because WAITING_PAYMENT rows can still gain a
     * submitted proof at any moment, and the operator needs to see them as part
     * of the same backlog. The queue is read-only — every transition goes
     * through the approve/reject endpoints so the state machine stays in the
     * domain layer.
     */
    app.get('/admin/orders', async (request, reply) => {
      authorize(request, 'payment:review');
      const query = parseOrThrow(
        z.object({
          limit: z.coerce.number().int().min(1).max(200).default(100),
        }),
        request.query ?? {},
      );

      const { rows } = await container.db.query(
        `SELECT ord.id,
                ord.order_number,
                ord.status,
                ord.total_amount,
                ord.subtotal_amount,
                ord.discount_amount,
                ord.expires_at,
                ord.created_at,
                c.name  AS customer_name,
                c.email AS customer_email,
                c.phone AS customer_phone,
                pay.id           AS payment_id,
                pay.method       AS payment_method,
                pay.amount       AS payment_amount,
                pay.status       AS payment_status,
                pay.proof_file_key AS proof_file_key,
                pay.external_reference,
                pay.submitted_at
           FROM orders ord
           JOIN customers c ON c.id = ord.customer_id
           LEFT JOIN LATERAL (
             SELECT p.* FROM payments p
              WHERE p.order_id = ord.id
              ORDER BY (p.status = 'SUBMITTED') DESC, p.created_at DESC
              LIMIT 1
           ) pay ON TRUE
          WHERE ord.status IN ('WAITING_PAYMENT', 'PAYMENT_REVIEW')
          ORDER BY (ord.status = 'PAYMENT_REVIEW') DESC,
                   pay.submitted_at ASC NULLS LAST,
                   ord.created_at DESC
          LIMIT $1`,
        [query.limit],
      );

      return sendData(reply, rows);
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

    // Short-lived read URL for the stored proof file, so finance can review
    // the evidence without the bucket ever being public.
    app.get('/admin/payments/:id/proof-url', async (request, reply) => {
      authorize(request, 'payment:review');
      const { id } = parseOrThrow(idParams, request.params);
      const { rows } = await container.db.query<{ proof_file_key: string | null }>(
        'SELECT proof_file_key FROM payments WHERE id = $1',
        [id],
      );
      const payment = rows[0];
      if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 'Payment not found.', 404, { id });
      if (!payment.proof_file_key) {
        throw new AppError('PROOF_NOT_FOUND', 'No proof file stored for this payment.', 404, {
          id,
        });
      }
      const url = await container.storage.presignedGetUrl(payment.proof_file_key);
      const ttl = container.env.STORAGE_DRIVER === 's3' ? 900 : null;
      return sendData(reply, { url, expiresInSeconds: ttl });
    });

  };
}