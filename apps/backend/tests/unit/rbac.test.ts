import { describe, expect, it } from 'vitest';
import { isRole, permissionsForRoles, roleHasPermission, ROLES } from '../../src/modules/identity/rbac.js';

describe('RBAC', () => {
  it('recognises only the three defined roles', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
    expect(isRole('SUPERUSER')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('allows finance to review payments but not to edit configuration', () => {
    expect(roleHasPermission('FINANCE', 'payment:review')).toBe(true);
    expect(roleHasPermission('FINANCE', 'config:write')).toBe(false);
  });

  it('allows attendance staff to scan but not to review payments', () => {
    expect(roleHasPermission('ATTENDANCE', 'attendance:scan')).toBe(true);
    expect(roleHasPermission('ATTENDANCE', 'payment:review')).toBe(false);
  });

  it('gives ADMIN every permission', () => {
    for (const permission of [
      'config:read',
      'config:write',
      'order:read',
      'order:write',
      'payment:review',
      'ticket:read',
      'attendance:scan',
      'report:read',
      'audit:read',
    ] as const) {
      expect(roleHasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('unions permissions across multiple roles', () => {
    const merged = permissionsForRoles(['FINANCE', 'ATTENDANCE']);
    expect(merged).toContain('payment:review');
    expect(merged).toContain('attendance:scan');
    expect(merged).not.toContain('config:write');
  });

  it('returns an empty permission set for no roles', () => {
    expect(permissionsForRoles([])).toEqual([]);
  });
});