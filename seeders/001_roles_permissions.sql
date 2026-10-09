-- 001_roles_permissions.sql
-- Seed roles and permissions aligned with apps/backend/src/modules/identity/rbac.ts
-- Idempotent: every step is a wipe-then-reinsert or ON CONFLICT DO NOTHING, so
-- this file can be re-applied against an already-seeded database.
--
-- Deterministic UUIDs are used so later seed files can reference these rows.
--
-- IMPORTANT: the pre-rewrite seed used the SAME deterministic IDs with DIFFERENT
-- codes (roles: ...101 SUPER_ADMIN, ...104 CHECKIN, ...105 SOUVENIR;
-- permissions: 201 ticket:write, 202 catalog:write, 203 promotion:write,
-- 205 payment:read, 208 attendance:write, 209 souvenir:read, 211 user:manage, ...).
-- A plain INSERT ... ON CONFLICT (code) fails on roles_pkey / permissions_pkey
-- because the PK id clashes FIRST. Strategy: stash the current user -> role-code
-- assignments in a TEMP table, wipe roles/permissions, insert the new catalogue,
-- then restore assignments mapped onto the new codes. On a fresh DB the stash is
-- empty and every DELETE is a no-op; on re-run the stash holds current-code
-- assignments that map back onto the same deterministic ids.

-- Step 0: stash current user -> role-code assignments.
CREATE TEMP TABLE _legacy_user_roles AS
SELECT ur.user_id, r.code
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id;

-- Step 1: wipe roles (cascades user_roles + role_permissions) and re-insert.
DELETE FROM roles;

INSERT INTO roles (id, code, name, description) VALUES
  ('11111111-1111-4111-8111-111111111101', 'ADMIN', 'Administrator',
   'Full administrative access: configure phases, prices, quotas, promotions; manage users; review payments; view all reports and audit logs.'),
  ('11111111-1111-4111-8111-111111111102', 'FINANCE', 'Finance/Admin',
   'View and review payment proofs; view financial reports and orders.'),
  ('11111111-1111-4111-8111-111111111103', 'ATTENDANCE', 'Check-in Staff',
   'Scan QR for ENTRY and EXIT; search ticket codes; view attendance reports.');

-- Step 2: restore assignments mapped to the role the backend recognises.
-- SUPER_ADMIN / ADMIN / SOUVENIR -> ADMIN (SOUVENIR has no rbac.ts counterpart;
-- souvenir catalog admin needs config:write, which only ADMIN has).
INSERT INTO user_roles (user_id, role_id)
SELECT DISTINCT user_id, '11111111-1111-4111-8111-111111111101'::uuid
  FROM _legacy_user_roles
 WHERE code IN ('SUPER_ADMIN', 'ADMIN', 'SOUVENIR')
ON CONFLICT DO NOTHING;

-- FINANCE -> FINANCE (same concept, new deterministic id).
INSERT INTO user_roles (user_id, role_id)
SELECT DISTINCT user_id, '11111111-1111-4111-8111-111111111102'::uuid
  FROM _legacy_user_roles
 WHERE code = 'FINANCE'
ON CONFLICT DO NOTHING;

-- CHECKIN / ATTENDANCE -> ATTENDANCE.
INSERT INTO user_roles (user_id, role_id)
SELECT DISTINCT user_id, '11111111-1111-4111-8111-111111111103'::uuid
  FROM _legacy_user_roles
 WHERE code IN ('CHECKIN', 'ATTENDANCE')
ON CONFLICT DO NOTHING;

DROP TABLE _legacy_user_roles;

-- Step 3: wipe permissions (cascades role_permissions) and re-insert the
-- catalogue. Codes mirror rbac.ts PERMISSIONS exactly.
DELETE FROM permissions;

INSERT INTO permissions (id, code, description) VALUES
  ('22222222-2222-4222-8222-222222222201', 'config:read',    'Read administrative configuration.'),
  ('22222222-2222-4222-8222-222222222202', 'config:write',   'Create or modify administrative configuration.'),
  ('22222222-2222-4222-8222-222222222203', 'order:read',     'View orders.'),
  ('22222222-2222-4222-8222-222222222204', 'order:write',    'Administrative order operations.'),
  ('22222222-2222-4222-8222-222222222205', 'payment:review', 'Approve or reject payment proofs.'),
  ('22222222-2222-4222-8222-222222222206', 'ticket:read',    'Look up tickets and QR codes.'),
  ('22222222-2222-4222-8222-222222222207', 'attendance:scan','Record ENTRY and EXIT scans.'),
  ('22222222-2222-4222-8222-222222222208', 'report:read',    'Read reporting endpoints.'),
  ('22222222-2222-4222-8222-222222222209', 'audit:read',     'Read audit logs.');

-- ADMIN is a superset: rbac.ts grants it every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('config:read','order:read','order:write','payment:review','ticket:read','report:read')
 WHERE r.code = 'FINANCE'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('ticket:read','attendance:scan','report:read')
 WHERE r.code = 'ATTENDANCE'
ON CONFLICT DO NOTHING;
