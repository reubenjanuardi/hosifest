import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { AppError } from '../../core/errors.js';
import { parseOrThrow, sendData } from '../../core/response.js';
import type { Container } from '../container.js';
import { createOrderSchema, paymentProofSchema } from './order.schema.js';

const orderNumberParams = z.object({ orderNumber: z.string().min(1).max(50) });

export function publicOrderRoutes(container: Container): FastifyPluginAsync {
  const { env } = container;
  const orderLimit = { max: env.RATE_LIMIT_ORDER_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS };
  const proofLimit = { max: env.RATE_LIMIT_PROOF_MAX, timeWindow: env.RATE_LIMIT_WINDOW_MS };

  return async (app) => {
    app.post('/orders', { config: { rateLimit: orderLimit } }, async (request, reply) => {
      const input = parseOrThrow(createOrderSchema, request.body);
      const result = await container.orders.createOrder(input);

      return sendData(
        reply,
        {
          orderNumber: result.order.order_number,
          status: result.order.status,
          // Server-computed totals. Any client-sent total was ignored.
          subtotalAmount: result.order.subtotal_amount,
          discountAmount: result.order.discount_amount,
          totalAmount: result.order.total_amount,
          expiresAt: result.order.expires_at,
          paymentWindowMinutes: config.PAYMENT_PROOF_WINDOW_MINUTES,
          items: result.items.map((item) => ({
            id: item.id,
            name: item.item_name_snapshot,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            discountAmount: item.discount_amount,
            subtotalAmount: item.subtotal_amount,
          })),
        },
        { calculatedBy: 'server' },
        201,
      );
    });

    app.get('/orders/:orderNumber', async (request, reply) => {
      const { orderNumber } = parseOrThrow(orderNumberParams, request.params);
      const view = await container.orderQueries.getByOrderNumber(orderNumber);
      return sendData(reply, {
        orderNumber: view.order.order_number,
        status: view.order.status,
        subtotalAmount: view.order.subtotal_amount,
        discountAmount: view.order.discount_amount,
        totalAmount: view.order.total_amount,
        expiresAt: view.order.expires_at,
        createdAt: view.order.created_at,
        items: view.items.map((item) => ({
          id: item.id,
          name: item.item_name_snapshot,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          discountAmount: item.discount_amount,
          subtotalAmount: item.subtotal_amount,
          metadata: item.metadata,
          tickets: item.tickets,
        })),
        payments: view.payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          status: payment.status,
          submittedAt: payment.submitted_at,
          reviewedAt: payment.reviewed_at,
          rejectionReason: payment.rejection_reason,
        })),
      });
    });

    app.post(
      '/orders/:orderNumber/payment-proof',
      { config: { rateLimit: proofLimit } },
      async (request, reply) => {
        const { orderNumber } = parseOrThrow(orderNumberParams, request.params);
        const body = parseOrThrow(paymentProofSchema, request.body);

        if (body.proofMimeType && !isAllowedMime(body.proofMimeType, env.STORAGE_ALLOWED_MIME)) {
          throw new AppError(
            'UNSUPPORTED_FILE_TYPE',
            'Payment proof file type is not allowed.',
            422,
            { allowed: env.STORAGE_ALLOWED_MIME },
          );
        }
        if (body.proofSizeBytes && body.proofSizeBytes > env.STORAGE_MAX_UPLOAD_BYTES) {
          throw new AppError(
            'FILE_TOO_LARGE',
            'Payment proof file exceeds the maximum allowed size.',
            413,
            { maxBytes: env.STORAGE_MAX_UPLOAD_BYTES },
          );
        }

        const { order, payment } = await container.orderQueries.submitPaymentProof(orderNumber, {
          method: body.method,
          amount: body.amount,
          proofFileKey: body.proofFileKey,
        });

        return sendData(
          reply,
          {
            orderNumber: order.order_number,
            status: order.status,
            totalAmount: order.total_amount,
            paymentId: payment.id,
            paymentStatus: payment.status,
            submittedAt: payment.submitted_at,
          },
          {},
          201,
        );
      },
    );
  };
}

export function isAllowedMime(mime: string, allowedCsv: string): boolean {
  const allowed = allowedCsv
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(mime.trim().toLowerCase());
}