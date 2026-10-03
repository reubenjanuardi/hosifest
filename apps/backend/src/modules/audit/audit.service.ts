import type { PoolClient } from 'pg';
import type { Database } from '../../db/database.js';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Either an ambient transaction client or the pool itself. */
type Executor = { query: (text: string, params?: readonly unknown[]) => Promise<unknown> };

/**
 * Immutable audit trail. Sensitive admin mutations MUST record before/after.
 * Never store secrets: callers pass business fields only.
 */
export class AuditService {
  constructor(private readonly db: Database) {}

  /** Uses the ambient transaction when one exists, otherwise its own query. */
  async record(input: AuditInput, executor?: Executor): Promise<void> {
    const runner = executor ?? this.db;
    await runner.query(
      `INSERT INTO audit_logs
         (actor_user_id, action, entity_type, entity_id, before_data, after_data,
          request_id, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [
        input.actorUserId ?? null,
        input.action,
        input.entityType,
        input.entityId ?? null,
        input.before ? JSON.stringify(input.before) : null,
        input.after ? JSON.stringify(input.after) : null,
        input.requestId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  }
}