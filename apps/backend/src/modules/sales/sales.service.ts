import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import type {
  CongregationRow,
  OfferAllocationRow,
  SalesPhaseRow,
  TicketOfferRow,
} from '../../db/types.js';

/**
 * The three operational phases are pinned by a CHECK constraint on
 * `sales_phases.code`, so the codes may safely be treated as an enum. Their
 * dates, visibility and status remain configuration.
 */
export const PHASE_CODES = ['EARLY_BIRD', 'PRESALE', 'NORMAL'] as const;
export type PhaseCode = (typeof PHASE_CODES)[number];

export interface OfferContext {
  offer: TicketOfferRow;
  phase: SalesPhaseRow;
  allocation: OfferAllocationRow | null;
}

/** Sellable statuses. SOLD_OUT still resolves; the quota guard rejects it. */
const SELLABLE_OFFER_STATUSES = new Set(['ACTIVE', 'SOLD_OUT']);

function isPhaseUsable(phase: SalesPhaseRow, now: Date): boolean {
  if (phase.status !== 'ACTIVE') return false;
  const start = phase.start_at ? new Date(phase.start_at).getTime() : null;
  const end = phase.end_at ? new Date(phase.end_at).getTime() : null;
  const current = now.getTime();
  // Open-ended boundaries are legal configuration; only explicit windows gate.
  if (start !== null && current < start) return false;
  if (end !== null && current > end) return false;
  return true;
}

function isOfferOnSale(offer: TicketOfferRow, now: Date): boolean {
  if (!SELLABLE_OFFER_STATUSES.has(offer.status)) return false;
  const from = offer.active_from ? new Date(offer.active_from).getTime() : null;
  const until = offer.active_until ? new Date(offer.active_until).getTime() : null;
  const current = now.getTime();
  if (from !== null && current < from) return false;
  if (until !== null && current > until) return false;
  return true;
}

export class SalesService {
  constructor(private readonly db: Database) {}

  async findEventBySlug(slug: string): Promise<{ id: string } | null> {
    const { rows } = await this.db.query<{ id: string }>(
      'SELECT id FROM events WHERE slug = $1',
      [slug],
    );
    return rows[0] ?? null;
  }

  async getEvent(slug: string) {
    const { rows } = await this.db.query(
      `SELECT id, name, slug, description, starts_at, ends_at, venue_name, venue_address,
              status, created_at, updated_at
         FROM events WHERE slug = $1`,
      [slug],
    );
    const row = rows[0];
    if (!row) throw new AppError('EVENT_NOT_FOUND', 'Event not found.', 404, { slug });
    return row;
  }

  async listSalesPhases(eventId: string) {
    const { rows } = await this.db.query(
      `SELECT id, code, name, start_at, end_at, visibility, status, display_order
         FROM sales_phases
        WHERE event_id = $1
        ORDER BY display_order, code`,
      [eventId],
    );
    return rows;
  }

  async listTicketOffers(eventId: string) {
    const { rows } = await this.db.query(
      `SELECT o.id, o.sales_phase_id, o.code, o.name, o.description, o.base_price, o.quota,
              o.reserved_quantity, o.sold_quantity, o.purchase_limit_min,
              o.purchase_limit_max, o.active_from, o.active_until, o.visibility,
              o.sales_channel, o.status, o.sort_order,
              GREATEST(o.quota - o.reserved_quantity - o.sold_quantity, 0) AS available,
              p.code AS phase_code, p.name AS phase_name, p.visibility AS phase_visibility,
              p.status AS phase_status, p.start_at AS phase_start_at, p.end_at AS phase_end_at
         FROM ticket_offers o
         JOIN sales_phases p ON p.id = o.sales_phase_id
        WHERE p.event_id = $1
        ORDER BY p.display_order, o.sort_order, o.code`,
      [eventId],
    );
    return rows;
  }

  async listCongregations() {
    const { rows } = await this.db.query<CongregationRow>(
      `SELECT id, name, code, region, active, display_order
         FROM congregations
        WHERE active = TRUE
        ORDER BY display_order, name`,
    );
    return rows;
  }

  /** Steps 1 + 2: resolve the offer and validate it against its phase. */
  async resolveOffer(
    client: Pick<import('pg').PoolClient, 'query'>,
    offerId: string,
    now: Date,
  ): Promise<OfferContext> {
    const { rows } = await client.query<TicketOfferRow>(
      `SELECT * FROM ticket_offers WHERE id = $1`,
      [offerId],
    );
    const offer = rows[0];
    if (!offer) {
      throw new AppError('OFFER_NOT_AVAILABLE', 'Ticket offer not found.', 404, { offerId });
    }
    if (!isOfferOnSale(offer, now)) {
      throw new AppError('OFFER_NOT_AVAILABLE', 'This ticket offer is not on sale.', 409, {
        offerId,
        status: offer.status,
      });
    }

    const { rows: phaseRows } = await client.query<SalesPhaseRow>(
      'SELECT * FROM sales_phases WHERE id = $1',
      [offer.sales_phase_id],
    );
    const phase = phaseRows[0];
    if (!phase) {
      throw new AppError('SALES_PHASE_NOT_ACTIVE', 'Sales phase is not configured.', 409, {
        offerId,
      });
    }
    if (!isPhaseUsable(phase, now)) {
      throw new AppError(
        'SALES_PHASE_NOT_ACTIVE',
        'This ticket phase is not currently on sale.',
        409,
        { offerId, phase: phase.code, phaseStatus: phase.status },
      );
    }

    return { offer, phase, allocation: null };
  }

  /**
   * Step 3: pick the allocation bucket for this ticket.
   *
   * The bucket is chosen from the offer's ACTIVE allocations, ordered by
   * `sort_order`. A congregation-scoped bucket wins when the customer declared
   * that congregation; otherwise a FREE bucket is used.
   *
   * NOTE: a DISCOUNT_CODE bucket is intentionally NOT auto-selected here. A
   * Hosiana customer must present the code, so auto-picking that bucket would
   * let them bypass the eligibility rule. When the only bucket is
   * DISCOUNT_CODE it is selected and the caller then requires the code.
   */
  async resolveAllocation(
    client: Pick<import('pg').PoolClient, 'query'>,
    offerId: string,
    congregationId: string | null,
  ): Promise<OfferAllocationRow | null> {
    const { rows } = await client.query<OfferAllocationRow>(
      `SELECT * FROM offer_allocations
        WHERE ticket_offer_id = $1 AND status = 'ACTIVE'
        ORDER BY sort_order, created_at`,
      [offerId],
    );
    if (rows.length === 0) return null;
    if (rows.length === 1) return rows[0] ?? null;

    if (congregationId) {
      const scoped = rows.find((row) => row.congregation_id === congregationId);
      if (scoped) return scoped;
    }
    const free = rows.find((row) => row.eligibility_type === 'FREE');
    if (free) return free;

    // No FREE bucket: fall back to the first configured bucket so the caller
    // enforces that bucket's own eligibility rules.
    return rows[0] ?? null;
  }

  /** Step 4: Early Bird congregation eligibility from the configured table. */
  async validateCongregation(
    client: Pick<import('pg').PoolClient, 'query'>,
    congregationId: string,
  ): Promise<CongregationRow> {
    const { rows } = await client.query<CongregationRow>(
      'SELECT * FROM congregations WHERE id = $1 AND active = TRUE',
      [congregationId],
    );
    const congregation = rows[0];
    if (!congregation) {
      throw new AppError(
        'CONGREGATION_NOT_ELIGIBLE',
        'Selected congregation is not an eligible congregation.',
        422,
        { congregationId },
      );
    }
    return congregation;
  }

  /** Purchase limits are per-offer configuration, not constants. */
  assertPurchaseLimit(offer: TicketOfferRow, quantity: number): void {
    const min = offer.purchase_limit_min;
    const max = offer.purchase_limit_max;
    if (typeof min === 'number' && quantity < min) {
      throw new AppError(
        'PURCHASE_LIMIT_EXCEEDED',
        `Minimum purchase for this offer is ${min}.`,
        422,
        { offerId: offer.id, min, requested: quantity },
      );
    }
    if (typeof max === 'number' && quantity > max) {
      throw new AppError(
        'PURCHASE_LIMIT_EXCEEDED',
        `Maximum purchase for this offer is ${max}.`,
        422,
        { offerId: offer.id, max, requested: quantity },
      );
    }
  }

  async requireEventBySlug(slug: string): Promise<string> {
    const event = await this.findEventBySlug(slug);
    if (!event) throw new AppError('EVENT_NOT_FOUND', 'Event not found.', 404, { slug });
    return event.id;
  }
}