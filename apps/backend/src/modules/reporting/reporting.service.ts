import type { Database } from '../../db/database.js';

/**
 * Reporting (FR-16). Every figure is aggregated in SQL from immutable
 * historical rows, never recomputed from mutable configuration.
 *
 * The migration ships read-only views (`v_offer_capacity`,
 * `v_discount_usage_summary`, `v_ticket_attendance_state`, `v_ticket_lookup`)
 * as the stable read contract for configuration surfaces, so those are used
 * where they exist rather than re-deriving the same maths here.
 */
export class ReportingService {
  constructor(private readonly db: Database) {}

  /** AC-OPS-01: sold vs configured quota per offer (from v_offer_capacity). */
  async sales(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT c.*
         FROM v_offer_capacity c
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1
                  FROM sales_phases sp
                  JOIN events e ON e.id = sp.event_id
                 WHERE sp.id = c.ticket_offer_id AND e.slug = $1))
        ORDER BY c.ticket_offer_code`,
      [eventSlug ?? null],
    );
    return rows;
  }

  /** Per-offer allocation capacity, including the eligibility split. */
  async allocations(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT a.* FROM v_allocation_capacity a
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e
                  JOIN sales_phases sp ON sp.event_id = e.id
                 WHERE sp.id = a.ticket_offer_id AND e.slug = $1))
        ORDER BY a.allocation_code`,
      [eventSlug ?? null],
    );
    return rows;
  }

  async tickets(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT t.ticket_code, t.status, t.price_snapshot, t.discount_snapshot,
              t.effective_price_snapshot, t.congregation_name_snapshot, t.issued_at,
              o.name AS offer_name, l.order_number, l.status AS order_status,
              l.event_id
         FROM tickets t
         JOIN ticket_offers o ON o.id = t.ticket_offer_id
         JOIN v_ticket_lookup l ON l.ticket_id = t.id
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = l.event_id AND e.slug = $1))
        ORDER BY t.ticket_code`,
      [eventSlug ?? null],
    );
    return rows;
  }

  /** AC-OPS-02: payment status breakdown. */
  async payments(eventSlug?: string) {
    const { rows: byStatus } = await this.db.query(
      `SELECT ord.status AS order_status, count(*)::int AS orders,
              COALESCE(SUM(ord.total_amount), 0)::bigint AS amount
         FROM orders ord
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = ord.event_id AND e.slug = $1))
        GROUP BY ord.status
        ORDER BY ord.status`,
      [eventSlug ?? null],
    );
    const { rows: byPayment } = await this.db.query(
      `SELECT p.status AS payment_status, count(*)::int AS payments,
              COALESCE(SUM(p.amount), 0)::bigint AS amount
         FROM payments p
         JOIN orders ord ON ord.id = p.order_id
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = ord.event_id AND e.slug = $1))
        GROUP BY p.status
        ORDER BY p.status`,
      [eventSlug ?? null],
    );
    return { ordersByStatus: byStatus, paymentsByStatus: byPayment };
  }

  /** AC-OPS-03: entry/exit session counts. */
  async attendance(eventSlug?: string) {
    const { rows: summary } = await this.db.query(
      `SELECT count(*)::int AS total_sessions,
              count(*) FILTER (WHERE a.exit_at IS NULL)::int AS currently_inside,
              count(*) FILTER (WHERE a.exit_at IS NOT NULL)::int AS completed_sessions,
              count(DISTINCT a.ticket_id)::int AS tickets_scanned
         FROM attendance_sessions a
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = a.event_id AND e.slug = $1))`,
      [eventSlug ?? null],
    );
    const { rows: detail } = await this.db.query(
      `SELECT s.ticket_code, s.ticket_status, s.attendance_state, s.entry_at,
              count(a.id)::int AS sessions
         FROM v_ticket_attendance_state s
         LEFT JOIN attendance_sessions a ON a.ticket_id = s.ticket_id
        WHERE ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = a.event_id AND e.slug = $1))
        GROUP BY s.ticket_id, s.ticket_code, s.ticket_status, s.attendance_state, s.entry_at
        ORDER BY s.ticket_code`,
      [eventSlug ?? null],
    );
    return { summary: summary[0] ?? {}, tickets: detail };
  }

  /**
   * AC-OPS-04: souvenir production demand aggregated from the frozen
   * `option_snapshot` on paid tickets. Reads the snapshot, not the live
   * catalog, so an admin rename cannot rewrite historical reporting.
   */
  async souvenir(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT ss.option_snapshot->>'name' AS option_name,
              ss.option_snapshot->>'code' AS option_code,
              g.name AS group_name,
              sum(ss.quantity)::int AS quantity
         FROM souvenir_selections ss
         JOIN souvenir_customizations sc ON sc.id = ss.customization_id
         JOIN souvenir_option_groups g ON g.id = ss.option_group_id
         JOIN tickets t ON t.id = sc.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
         JOIN orders ord ON ord.id = oi.order_id
        WHERE ord.status = 'PAID'
          AND sc.status <> 'CANCELLED'
          AND ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = ord.event_id AND e.slug = $1))
        GROUP BY ss.option_snapshot->>'name', ss.option_snapshot->>'code', g.name
        ORDER BY quantity DESC`,
      [eventSlug ?? null],
    );
    return rows;
  }

  /** AC-OPS-05: Presale beverage demand from frozen benefit snapshots. */
  async beverages(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT bs.snapshot->'beverage'->>'name' AS beverage_name,
              bs.snapshot->'beverage'->>'code' AS beverage_code,
              sum(bs.quantity)::int AS quantity
         FROM ticket_benefit_selections bs
         JOIN tickets t ON t.id = bs.ticket_id
         JOIN order_items oi ON oi.id = t.order_item_id
         JOIN orders ord ON ord.id = oi.order_id
        WHERE ord.status = 'PAID'
          AND bs.benefit_type = 'BEVERAGE'
          AND ($1::text IS NULL OR EXISTS (
                SELECT 1 FROM events e WHERE e.id = ord.event_id AND e.slug = $1))
        GROUP BY bs.snapshot->'beverage'->>'name', bs.snapshot->'beverage'->>'code'
        ORDER BY quantity DESC`,
      [eventSlug ?? null],
    );
    return rows;
  }

  /** Discount usage against the configured cap (from v_discount_usage_summary). */
  async discounts(eventSlug?: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM v_discount_usage_summary ORDER BY discount_code`,
      [],
    );
    void eventSlug;
    return rows;
  }
}
