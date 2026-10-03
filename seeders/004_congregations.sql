-- 004_congregations.sql
-- Configurable Early Bird eligibility list (BR-TKT-05 / FR-04):
-- the 12 GPIB Mupel Jakarta Pusat congregations.
--
-- These are CONFIGURATION ROWS. The backend must read them from the database;
-- it must NOT hardcode these names. Admins can add/remove rows.

INSERT INTO congregations (id, name, code, region, active, display_order) VALUES
  ('55555555-5555-4555-8555-555555555501', 'GPIB "Paulus" Jakarta Pusat',      'MJP_PAULUS',     'Jakarta Pusat', TRUE,  1),
  ('55555555-5555-4555-8555-555555555502', 'GPIB "Anugerah" Jakarta Pusat',    'MJP_ANUGERAH',   'Jakarta Pusat', TRUE,  2),
  ('55555555-5555-4555-8555-555555555503', 'GPIB "Bethesda" Jakarta Pusat',    'MJP_BETHESDA',   'Jakarta Pusat', TRUE,  3),
  ('55555555-5555-4555-8555-555555555504', 'GPIB "Betlehem" Jakarta Pusat',    'MJP_BETLEHEM',   'Jakarta Pusat', TRUE,  4),
  ('55555555-5555-4555-8555-555555555505', 'GPIB "Bukit Zaitun" Jakarta Pusat','MJP_BUKIT_ZAITUN','Jakarta Pusat', TRUE,  5),
  ('55555555-5555-4555-8555-555555555506', 'GPIB "Ebenhaezer" Jakarta Pusat',  'MJP_EBENHAEZER', 'Jakarta Pusat', TRUE,  6),
  ('55555555-5555-4555-8555-555555555507', 'GPIB "Hosiana" Jakarta Pusat',     'MJP_HOSIANA',    'Jakarta Pusat', TRUE,  7),
  ('55555555-5555-4555-8555-555555555508', 'GPIB "Immanuel" Jakarta Pusat',    'MJP_IMMANUEL',   'Jakarta Pusat', TRUE,  8),
  ('55555555-5555-4555-8555-555555555509', 'GPIB "Maranatha" Jakarta Pusat',   'MJP_MARANATHA',  'Jakarta Pusat', TRUE,  9),
  ('55555555-5555-4555-8555-555555555510', 'GPIB "Gideon" Jakarta Pusat',      'MJP_GIDEON',     'Jakarta Pusat', TRUE, 10),
  ('55555555-5555-4555-8555-555555555511', 'GPIB "Petrus" Jakarta Pusat',      'MJP_PETRUS',     'Jakarta Pusat', TRUE, 11),
  ('55555555-5555-4555-8555-555555555512', 'GPIB "Pniel" Jakarta Pusat',       'MJP_PNIEL',      'Jakarta Pusat', TRUE, 12)
ON CONFLICT (code) DO NOTHING;
