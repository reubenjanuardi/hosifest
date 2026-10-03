-- 010_event_and_sales_phases.sql
-- The HOSIFEST event and its three sales phases (BR-TKT-01).
--
-- PRICING / QUOTA / DATE NOTE
-- The phase boundaries below are DEVELOPMENT placeholders so the app boots with
-- a coherent timeline. Phase dates and prices are CONFIGURATION: admin must
-- review and set the real dates before any production deploy. Nothing here is
-- a compile-time constant in the backend; the backend always reads these rows.

-- ------------------------------------------------------------------- event
INSERT INTO events (
    id, name, slug, description, starts_at, ends_at,
    venue_name, venue_address, status
) VALUES (
    '44444444-4444-4444-8444-444444444401',
    'HOSIFEST',
    'hosifest',
    'HOSIFEST main event. Timings and venue are configured by admin.',
    '2026-11-14T08:00:00+07',
    '2026-11-14T20:00:00+07',
    'DEV PLACEHOLDER - set by admin',
    'DEV PLACEHOLDER - set by admin',
    'PUBLISHED'
)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------------ sales phases
-- Exactly three operational phases. CHECK constraint pins the allowed codes.
INSERT INTO sales_phases (
    id, event_id, code, name, start_at, end_at,
    visibility, status, display_order
) VALUES
  ('44444444-4444-4444-8444-444444444411',
   '44444444-4444-4444-8444-444444444401',
   'EARLY_BIRD', 'Early Bird',
   '2026-09-01T00:00:00+07', '2026-09-30T23:59:59+07',
   'RESTRICTED', 'ACTIVE', 1),
  ('44444444-4444-4444-8444-444444444412',
   '44444444-4444-4444-8444-444444444401',
   'PRESALE', 'Presale',
   '2026-10-01T00:00:00+07', '2026-10-31T23:59:59+07',
   'PUBLIC', 'SCHEDULED', 2),
  ('44444444-4444-4444-8444-444444444413',
   '44444444-4444-4444-8444-444444444401',
   'NORMAL', 'Normal / OTS',
   '2026-11-01T00:00:00+07', '2026-11-14T07:59:59+07',
   'PUBLIC', 'SCHEDULED', 3)
ON CONFLICT (event_id, code) DO NOTHING;
