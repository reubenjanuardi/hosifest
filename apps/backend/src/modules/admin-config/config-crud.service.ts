import type { PoolClient } from 'pg';
import type { Database } from '../../db/database.js';
import type { AuditService } from '../audit/audit.service.js';

export interface ResourceDefinition {
  /** Table name; must match the migration exactly. */
  table: string;
  /** Human label used in the audit entity_type. */
  entity: string;
  /** Columns the client may write. Everything else is server controlled. */
  writable: readonly string[];
  /** Columns returned on read. */
  readable: readonly string[];
  /** Human-readable lookup column (code/slug/name). */
  lookupColumn: string;
  orderBy: string;
  /**
   * True when the table has an `active` flag to clear. False when it has no
   * such column, or uses `is_active` (products), or is state-machine driven.
   */
  deactivate: boolean;
}

export interface CrudContext {
  actorUserId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Generic audited CRUD over a configuration table.
 *
 * Every mutation writes an `audit_logs` row inside the SAME transaction as the
 * change, so a mutation cannot commit without its audit record. Note that
 * `audit_logs` has a BEFORE UPDATE OR DELETE trigger that raises, so it is
 * genuinely append-only.
 *
 * Column lists are explicit allowlists, so a client can never write
 * `created_at` or the quota counters (`reserved_quantity`/`sold_quantity`),
 * which are owned by the reservation engine.
 */
export class ConfigCrudService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(resource: ResourceDefinition, filters: Record<string, unknown> = {}) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const [column, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue;
      if (!resource.readable.includes(column)) continue;
      params.push(value);
      clauses.push(`${column} = $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await this.db.query(
      `SELECT ${resource.readable.join(', ')} FROM ${resource.table} ${where} ORDER BY ${resource.orderBy}`,
      params,
    );
    return rows;
  }

  async getById(resource: ResourceDefinition, id: string) {
    const { rows } = await this.db.query(
      `SELECT ${resource.readable.join(', ')} FROM ${resource.table} WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async getByLookup(resource: ResourceDefinition, value: string) {
    const { rows } = await this.db.query(
      `SELECT ${resource.readable.join(', ')} FROM ${resource.table} WHERE ${resource.lookupColumn} = $1`,
      [value],
    );
    return rows[0] ?? null;
  }

  async create(
    resource: ResourceDefinition,
    payload: Record<string, unknown>,
    context: CrudContext,
  ) {
    const columns = resource.writable.filter((column) => payload[column] !== undefined);
    if (columns.length === 0) {
      throw new Error(`No writable fields supplied for ${resource.table}`);
    }
    const values = columns.map((column) => payload[column]);

    return this.db.transaction(async (client) => {
      const placeholders = columns.map((_, index) => `$${index + 1}`);
      const { rows } = await client.query(
        `INSERT INTO ${resource.table} (${columns.join(', ')}, created_at, updated_at)
         VALUES (${placeholders.join(', ')}, now(), now())
         RETURNING ${resource.readable.join(', ')}`,
        values,
      );
      const created = rows[0];
      await this.writeAudit(client, resource, 'CREATED', (created as { id?: string })?.id ?? null, null, created as Record<string, unknown> | undefined, context);
      return created;
    });
  }

  async update(
    resource: ResourceDefinition,
    id: string,
    payload: Record<string, unknown>,
    context: CrudContext,
  ) {
    return this.db.transaction(async (client) => {
      const before = await this.fetchForAudit(client, resource, id);
      const columns = resource.writable.filter((column) => payload[column] !== undefined);
      if (columns.length === 0) return before;

      const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
      const values = columns.map((column) => payload[column]);
      const { rows } = await client.query(
        `UPDATE ${resource.table}
            SET ${assignments.join(', ')}, updated_at = now()
          WHERE id = $1
          RETURNING ${resource.readable.join(', ')}`,
        [id, ...values],
      );
      const updated = rows[0] ?? null;
      await this.writeAudit(client, resource, 'UPDATED', id, before, updated as Record<string, unknown> | null, context);
      return updated;
    });
  }

  /**
   * Deactivation instead of a hard delete, so historical orders keep resolving
   * the configuration they referenced (BR-ADM-04, AC-SOU-06).
   */
  async deactivate(
    resource: ResourceDefinition,
    id: string,
    context: CrudContext,
  ) {
    if (!resource.deactivate) {
      throw new Error(
        `${resource.table} has no active flag; set status/visibility instead of deleting.`,
      );
    }
    return this.db.transaction(async (client) => {
      const before = await this.fetchForAudit(client, resource, id);
      const { rows } = await client.query(
        `UPDATE ${resource.table}
            SET active = FALSE, updated_at = now()
          WHERE id = $1
          RETURNING ${resource.readable.join(', ')}`,
        [id],
      );
      const updated = rows[0] ?? null;
      await this.writeAudit(client, resource, 'DEACTIVATED', id, before, updated as Record<string, unknown> | null, context);
      return updated;
    });
  }

  private writeAudit(
    client: PoolClient,
    resource: ResourceDefinition,
    suffix: string,
    entityId: string | null,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null | undefined,
    context: CrudContext,
  ): Promise<void> {
    return this.audit.record(
      {
        actorUserId: context.actorUserId,
        action: `${resource.entity.toUpperCase()}_${suffix}`,
        entityType: resource.entity,
        entityId,
        before,
        after: after ?? null,
        requestId: context.requestId ?? null,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
      client,
    );
  }

  private async fetchForAudit(
    client: PoolClient,
    resource: ResourceDefinition,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const { rows } = await client.query<Record<string, unknown>>(
      `SELECT ${resource.readable.join(', ')} FROM ${resource.table} WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
}