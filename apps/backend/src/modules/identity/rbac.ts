export const ROLES = ['ADMIN', 'FINANCE', 'ATTENDANCE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  ATTENDANCE: 1,
  FINANCE: 2,
  ADMIN: 3,
};

export const PERMISSIONS = [
  'config:read',
  'config:write',
  'order:read',
  'order:write',
  'payment:review',
  'ticket:read',
  'attendance:scan',
  'report:read',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role -> permission matrix. ADMIN is a superset of the operational roles so
 * a single admin account can operate the whole event.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  FINANCE: ['config:read', 'order:read', 'order:write', 'payment:review', 'ticket:read', 'report:read'],
  ATTENDANCE: ['ticket:read', 'attendance:scan', 'report:read'],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  const set = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) set.add(permission);
  }
  return [...set];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}