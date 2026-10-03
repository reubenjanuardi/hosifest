import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import { sha256 } from '../../core/crypto.js';
import type { Database } from '../../db/database.js';
import { lockTicket } from '../../db/locks.js';
import type { AttendanceSessionRow, TicketRow } from '../../db/types.js';

export interface AttendanceResult {
  status: 'CHECKED_IN' | 'CHECKED_OUT';
  sessionId: string;
  ticketCode: string;
  holderName: string;
  entryAt: string;
  exitAt?: string;
  reentryCount: number;
}

export interface ScanContext {
  actorUserId: string;
  requestId?: string | null;
  gate?: string | null;
  scanMode?: 'QR' | 'MANUAL_CODE' | 'MANUAL_OVERRIDE';
}

type Lookup = { ticketCode: string } | { qrToken: string };

/** Only an ISSUED ticket admits the holder; VOID/EXPIRED/USED do not. */
const ADMISSIBLE_STATUSES = new Set(['ISSUED']);

export class AttendanceService {
  constructor(private readonly db: Database) {}

  /** BR-ATT-07: manual lookup by ticket code for event-day fallback. */
  async search(query: string, limit = 20) {
    const pattern = `%${query.trim()}%`;
    const { rows } = await this.db.query(
      `SELECT t.ticket_code, t.status, t.holder_name_snapshot,
              t.congregation_name_snapshot, o.name AS offer_name,
              (SELECT count(*) FROM attendance_sessions s WHERE s.ticket_id = t.id) AS session_count,
              (SELECT max(s.entry_at) FROM attendance_sessions s WHERE s.ticket_id = t.id) AS last_entry_at,
              EXISTS (SELECT 1 FROM attendance_sessions s
                       WHERE s.ticket_id = t.id AND s.exit_at IS NULL) AS is_inside
         FROM tickets t
         JOIN ticket_offers o ON o.id = t.ticket_offer_id
        WHERE t.ticket_code ILIKE $1 OR t.holder_name_snapshot ILIKE $1
        ORDER BY t.ticket_code
        LIMIT $2`,
      [pattern, limit],
    );
    return rows;
  }

  /**
   * ENTRY (BR-ATT-01, BR-ATT-09, AC-ATT-05).
   * - Invalid ticket: reject, do NOT change state (BR-ATT-08)
   * - Already inside: ALREADY_INSIDE, no second active session
   * - Otherwise create a new session (re-entry after an EXIT is allowed)
   *
   * The partial unique index `one_active_attendance_session` is the final
   * database-level guarantee of a single open session per ticket.
   */
  async entry(lookup: Lookup, context: ScanContext): Promise<AttendanceResult> {
    return this.db.transaction(async (client) => {
      const ticket = await this.resolveTicket(client, lookup);
      await lockTicket(client, ticket.id);

      const active = await this.activeSession(client, ticket.id);
      if (active) {
        throw new AppError('ALREADY_INSIDE', 'This ticket is already checked in.', 409, {
          ticketCode: ticket.ticket_code,
          sessionId: active.id,
          entryAt: active.entry_at,
        });
      }

      const { rows } = await client.query<AttendanceSessionRow>(
        `INSERT INTO attendance_sessions
           (ticket_id, event_id, entry_at, entry_scanned_by, entry_gate,
            scan_mode, created_at, updated_at)
         VALUES ($1, $2, now(), $3, $4, $5, now(), now())
         RETURNING *`,
        [
          ticket.id,
          ticket.event_id,
          context.actorUserId,
          context.gate ?? null,
          context.scanMode ?? 'QR',
        ],
      );
      const session = rows[0];
      if (!session) {
        throw new AppError('INTERNAL_ERROR', 'Failed to create attendance session.', 500);
      }

      const { rows: prior } = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM attendance_sessions WHERE ticket_id = $1',
        [ticket.id],
      );

      return {
        status: 'CHECKED_IN',
        sessionId: session.id,
        ticketCode: ticket.ticket_code,
        holderName: ticket.holder_name_snapshot,
        entryAt: session.entry_at,
        reentryCount: Math.max(0, (prior[0]?.count ?? 1) - 1),
      };
    });
  }

  /**
   * EXIT (BR-ATT-03, BR-ATT-10, AC-ATT-06).
   * - Already outside: ALREADY_OUTSIDE, no exit written
   * - Otherwise close the active session, freeing the slot for a later ENTRY.
   */
  async exit(lookup: Lookup, context: ScanContext): Promise<AttendanceResult> {
    return this.db.transaction(async (client) => {
      const ticket = await this.resolveTicket(client, lookup);
      await lockTicket(client, ticket.id);

      const active = await this.activeSession(client, ticket.id);
      if (!active) {
        throw new AppError('ALREADY_OUTSIDE', 'This ticket is not currently checked in.', 409, {
          ticketCode: ticket.ticket_code,
        });
      }

      const { rows } = await client.query<AttendanceSessionRow>(
        `UPDATE attendance_sessions
            SET exit_at = now(), exit_scanned_by = $2, exit_gate = $3, updated_at = now()
          WHERE id = $1 AND exit_at IS NULL
          RETURNING *`,
        [active.id, context.actorUserId, context.gate ?? null],
      );
      const session = rows[0];
      if (!session) {
        throw new AppError('ALREADY_OUTSIDE', 'This ticket is not currently checked in.', 409, {
          ticketCode: ticket.ticket_code,
        });
      }

      const { rows: prior } = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM attendance_sessions WHERE ticket_id = $1',
        [ticket.id],
      );

      return {
        status: 'CHECKED_OUT',
        sessionId: session.id,
        ticketCode: ticket.ticket_code,
        holderName: ticket.holder_name_snapshot,
        entryAt: session.entry_at,
        exitAt: session.exit_at ?? undefined,
        reentryCount: Math.max(0, (prior[0]?.count ?? 1) - 1),
      };
    });
  }

  /**
   * Resolve a scan to a ticket. Invalid input raises INVALID_TICKET and the
   * route logs the attempt. Attendance state is untouched in every failure
   * path because nothing has been written yet.
   */
  private async resolveTicket(client: PoolClient, lookup: Lookup): Promise<TicketRow & { event_id: string }> {
    const byCode = 'ticketCode' in lookup ? lookup.ticketCode.trim() : null;
    const byToken = 'qrToken' in lookup ? lookup.qrToken.trim() : null;

    let rows: (TicketRow & { event_id: string })[] = [];
    if (byToken) {
      const { rows: tokenRows } = await client.query<TicketRow & { event_id: string }>(
        `SELECT t.*, ord.event_id
           FROM tickets t
           JOIN order_items oi ON oi.id = t.order_item_id
           JOIN orders ord ON ord.id = oi.order_id
          WHERE t.qr_token_hash = $1`,
        [sha256(byToken)],
      );
      rows = tokenRows;
    } else if (byCode) {
      const { rows: codeRows } = await client.query<TicketRow & { event_id: string }>(
        `SELECT t.*, ord.event_id
           FROM tickets t
           JOIN order_items oi ON oi.id = t.order_item_id
           JOIN orders ord ON ord.id = oi.order_id
          WHERE upper(t.ticket_code) = upper($1)`,
        [byCode],
      );
      rows = codeRows;
    }

    const ticket = rows[0];
    if (!ticket) {
      // The raw token is never echoed back.
      throw new AppError('INVALID_TICKET', 'Ticket is not valid.', 404, {
        hint: byToken ? 'QR token not recognised.' : 'Ticket code not recognised.',
      });
    }
    if (!ADMISSIBLE_STATUSES.has(ticket.status)) {
      throw new AppError(
        'TICKET_NOT_VALID',
        `This ticket is ${ticket.status.toLowerCase()} and cannot be used.`,
        409,
        { ticketCode: ticket.ticket_code, status: ticket.status },
      );
    }
    return ticket;
  }

  private async activeSession(
    client: PoolClient,
    ticketId: string,
  ): Promise<AttendanceSessionRow | null> {
    const { rows } = await client.query<AttendanceSessionRow>(
      `SELECT * FROM attendance_sessions
        WHERE ticket_id = $1 AND exit_at IS NULL
        LIMIT 1`,
      [ticketId],
    );
    return rows[0] ?? null;
  }

  /** AC-ATT-08: sessions are the auditable record of every scan. */
  async sessionsForTicket(ticketId: string) {
    const { rows } = await this.db.query(
      `SELECT id, entry_at, exit_at, entry_scanned_by, exit_scanned_by,
              entry_gate, exit_gate, scan_mode
         FROM attendance_sessions
        WHERE ticket_id = $1
        ORDER BY entry_at`,
      [ticketId],
    );
    return rows;
  }
}