-- 001_roles_permissions.sql
-- Seed roles and permissions aligned with apps/backend/src/modules/identity/rbac.ts
-- All inserts are idempotent (ON CONFLICT DO NOTHING).
--
-- Deterministic UUIDs are used so later seed files can reference these rows.

INSERT INTO roles (id, code, name, description) VALUES
  ('11111111-1111-4111-8111-111111111101', 'ADMIN', 'Administrator',
   'Full administrative access: configure phases, prices, quotas, promotions; manage users; review payments; view all reports and audit logs.'),
  ('11111111-1111-4111-8111-111111111102', 'FINANCE', 'Finance/Admin',
   'View and review payment proofs; view financial reports and orders.'),
  ('11111111-1111-4111-8111-111111111103', 'ATTENDANCE', 'Check-in Staff',
   'Scan QR for ENTRY and EXIT; search ticket codes; view attendance reports.')
ON CONFLICT (code) DO NOTHING;

-- Legacy role codes from the previous seed. rbac.ts never accepted them, so any
-- account holding only one of these could not log in. They are remapped to the
-- role the backend actually recognises, then deleted (user_roles and
-- role_permissions cascade).
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, r.id
  FROM user_roles ur
  JOIN roles legacy ON legacy.id = ur.role_id
  JOIN roles r      ON r.code = 'ADMIN'
 WHERE legacy.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, r.id
  FROM user_roles ur
  JOIN roles legacy ON legacy.id = ur.role_id
  JOIN roles r      ON r.code = 'ATTENDANCE'
 WHERE legacy.code = 'CHECKIN'
ON CONFLICT DO NOTHING;

-- SOUVENIR has no counterpart in rbac.ts. Souvenir catalog administration is
-- only reachable through config:write, which rbac.ts grants to ADMIN, so the
-- mapping is ADMIN rather than silently downgrading the operator.
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, r.id
  FROM user_roles ur
  JOIN roles legacy ON legacy.id = ur.role_id
  JOIN roles r      ON r.code = 'ADMIN'
 WHERE legacy.code = 'SOUVENIR'
ON CONFLICT DO NOTHING;

DELETE FROM roles WHERE code IN ('SUPER_ADMIN', 'CHECKIN', 'SOUVENIR');

-- Permission catalogue. Codes mirror rbac.ts PERMISSIONS exactly; the role ->
-- permission grants below record the same shape as ROLE_PERMISSIONS so the
-- database stays readable next to the code that enforces access.
INSERT INTO permissions (id, code, description) VALUES
  ('22222222-2222-4222-8222-222222222201', 'config:read',    'Read administrative configuration.'),
  ('22222222-2222-4222-8222-222222222202', 'config:write',   'Create or modify administrative configuration.'),
  ('22222222-2222-4222-8222-222222222203', 'order:read',     'View orders.'),
  ('22222222-2222-4222-8222-222222222204', 'order:write',    'Administrative order operations.'),
  ('22222222-2222-4222-8222-222222222205', 'payment:review', 'Approve or reject payment proofs.'),
  ('22222222-2222-4222-8222-222222222206', 'ticket:read',    'Look up tickets and QR codes.'),
  ('22222222-2222-4222-8222-222222222207', 'attendance:scan','Record ENTRY and EXIT scans.'),
  ('22222222-2222-4222-8222-222222222208', 'report:read',    'Read reporting endpoints.'),
  ('22222222-2222-4222-8222-222222222209', 'audit:read',     'Read audit logs.')
ON CONFLICT (code) DO NOTHING;

-- Permission codes from the previous seed that rbac.ts never defines. They are
-- removed so the catalogue cannot drift into implying grants that do not exist.
DELETE FROM permissions
 WHERE code NOT IN (
   'config:read', 'config:write', 'order:read', 'order:write', 'payment:review',
   'ticket:read', 'attendance:scan', 'report:read', 'audit:read'
 );

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
