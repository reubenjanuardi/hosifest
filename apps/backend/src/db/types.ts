import type { PoolClient } from 'pg';

/**
 * Row types mirroring the ACTUAL schema produced by `migrations/*.sql`.
 *
 * These are the authoritative shapes as of the database agent's migrations,
 * not `15-database-schema.md`. Where the two disagree the migrations win.
 */

export interface EventRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SalesPhaseRow {
  id: string;
  event_id: string;
  code: 'EARLY_BIRD' | 'PRESALE' | 'NORMAL';
  name: string;
  start_at: string | null;
  end_at: string | null;
  visibility: 'PUBLIC' | 'RESTRICTED' | 'HIDDEN';
  status: 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TicketOfferRow {
  id: string;
  sales_phase_id: string;
  code: string;
  name: string;
  description: string | null;
  base_price: number;
  quota: number;
  reserved_quantity: number;
  sold_quantity: number;
  purchase_limit_min: number | null;
  purchase_limit_max: number | null;
  active_from: string | null;
  active_until: string | null;
  visibility: 'PUBLIC' | 'RESTRICTED' | 'HIDDEN';
  sales_channel: 'ONLINE' | 'OFFLINE' | 'BOTH';
  status: 'DRAFT' | 'ACTIVE' | 'SOLD_OUT' | 'CLOSED' | 'ARCHIVED';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** `eligibility_type` is constrained by the migration to these three values. */
export type EligibilityType = 'FREE' | 'CONGREGATION_LIST' | 'DISCOUNT_CODE';

export interface OfferAllocationRow {
  id: string;
  ticket_offer_id: string;
  code: string;
  name: string;
  description: string | null;
  quota: number;
  reserved_quantity: number;
  sold_quantity: number;
  eligibility_type: EligibilityType;
  congregation_id: string | null;
  discount_code_id: string | null;
  /** Per-allocation benefit switches, seeded alongside the quota bucket. */
  requires_beverage: boolean;
  requires_souvenir: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'SOLD_OUT' | 'CLOSED' | 'ARCHIVED';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CongregationRow {
  id: string;
  name: string;
  code: string;
  region: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'WAITING_PAYMENT'
  | 'PAYMENT_REVIEW'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export interface OrderRow {
  id: string;
  order_number: string;
  event_id: string;
  customer_id: string;
  status: OrderStatus;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_deadline_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  paid_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderItemType = 'TICKET' | 'PRODUCT';

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: OrderItemType;
  ticket_offer_id: string | null;
  product_id: string | null;
  /** First-class FK: an allocation row owns the quota bucket, not JSONB. */
  allocation_id: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal_amount: number;
  item_name_snapshot: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type PaymentStatus =
  | 'PENDING_PROOF'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface PaymentRow {
  id: string;
  order_id: string;
  method: 'QRIS' | 'BANK_TRANSFER';
  amount: number;
  proof_file_key: string | null;
  proof_mime_type: string | null;
  external_reference: string | null;
  status: PaymentStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Constrained by the migration to ISSUED | USED | VOID | EXPIRED. */
export type TicketStatus = 'ISSUED' | 'USED' | 'VOID' | 'EXPIRED';

export interface TicketRow {
  id: string;
  order_item_id: string;
  ticket_offer_id: string;
  ticket_code: string;
  qr_token_hash: string;
  /** 1..quantity within the order item; UNIQUE (order_item_id, sequence_number). */
  sequence_number: number;
  holder_name_snapshot: string;
  price_snapshot: number;
  discount_snapshot: number;
  /** CHECK: effective_price_snapshot = price_snapshot - discount_snapshot */
  effective_price_snapshot: number;
  congregation_id: string | null;
  congregation_name_snapshot: string | null;
  discount_code_id: string | null;
  allocation_id: string | null;
  status: TicketStatus;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface BeverageOptionRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface BenefitDefinitionRow {
  id: string;
  ticket_offer_id: string;
  benefit_type: 'BEVERAGE' | 'TUMBLER' | 'SOUVENIR' | 'OTHER';
  name: string;
  quantity: number;
  /** NULL => fulfilled without a customer choice (e.g. an automatic tumbler). */
  source_type: 'BEVERAGE_OPTIONS' | 'PRODUCT_OPTIONS' | null;
  source_option_id: string | null;
  is_mandatory: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SouvenirOptionGroupRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  selection_min: number;
  selection_max: number;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SouvenirOptionRow {
  id: string;
  option_group_id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  metadata: Record<string, unknown> | null;
  display_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type DiscountType = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'FIXED_PRICE';

export interface DiscountCodeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_total_usage: number | null;
  max_usage_per_order: number | null;
  max_usage_per_customer: number | null;
  eligible_ticket_offer_id: string | null;
  eligible_event_id: string | null;
  eligible_congregation_id: string | null;
  active_from: string | null;
  active_until: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export type DiscountUsageStatus = 'RESERVED' | 'CONSUMED' | 'RELEASED';

export interface DiscountUsageRow {
  id: string;
  discount_code_id: string;
  order_id: string;
  /** One row per ticket when a ticket exists (unique index). */
  ticket_id: string | null;
  quantity: number;
  status: DiscountUsageStatus;
  reserved_at: string | null;
  released_at: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSessionRow {
  id: string;
  ticket_id: string;
  event_id: string;
  entry_at: string;
  entry_scanned_by: string;
  entry_gate: string | null;
  exit_at: string | null;
  exit_scanned_by: string | null;
  exit_gate: string | null;
  scan_mode: 'QR' | 'MANUAL_CODE' | 'MANUAL_OVERRIDE';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** `benefit_selections` is a VIEW over the real `ticket_benefit_selections`. */
export interface TicketBenefitSelectionRow {
  id: string;
  ticket_id: string;
  benefit_definition_id: string;
  benefit_type: 'BEVERAGE' | 'TUMBLER' | 'SOUVENIR' | 'OTHER';
  beverage_option_id: string | null;
  quantity: number;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface ProductRow {
  id: string;
  event_id: string | null;
  code: string;
  name: string;
  description: string | null;
  price: number;
  stock: number | null;
  /** NOTE: column is `is_active`, not `active`. */
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  /** NOTE: column is `full_name`, not `name`. */
  full_name: string;
  password_hash: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type LockableClient = Pick<PoolClient, 'query'>;