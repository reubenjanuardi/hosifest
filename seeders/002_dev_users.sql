-- 002_dev_users.sql
-- DEV-ONLY seed users. Clearly marked placeholders. NO real secrets.
-- Passwords are bcrypt (cost 10) hashes of the dev-only strings below.
--
--   admin@hosifest.test    / DevAdmin!2024
--   finance@hosifest.test  / DevFinance!2024
--   checkin@hosifest.test  / DevCheckin!2024
--   souvenir@hosifest.test/ DevSouvenir!2024
--
-- !! PRODUCTION WARNING !!
-- These accounts MUST NOT be loaded in production. Delete these rows or rotate
-- the passwords before any production deploy. Do not commit real credentials.

INSERT INTO users (id, email, full_name, password_hash, status) VALUES
  ('33333333-3333-4333-8333-333333333301', 'admin@hosifest.test', 'Dev Super Admin',
   '$2y$10$oRokUq7kmA2gjvOQgRhKcu41dbb/pxLzVmI59ZKnzdSZov5v0ZAIC', 'ACTIVE'),
  ('33333333-3333-4333-8333-333333333302', 'finance@hosifest.test', 'Dev Finance',
   '$2y$10$ZmDC81y3BhtUq/bTp6YTteWG7asU5hgzWMAwhtq9xtTMPJcKGLD8.', 'ACTIVE'),
  ('33333333-3333-4333-8333-333333333303', 'checkin@hosifest.test', 'Dev Check-in',
   '$2y$10$UjS3BCLHcSxaUZ78JPNoXu366Cziz4bpPkcHeG8KmHzjCOBoV4ncy', 'ACTIVE')
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO users (id, email, full_name, password_hash, status) VALUES
  ('33333333-3333-4333-8333-333333333304', 'souvenir@hosifest.test', 'Dev Souvenir',
   '$2y$10$ogmdbi6PdObLS/gEjesODe1NPNW0lpr/2zU8/ypaaTQw/l1mJXzS.', 'ACTIVE')
ON CONFLICT (lower(email)) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON r.code = 'SUPER_ADMIN'
 WHERE u.email = 'admin@hosifest.test'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON r.code = 'FINANCE'
 WHERE u.email = 'finance@hosifest.test'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON r.code = 'CHECKIN'
 WHERE u.email = 'checkin@hosifest.test'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
  FROM users u
  JOIN roles r ON r.code = 'SOUVENIR'
 WHERE u.email = 'souvenir@hosifest.test'
ON CONFLICT DO NOTHING;

