-- 006_discount_codes.sql
-- Promotions (BR-TKT-06 / FR-05).
--
-- The Hosiana Early Bird discount turns the Rp175.000 Early Bird base price
-- into an effective Rp150.000 (Rp25.000 fixed discount) for at most 35 tickets,
-- counted PER TICKET, and only for the Early Bird offer.
--
-- !! PRODUCTION WARNING !!
-- The code value below is a CLEARLY-MARKED DEV PLACEHOLDER. Admin must change
-- it (POST /admin/discount-codes) before production. Do not ship this literal.

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
    '2026-09-01T00:00:00+07',
    '2026-09-30T23:59:59+07',
    'ACTIVE'
)
ON CONFLICT (code) DO NOTHING;

-- Backfill the Hosiana allocation with the discount code reference.
-- Idempotent: only updates while the column is still NULL.
UPDATE offer_allocations
   SET discount_code_id = '88888888-8888-4888-8888-888888888801'
 WHERE code = 'EARLY_BIRD_HOSIANA'
   AND discount_code_id IS NULL;
