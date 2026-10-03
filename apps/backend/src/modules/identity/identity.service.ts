import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import type { UserRow } from '../../db/types.js';
import { verifyPassword } from './password.js';
import { isRole, permissionsForRoles, type Permission, type Role } from './rbac.js';
import type { TokenService } from './token.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  permissions: Permission[];
}

const USER_COLUMNS =
  'id, email, full_name, password_hash, status, last_login_at, created_at, updated_at';

export class IdentityService {
  constructor(
    private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly jwtExpiresIn: string,
  ) {}

  async authenticate(
    email: string,
    password: string,
  ): Promise<{ token: string; user: AuthenticatedUser }> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    const user = rows[0];
    // Uniform failure: never reveal whether the account exists.
    if (!user || user.status !== 'ACTIVE' || !verifyPassword(password, user.password_hash)) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password.', 401);
    }

    const roles = await this.rolesForUser(user.id);
    if (roles.length === 0) {
      throw new AppError('FORBIDDEN', 'Account has no assigned role.', 403);
    }

    const token = this.tokens.sign({ sub: user.id, email: user.email, roles }, this.jwtExpiresIn);
    await this.touchLastLogin(user.id);
    return { token, user: this.toAuthenticated(user, roles) };
  }

  async userFromToken(token: string): Promise<AuthenticatedUser> {
    let claims;
    try {
      claims = this.tokens.verify(token);
    } catch {
      throw new AppError('UNAUTHORIZED', 'Invalid or expired access token.', 401);
    }

    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
      [claims.sub],
    );
    const user = rows[0];
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError('UNAUTHORIZED', 'Account is not active.', 401);
    }

    // Roles are re-read on every request so a revocation takes effect
    // immediately instead of waiting for token expiry.
    const roles = await this.rolesForUser(user.id);
    if (roles.length === 0) {
      throw new AppError('FORBIDDEN', 'Account has no assigned role.', 403);
    }
    return this.toAuthenticated(user, roles);
  }

  private async rolesForUser(userId: string): Promise<Role[]> {
    const { rows } = await this.db.query<{ code: string }>(
      `SELECT r.code
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
      [userId],
    );
    return rows.map((row) => row.code).filter(isRole);
  }

  private async touchLastLogin(userId: string): Promise<void> {
    try {
      await this.db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
    } catch {
      // A failed bookkeeping update must not fail an otherwise valid login.
    }
  }

  private toAuthenticated(user: UserRow, roles: Role[]): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      roles,
      permissions: permissionsForRoles(roles),
    };
  }
}

export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  if (!user.permissions.includes(permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission for this operation.', 403, {
      required: permission,
    });
  }
}