import { z } from 'zod';

const uuid = z.string().uuid();

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().min(5).max(50),
});

export const souvenirSelectionSchema = z.object({
  optionGroupId: uuid,
  optionId: uuid,
  quantity: z.number().int().min(1).max(10).default(1),
});

export const ticketSelectionSchema = z.object({
  congregationId: uuid.nullish(),
  discountCode: z.string().trim().min(1).max(100).nullish(),
  beverageOptionId: uuid.nullish(),
  souvenirSelections: z.array(souvenirSelectionSchema).max(20).optional(),
});

export const orderItemSchema = z.object({
  ticketOfferId: uuid,
  quantity: z.number().int().min(1).max(50),
  tickets: z.array(ticketSelectionSchema).default([]),
});

/**
 * The client never sends amounts. `createOrderSchema` deliberately has no
 * price/total fields: any total the client computes is ignored and the
 * authoritative value is recomputed server-side from configuration.
 */
export const createOrderSchema = z.object({
  eventSlug: z.string().trim().min(1).max(200),
  customer: customerSchema,
  items: z.array(orderItemSchema).min(1).max(20),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type TicketSelectionInput = z.infer<typeof ticketSelectionSchema>;

export const paymentMethodSchema = z.enum(['QRIS', 'BANK_TRANSFER']);

export const paymentProofSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().int().nonnegative(),
  proofFileKey: z.string().trim().min(1).max(500).optional(),
  proofFileName: z.string().trim().max(255).optional(),
  proofMimeType: z.string().trim().max(150).optional(),
  proofSizeBytes: z.number().int().nonnegative().max(50 * 1024 * 1024).optional(),
  reference: z.string().trim().max(150).optional(),
});