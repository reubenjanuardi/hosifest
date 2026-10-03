import type { FastifyReply } from 'fastify';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, type ErrorCode } from './errors.js';

export interface ApiErrorBody {
  data: null;
  meta: Record<string, unknown>;
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}

export function sendData<T>(
  reply: FastifyReply,
  data: T,
  meta: Record<string, unknown> = {},
  statusCode = 200,
): FastifyReply {
  return reply.status(statusCode).send({ data, meta, error: null });
}

/** Parse a request part with Zod. A ZodError becomes the canonical envelope. */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  return schema.parse(value);
}

export function errorFromUnknown(error: unknown): {
  statusCode: number;
  body: ApiErrorBody;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        data: null,
        meta: {},
        error: { code: error.code, message: error.message, details: error.details },
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 422,
      body: {
        data: null,
        meta: {},
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request payload failed validation.',
          details: { issues: error.issues },
        },
      },
    };
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.';
  return {
    statusCode: 500,
    body: {
      data: null,
      meta: {},
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.', details: { internal: message } },
    },
  };
}