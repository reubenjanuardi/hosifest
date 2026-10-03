-- 001_roles_permissions.sql
-- Seed roles and permissions from 02-actors-roles-use-cases.md.
-- All inserts are idempotent (ON CONFLICT DO NOTHING).
--
-- Deterministic UUIDs are used so later seed files can reference these rows.

INSERT INTO roles (id, code, name, description) VALUES
  ('11111111-1111-4111-8111-111111111101', 'SUPER_ADMIN', 'Super Admin',
   'All administrative functions including user/role management and audit log access.'),
  ('11111111-1111-4111-8111-111111111102', 'ADMIN', 'Sales/Admin',
   'Configure ticket phases, prices, quotas and promotions; view orders and ticket sales.'),
  ('11111111-1111-4111-8111-111111111103', 'FINANCE', 'Finance/Admin',
   'View and review payment proofs; view financial reports.'),
  ('11111111-1111-4111-8111-111111111104', 'CHECKIN', 'Check-in Staff',
   'Scan QR for ENTRY and EXIT; search ticket codes.'),
  ('11111111-1111-4111-8111-111111111105', 'SOUVENIR', 'Souvenir/Admin',
   'Manage souvenir option groups/options and view per-ticket customization.')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, description) VALUES
  ('22222222-2222-4222-8222-222222222201', 'ticket:write',      'Create or modify ticket phases, offers and allocations.'),
  ('22222222-2222-4222-8222-222222222202', 'catalog:write',     'Manage beverage, souvenir and product catalogs.'),
  ('22222222-2222-4222-8222-222222222203', 'promotion:write',   'Manage discount codes and usage limits.'),
  ('22222222-2222-4222-8222-222222222204', 'report:read',       'Read reporting endpoints.'),
  ('22222222-2222-4222-8222-222222222205', 'payment:read',      'View payment records and proofs.'),
  ('22222222-2222-4222-8222-222222222206', 'payment:review',    'Approve or reject payment proofs.'),
  ('22222222-2222-4222-8222-222222222207', 'attendance:read',   'View ticket and attendance state.'),
  ('22222222-2222-4222-8222-222222222208', 'attendance:write',  'Record ENTRY and EXIT scans.'),
  ('22222222-2222-4222-8222-222222222209', 'souvenir:read',     'View souvenir customization data.'),
  ('22222222-2222-4222-8222-222222222210', 'souvenir:write',    'Manage souvenir options and fulfillment status.'),
  ('22222222-2222-4222-8222-222222222211', 'user:manage',       'Manage users and role assignments.'),
  ('22222222-2222-4222-8222-222222222212', 'audit:read',        'Read audit logs.'),
  ('22222222-2222-4222-8222-222222222213', 'order:read',        'View orders.'),
  ('22222222-2222-4222-8222-222222222214', 'order:write',       'Administrative order operations.')
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN: wildcard is enforced by the backend, not by rows here.
-- Everything explicit is granted so the role is self-describing in the DB.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
 CROSS JOIN permissions p
 WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('ticket:write','catalog:write','promotion:write','report:read','order:read','order:write','audit:read')
 WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('payment:read','payment:review','report:read','order:read')
 WHERE r.code = 'FINANCE'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('attendance:read','attendance:write')
 WHERE r.code = 'CHECKIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.code IN ('souvenir:read','souvenir:write','report:read')
 WHERE r.code = 'SOUVENIR'
ON CONFLICT DO NOTHING;
