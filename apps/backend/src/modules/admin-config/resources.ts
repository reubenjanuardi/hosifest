import type { ResourceDefinition } from './config-crud.service.js';

/**
 * Resource definitions mirroring the ACTUAL `migrations/*.sql` schema.
 *
 * `writable` deliberately EXCLUDES `reserved_quantity` / `sold_quantity` on
 * ticket_offers and offer_allocations: those counters are owned by the
 * reservation engine, and an admin edit would break the
 * `sold + reserved <= quota` invariant enforced by table CHECKs.
 */
export const RESOURCES = {
  events: {
    table: 'events',
    entity: 'event',
    lookupColumn: 'slug',
    orderBy: 'created_at',
    writable: [
      'name', 'slug', 'description', 'starts_at', 'ends_at',
      'venue_name', 'venue_address', 'status',
    ],
    readable: [
      'id', 'name', 'slug', 'description', 'starts_at', 'ends_at',
      'venue_name', 'venue_address', 'status', 'created_at', 'updated_at',
    ],
    deactivate: true,
  },

  salesPhases: {
    table: 'sales_phases',
    entity: 'sales_phase',
    lookupColumn: 'code',
    orderBy: 'display_order',
    writable: [
      'event_id', 'code', 'name', 'start_at', 'end_at',
      'visibility', 'status', 'display_order',
    ],
    readable: [
      'id', 'event_id', 'code', 'name', 'start_at', 'end_at',
      'visibility', 'status', 'display_order', 'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  ticketOffers: {
    table: 'ticket_offers',
    entity: 'ticket_offer',
    lookupColumn: 'code',
    orderBy: 'created_at',
    writable: [
      'sales_phase_id', 'code', 'name', 'description', 'base_price', 'quota',
      'purchase_limit_min', 'purchase_limit_max', 'active_from', 'active_until',
      'visibility', 'sales_channel', 'status', 'sort_order',
    ],
    readable: [
      'id', 'sales_phase_id', 'code', 'name', 'description', 'base_price', 'quota',
      'reserved_quantity', 'sold_quantity', 'purchase_limit_min', 'purchase_limit_max',
      'active_from', 'active_until', 'visibility', 'sales_channel', 'status',
      'sort_order', 'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  offerAllocations: {
    table: 'offer_allocations',
    entity: 'offer_allocation',
    lookupColumn: 'code',
    orderBy: 'sort_order',
    writable: [
      'ticket_offer_id', 'code', 'name', 'description', 'quota',
      'eligibility_type', 'congregation_id', 'discount_code_id',
      'requires_beverage', 'requires_souvenir', 'status', 'sort_order',
    ],
    readable: [
      'id', 'ticket_offer_id', 'code', 'name', 'description', 'quota',
      'reserved_quantity', 'sold_quantity', 'eligibility_type', 'congregation_id',
      'discount_code_id', 'requires_beverage', 'requires_souvenir', 'status',
      'sort_order', 'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  benefitDefinitions: {
    table: 'benefit_definitions',
    entity: 'benefit_definition',
    lookupColumn: 'name',
    orderBy: 'sort_order',
    writable: [
      'ticket_offer_id', 'benefit_type', 'name', 'quantity',
      'source_type', 'source_option_id', 'is_mandatory', 'sort_order',
    ],
    readable: [
      'id', 'ticket_offer_id', 'benefit_type', 'name', 'quantity',
      'source_type', 'source_option_id', 'is_mandatory', 'sort_order',
      'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  congregations: {
    table: 'congregations',
    entity: 'congregation',
    lookupColumn: 'code',
    orderBy: 'display_order',
    writable: ['name', 'code', 'region', 'active', 'display_order'],
    readable: [
      'id', 'name', 'code', 'region', 'active', 'display_order',
      'created_at', 'updated_at',
    ],
    deactivate: true,
  },

  discountCodes: {
    table: 'discount_codes',
    entity: 'discount_code',
    lookupColumn: 'code',
    orderBy: 'created_at',
    writable: [
      'code', 'name', 'description', 'discount_type', 'discount_value',
      'max_total_usage', 'max_usage_per_order', 'max_usage_per_customer',
      'eligible_ticket_offer_id', 'eligible_event_id', 'eligible_congregation_id',
      'active_from', 'active_until', 'status',
    ],
    readable: [
      'id', 'code', 'name', 'description', 'discount_type', 'discount_value',
      'max_total_usage', 'max_usage_per_order', 'max_usage_per_customer',
      'eligible_ticket_offer_id', 'eligible_event_id', 'eligible_congregation_id',
      'active_from', 'active_until', 'status', 'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  beverageOptions: {
    table: 'beverage_options',
    entity: 'beverage_option',
    lookupColumn: 'code',
    orderBy: 'display_order',
    writable: ['name', 'code', 'description', 'image_url', 'active', 'display_order'],
    readable: [
      'id', 'name', 'code', 'description', 'image_url', 'active', 'display_order',
      'created_at', 'updated_at',
    ],
    deactivate: true,
  },

  products: {
    table: 'products',
    entity: 'product',
    lookupColumn: 'code',
    orderBy: 'sort_order',
    // NOTE: the table uses `is_active`, not `active`.
    writable: ['event_id', 'name', 'code', 'description', 'price', 'stock', 'is_active', 'sort_order'],
    readable: [
      'id', 'event_id', 'name', 'code', 'description', 'price', 'stock',
      'is_active', 'sort_order', 'created_at', 'updated_at',
    ],
    deactivate: false,
  },

  souvenirOptionGroups: {
    table: 'souvenir_option_groups',
    entity: 'souvenir_option_group',
    lookupColumn: 'code',
    orderBy: 'display_order',
    writable: [
      'name', 'code', 'description', 'selection_min', 'selection_max',
      'display_order', 'active',
    ],
    readable: [
      'id', 'name', 'code', 'description', 'selection_min', 'selection_max',
      'display_order', 'active', 'created_at', 'updated_at',
    ],
    deactivate: true,
  },

  souvenirOptions: {
    table: 'souvenir_options',
    entity: 'souvenir_option',
    lookupColumn: 'code',
    orderBy: 'display_order',
    writable: [
      'option_group_id', 'name', 'code', 'description', 'image_url',
      'metadata', 'display_order', 'active',
    ],
    readable: [
      'id', 'option_group_id', 'name', 'code', 'description', 'image_url',
      'metadata', 'display_order', 'active', 'created_at', 'updated_at',
    ],
    deactivate: true,
  },
} as const satisfies Record<string, ResourceDefinition>;

export type ResourceKey = keyof typeof RESOURCES;