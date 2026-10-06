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

        // Multipart carries one file plus the method/amount/reference fields.
        // `request.parts()` is the single consumer of the stream, so it is
        // iterated exactly once and each part is dispatched by type.
        const fields: Record<string, string> = {};
        let upload: { mimeType: string; buffer: Buffer } | null = null;

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (upload) {
              throw new AppError(
                'VALIDATION_ERROR',
                'Only one payment proof file may be uploaded.',
                422,
              );
            }
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk as Buffer);
            }
            upload = { mimeType: part.mimetype, buffer: Buffer.concat(chunks) };
          } else {
            fields[part.fieldname] = String(part.value);
          }
        }

        if (!upload) {
          throw new AppError('VALIDATION_ERROR', 'Payment proof file is required.', 422);
        }

        // Validate the stored evidence, never the client's own byte count.
        container.storage.validate(upload.mimeType, upload.buffer.length);

        const { method, amount, reference } = parseOrThrow(paymentProofSchema, {
          method: fields.method,
          amount: Number(fields.amount),
          reference: fields.reference,
        });

        // Key is always server generated, so a client can neither choose the
        // destination nor overwrite another customer's proof.
        const proofKey = container.storage.buildProofKey(upload.mimeType, orderNumber);
        await container.storage.put(proofKey, upload.buffer, upload.mimeType);

        let submitted;
        try {
          submitted = await container.orderQueries.submitPaymentProof(orderNumber, {
            method,
            amount,
            reference,
            proofFileKey: proofKey,
          });
        } catch (error) {
          // Order was expired / cancelled / already paid: the upload has no
          // payment row pointing at it, so drop the orphaned object.
          await container.storage.remove(proofKey).catch(() => {
            // Best effort — an orphan object is preferable to a failed request.
          });
          throw error;
        }

        const { order, payment } = submitted;

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