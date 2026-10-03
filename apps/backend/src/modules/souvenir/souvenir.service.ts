import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';

/**
 * Souvenir fulfilment (BR-SOU, 10-custom-souvenir-design).
 * The migration constrains `status` to:
 *   DRAFT | CONFIRMED | IN_PRODUCTION | READY | HANDED_OVER | CANCELLED
 * Every transition is validated against the current status so a record can
 * never skip a step, and every advance is audited.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['READY'],
  READY: ['HANDED_OVER'],
  HANDED_OVER: [],
  CANCELLED: [],
};

export const SOUVENIR_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

export class SouvenirService {
  constructor(private readonly db: Database) {}

  async listCustomizations(status?: string, limit = 200) {
    const { rows } = await this.db.query(
      `SELECT sc.id, sc.status, sc.created_at, sc.updated_at,
              t.ticket_code, t.holder_name_snapshot,
              ss.option_group_id, ss.option_id, ss.quantity,
              ss.option_group_snapshot, ss.option_snapshot
         FROM souvenir_customizations sc
         JOIN tickets t ON t.id = sc.ticket_id
         LEFT JOIN souvenir_selections ss ON ss.customization_id = sc.id
        WHERE ($1::text IS NULL OR sc.status = $1)
        ORDER BY t.ticket_code, ss.option_snapshot->>'display_order'
        LIMIT $2`,
      [status ?? null, limit],
    );
    return rows;
  }

  /**
   * Advance the fulfilment state. BR-SOU-09: admin correction after payment
   * requires special permission and an audit log, which is why every move is
   * written to `audit_logs` inside the same transaction.
   */
  async advanceStatus(
    customizationId: string,
    nextStatus: string,
    actorUserId: string,
  ): Promise<{ id: string; status: string }> {
    const target = nextStatus.toUpperCase();
    return this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string; status: string }>(
        'SELECT id, status FROM souvenir_customizations WHERE id = $1 FOR UPDATE',
        [customizationId],
      );
      const current = rows[0];
      if (!current) {
        throw new AppError('NOT_FOUND', 'Souvenir customization not found.', 404, {
          customizationId,
        });
      }
      const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
      if (!allowed.includes(target)) {
        throw new AppError(
          'CONFLICT',
          `Cannot move souvenir from ${current.status} to ${target}.`,
          409,
          { current: current.status, requested: target, allowed },
        );
      }

      const { rows: updated } = await client.query<{ id: string; status: string }>(
        `UPDATE souvenir_customizations
            SET status = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, status`,
        [customizationId, target],
      );
      const result = updated[0];
      if (!result) throw new AppError('INTERNAL_ERROR', 'Failed to update souvenir status.', 500);

      await client.query(
        `INSERT INTO audit_logs
           (actor_user_id, action, entity_type, entity_id, before_data, after_data, created_at)
         VALUES ($1, 'SOUVENIR_STATUS_CHANGED', 'souvenir_customization', $2, $3, $4, now())`,
        [
          actorUserId,
          customizationId,
          JSON.stringify({ status: current.status }),
          JSON.stringify({ status: target }),
        ],
      );
      return result;
    });
  }
}