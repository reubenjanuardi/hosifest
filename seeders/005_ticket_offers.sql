-- 005_ticket_offers.sql
-- Ticket offers and allocations matching BR-TKT-02 / FR-03.
--
-- Initial seeded configuration (editable by admin, NOT compile-time constants):
--
--   EARLY_BIRD  base Rp175.000, offer quota 95 (35 Hosiana + 60 Mupel)
--   PRESALE     Rp225.000, quota 55 (includes beverage + tumbler)
--   NORMAL/OTS  Rp250.000, quota 50
--   TOTAL       200
--
-- The Hosiana effective Rp150.000 is produced by the discount code seeded in
-- 006_discount_codes.sql (Rp175.000 - Rp25.000) capped at 35 tickets.
-- The backend computes the effective price; the DB only stores configuration.

-- --------------------------------------------------------------- offers
INSERT INTO ticket_offers (
    id, sales_phase_id, code, name, description,
    base_price, quota, purchase_limit_min, purchase_limit_max,
    visibility, sales_channel, status, sort_order
) VALUES
  ('66666666-6666-4666-8666-666666666601',
   '44444444-4444-4444-8444-444444444411',
   'EARLY_BIRD',
   'Early Bird',
   'Restricted early-bird offer. Base price Rp175.000. Hosiana origin requires a discount code; Mupel JakPus origin requires a configured congregation.',
   175000, 95, 1, 10,
   'RESTRICTED', 'ONLINE', 'ACTIVE', 1),
  ('66666666-6666-4666-8666-666666666602',
   '44444444-4444-4444-8444-444444444412',
   'PRESALE',
   'Presale + Beverage & Tumbler',
   'Presale offer Rp225.000. Includes one beverage and one tumbler per ticket.',
   225000, 55, 1, 10,
   'PUBLIC', 'ONLINE', 'ACTIVE', 2),
  ('66666666-6666-4666-8666-666666666603',
   '44444444-4444-4444-8444-444444444413',
   'NORMAL',
   'Normal / OTS',
   'Normal / on-the-spot offer Rp250.000.',
   250000, 50, 1, 10,
   'PUBLIC', 'BOTH', 'ACTIVE', 3)
ON CONFLICT (sales_phase_id, code) DO NOTHING;

-- ---------------------------------------------------------- allocations
-- Early Bird is split into two configurable buckets (BR-TKT-02):
--   HOSIANA bucket   quota 35, eligibility DISCOUNT_CODE  (needs the code)
--   MUPEL  bucket    quota 60, eligibility CONGREGATION_LIST (needs a congregation)
-- PRESALE / NORMAL have a single FREE bucket equal to the offer quota.
--
-- The Hosiana bucket carries discount_code_id directly, so the discount code
-- must exist BEFORE this file runs. It is inserted here (idempotently) rather
-- than in 006, because offer_allocations_discount_chk forbids a DISCOUNT_CODE
-- bucket with a NULL discount_code_id.
--
-- !! PRODUCTION WARNING !! HOSIFEST_DEV_HOSIANA is a DEV PLACEHOLDER code.
-- Admin must change it (POST /admin/discount-codes) before production.
INSERT INTO discount_codes (
    id, code, name, description,
    discount_type, discount_value,
    max_total_usage, max_usage_per_order, max_usage_per_customer,
    eligible_ticket_offer_id, eligible_congregation_id,
    active_from, active_until, status
) VALUES (
    '88888888-8888-4888-8888-888888888801',
    'HOSIFEST_DEV_HOSIANA',
    'Early Bird - GPIB Hosiana (DEV PLACEHOLDER CODE)',
    'DEV PLACEHOLDER: dedicated Hosiana Early Bird discount. Rp175.000 -> Rp150.000, max 35 tickets. CHANGE THIS CODE IN PRODUCTION.',
    'FIXED_AMOUNT',
    25000,
    35,
    10,
    NULL,
    '66666666-6666-4666-8666-666666666601',
    '55555555-5555-4555-8555-555555555507',
    '2026-10-01T00:00:00+07',
    '2026-10-31T23:59:59+07',
    'ACTIVE'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO offer_allocations (
    id, ticket_offer_id, code, name, description,
    quota, eligibility_type, congregation_id, discount_code_id,
    requires_beverage, requires_souvenir, status, sort_order
) VALUES
  ('77777777-7777-4777-8777-777777777701',
   '66666666-6666-4666-8666-666666666601',
   'EARLY_BIRD_HOSIANA',
   'Early Bird - GPIB Hosiana Jakarta Pusat',
   'Hosiana Early Bird. Requires a valid dedicated discount code (effective Rp150.000, max 35 tickets).',
   35, 'DISCOUNT_CODE', '55555555-5555-4555-8555-555555555507', '88888888-8888-4888-8888-888888888801',
   FALSE, TRUE, 'ACTIVE', 1),
  ('77777777-7777-4777-8777-777777777702',
   '66666666-6666-4666-8666-666666666601',
   'EARLY_BIRD_MUPEL_JKP',
   'Early Bird - GPIB Mupel Jakarta Pusat',
   'Mupel JakPus Early Bird. Requires a configured Mupel Jakarta Pusat congregation.',
   60, 'CONGREGATION_LIST', NULL, NULL,
   FALSE, TRUE, 'ACTIVE', 2),
  ('77777777-7777-4777-8777-777777777703',
   '66666666-6666-4666-8666-666666666602',
   'PRESALE_DEFAULT',
   'Presale (beverage + tumbler)',
   'Presale allocation. Beverage selection is mandatory per ticket.',
   55, 'FREE', NULL, NULL,
   TRUE, TRUE, 'ACTIVE', 1),
  ('77777777-7777-4777-8777-777777777704',
   '66666666-6666-4666-8666-666666666603',
   'NORMAL_DEFAULT',
   'Normal / OTS',
   'Normal allocation.',
   50, 'FREE', NULL, NULL,
   FALSE, TRUE, 'ACTIVE', 1)
ON CONFLICT (ticket_offer_id, code) DO NOTHING;

