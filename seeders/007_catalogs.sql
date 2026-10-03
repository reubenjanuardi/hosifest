-- 007_catalogs.sql
-- Beverage catalog, souvenir configuration and Presale benefit entitlements.
-- All values are CONFIGURATION ROWS that admins can change.

-- ---------------------------------------------------- beverage_options
-- Initial dynamic Presale beverage catalog (BR-BEN-04).
INSERT INTO beverage_options (id, code, name, description, active, display_order) VALUES
  ('99999999-9999-4999-8999-999999999901', 'ES_KOPI_SUSU', 'Es Kopi Susu', 'Iced coffee with milk.', TRUE, 1),
  ('99999999-9999-4999-8999-999999999902', 'MILK_TEA',      'Milk Tea',      'Milk tea.',                TRUE, 2)
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------ souvenir_option_groups
-- Configurable grouping of keychain customization choices (BR-SOU-06).
INSERT INTO souvenir_option_groups (
    id, code, name, description, selection_min, selection_max, display_order, active
) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'CHARM', 'Charm',
   'Charm/accessory attached to the canvas keychain.', 1, 1, 1, TRUE),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'BASE',  'Keychain Base',
   'Canvas keychain base design.', 1, 1, 2, TRUE),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'RIBBON', 'Ribbon Color',
   'Ribbon colour for the keychain.', 1, 1, 3, TRUE)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------- souvenir_options
INSERT INTO souvenir_options (id, option_group_id, code, name, display_order, active) VALUES
  -- CHARM group
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'CHARM_CROSS',     'Cross',         1, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'CHARM_DOVE',      'Dove',          2, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'CHARM_STAR',      'Star',          3, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'CHARM_HEART',     'Heart',         4, TRUE),
  -- BASE group
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb05', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'BASE_CLASSIC',    'Classic',       1, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb06', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'BASE_ROUND',      'Round',         2, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb07', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'BASE_SQUARE',     'Square',        3, TRUE),
  -- RIBBON group
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb08', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'RIBBON_RED',      'Red',           1, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb09', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'RIBBON_BLUE',     'Blue',          2, TRUE),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'RIBBON_WHITE',    'White',         3, TRUE)
ON CONFLICT (option_group_id, code) DO NOTHING;

-- -------------------------------------------------- benefit_definitions
-- Included entitlements per offer (BR-BEN-02).
--   PRESALE -> BEVERAGE x1 (customer picks from beverage_options, mandatory)
--              TUMBLER  x1 (fulfilled without a customer choice)
--   EARLY_BIRD / NORMAL -> no beverage/tumbler entitlement
-- The one canvas keychain is universal (BR-SOU-01) and is represented by the
-- souvenir_customizations table, not by a per-offer benefit row.
INSERT INTO benefit_definitions (
    id, ticket_offer_id, benefit_type, name, quantity,
    source_type, source_option_id, is_mandatory, sort_order
) VALUES
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '66666666-6666-4666-8666-666666666602',
   'BEVERAGE', 'Presale Beverage', 1, 'BEVERAGE_OPTIONS', NULL, TRUE, 1),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '66666666-6666-4666-8666-666666666602',
   'TUMBLER',  'Presale Tumbler',  1, NULL, NULL, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------- products (samples)
-- Generic commerce catalog (04-data-model-erd). Ticket benefits are NOT sold as
-- products; these are optional add-on merchandise.
INSERT INTO products (id, event_id, code, name, description, price, stock, is_active, sort_order) VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '44444444-4444-4444-8444-444444444401',
   'MERCH_TEE', 'HOSIFEST T-Shirt', 'Event T-shirt.', 75000, 200, TRUE, 1),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '44444444-4444-4444-8444-444444444401',
   'MERCH_TOTEBAG', 'HOSIFEST Tote Bag', 'Event tote bag.', 50000, 150, TRUE, 2)
ON CONFLICT (code) DO NOTHING;
