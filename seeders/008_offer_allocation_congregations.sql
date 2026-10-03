-- 008_offer_allocation_congregations.sql
--
-- FR-04 / BR-TKT-02: the single 60-ticket Early Bird "Mupel Jakarta Pusat"
-- bucket is open to ANY of the 12 configured Mupel JakPus congregations.
--
-- The allocation itself is created in 005_ticket_offers.sql. The SET of
-- eligible congregations is recorded here in the join table introduced by
-- migration 010, because one `offer_allocations.congregation_id` column cannot
-- express a set of 12.
--
-- These are CONFIGURATION ROWS. Admins manage the congregation list and the
-- per-allocation membership through the admin API; nothing here is a constant
-- in application code (AGENTS.md section 3).

INSERT INTO offer_allocation_congregations (allocation_id, congregation_id) VALUES
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555501'), -- Paulus
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555502'), -- Anugerah
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555503'), -- Bethesda
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555504'), -- Bethlehem
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555505'), -- Bukit Zaitun
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555506'), -- Ebenhaezer
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555507'), -- Hosiana
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555508'), -- Immanuel
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555509'), -- Maranatha
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555510'), -- Gideon
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555511'), -- Petrus
  ('77777777-7777-4777-8777-777777777702', '55555555-5555-4555-8555-555555555512')  -- Pniel
ON CONFLICT (allocation_id, congregation_id) DO NOTHING;
