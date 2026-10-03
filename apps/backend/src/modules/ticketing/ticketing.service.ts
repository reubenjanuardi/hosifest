import type { PoolClient } from 'pg';
import { AppError, generateQrToken, generateTicketCode } from '../../core/errors.js';
import { sha256 } from '../../core/crypto.js';
import type { Database } from '../../db/database.js';
import type {
  BenefitDefinitionRow,
  OrderItemRow,
  TicketRow,
} from '../../db/types.js';
import type { AuditService } from '../audit/audit.service.js';

export interface IssuedTicket {
  id: string;
  ticketCode: string;
  /** Raw opaque token, returned ONCE. Only its SHA-256 hash is persisted. */
  qrToken: string;
  sequenceNumber: number;
  holderNameSnapshot: string;
  priceSnapshot: number;
  discountSnapshot: number;
  effectivePriceSnapshot: number;
  congregationNameSnapshot: string | null;
  status: string;
}

export interface TicketSnapshotMeta {
  index: number;
  congregation_id: string | null;
  congregation_name: string | null;
  discount_code_id: string | null;
  discount_code: string | null;
  beverage_option_id: string | null;
  beverage: Record<string, unknown> | null;
  souvenir_selections: {
    optionGroupId: string;
    optionId: string;
    quantity: number;
    groupSnapshot: Record<string, unknown>;
    optionSnapshot: Record<string, unknown>;
  }[];
}

export class TicketService {
  constructor(
    private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issue tickets for a PAID order.
   *
   * Idempotent by construction: if any ticket already exists for the order the
   * existing rows are returned and nothing is inserted. Combined with the
   * conditional status transition in PaymentService, a crash between the status
   * update and the insert cannot produce duplicates on retry.
   */
  async issueForOrder(
    client: PoolClient,
    orderId: string,
    holderName: string,
  ): Promise<IssuedTicket[]> {
    const { rows: items } = await client.query<OrderItemRow>(
      `SELECT * FROM order_items
        WHERE order_id = $1 AND item_type = 'TICKET'
        ORDER BY created_at`,
      [orderId],
    );
    if (items.length === 0) return [];

    const existing = await this.ticketsForOrder(client, orderId);
    if (existing.length > 0) {
      // Already issued. The raw QR token is intentionally NOT recoverable —
      // only the hash is stored.
      return existing.map((ticket) => ({
        id: ticket.id,
        ticketCode: ticket.ticket_code,
        qrToken: '',
        sequenceNumber: ticket.sequence_number,
        holderNameSnapshot: ticket.holder_name_snapshot,
        priceSnapshot: ticket.price_snapshot,
        discountSnapshot: ticket.discount_snapshot,
        effectivePriceSnapshot: ticket.effective_price_snapshot,
        congregationNameSnapshot: ticket.congregation_name_snapshot,
        status: ticket.status,
      }));
    }

    const issued: IssuedTicket[] = [];

    for (const item of items) {
      const metadata = (item.metadata ?? {}) as { tickets?: TicketSnapshotMeta[] };
      const perTicket = metadata.tickets ?? [];
      const discountPerTicket =
        item.quantity > 0 ? Math.floor(item.discount_amount / item.quantity) : 0;

      // Benefit definitions for the offer drive what is recorded per ticket.
      const benefits = await this.offerBenefits(client, item.ticket_offer_id);

      for (let index = 0; index < item.quantity; index += 1) {
        const snapshot = perTicket[index];
        const qrToken = generateQrToken();
        const ticketCode = generateTicketCode();
        const discountSnapshot = discountPerTicket;
        const priceSnapshot = item.unit_price;

        const { rows } = await client.query<TicketRow>(
          `INSERT INTO tickets
             (order_item_id, ticket_offer_id, ticket_code, qr_token_hash, sequence_number,
              holder_name_snapshot, price_snapshot, discount_snapshot,
              effective_price_snapshot, congregation_id, congregation_name_snapshot,
              discount_code_id, allocation_id, status, issued_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   'ISSUED', now(), now(), now())
           RETURNING *`,
          [
            item.id,
            item.ticket_offer_id,
            ticketCode,
            sha256(qrToken),
            index + 1,
            holderName,
            priceSnapshot,
            discountSnapshot,
            // CHECK: effective_price_snapshot = price_snapshot - discount_snapshot
            priceSnapshot - discountSnapshot,
            snapshot?.congregation_id ?? null,
            snapshot?.congregation_name ?? null,
            snapshot?.discount_code_id ?? null,
            item.allocation_id,
          ],
        );
        const ticket = rows[0];
        if (!ticket) throw new AppError('INTERNAL_ERROR', 'Failed to issue ticket.', 500);

        // Exactly one souvenir customization per ticket (BR-SOU-01).
        await this.createSouvenirCustomization(client, ticket.id, snapshot);

        // One benefit selection row per configured benefit definition.
        await this.createBenefitSelections(client, ticket.id, benefits, snapshot);

        issued.push({
          id: ticket.id,
          ticketCode: ticket.ticket_code,
          qrToken,
          sequenceNumber: ticket.sequence_number,
          holderNameSnapshot: ticket.holder_name_snapshot,
          priceSnapshot: ticket.price_snapshot,
          discountSnapshot: ticket.discount_snapshot,
          effectivePriceSnapshot: ticket.effective_price_snapshot,
          congregationNameSnapshot: ticket.congregation_name_snapshot,
          status: ticket.status,
        });
      }
    }

    void this.audit;
    return issued;
  }

  private async offerBenefits(
    client: PoolClient,
    offerId: string | null,
  ): Promise<BenefitDefinitionRow[]> {
    if (!offerId) return [];
    const { rows } = await client.query<BenefitDefinitionRow>(
      `SELECT * FROM benefit_definitions
        WHERE ticket_offer_id = $1
        ORDER BY sort_order, benefit_type`,
      [offerId],
    );
    return rows;
  }

  private async createSouvenirCustomization(
    client: PoolClient,
    ticketId: string,
    snapshot: TicketSnapshotMeta | undefined,
  ): Promise<void> {
    const selections = snapshot?.souvenir_selections ?? [];
    // No selections means the offer does not require a souvenir; do not create
    // an empty customization row.
    if (selections.length === 0) return;

    // CONFIRMED: the order is PAID, so the customization is frozen (BR-SOU-08).
    const { rows: customizationRows } = await client.query<{ id: string }>(
      `INSERT INTO souvenir_customizations (ticket_id, status, created_at, updated_at)
       VALUES ($1, 'CONFIRMED', now(), now())
       RETURNING id`,
      [ticketId],
    );
    const customization = customizationRows[0];
    if (!customization) return;

    for (const selection of selections) {
      await client.query(
        `INSERT INTO souvenir_selections
           (customization_id, option_group_id, option_id, quantity,
            option_group_snapshot, option_snapshot, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now())
         ON CONFLICT (customization_id, option_group_id, option_id) DO NOTHING`,
        [
          customization.id,
          selection.optionGroupId,
          selection.optionId,
          selection.quantity,
          JSON.stringify(selection.groupSnapshot ?? {}),
          JSON.stringify(selection.optionSnapshot ?? {}),
        ],
      );
    }
  }

  /**
   * One `ticket_benefit_selections` row per configured benefit definition.
   * A BEVERAGE row MUST carry a beverage_option_id (table CHECK), which is why
   * a mandatory beverage is validated at order time rather than here.
   */
  private async createBenefitSelections(
    client: PoolClient,
    ticketId: string,
    benefits: readonly BenefitDefinitionRow[],
    snapshot: TicketSnapshotMeta | undefined,
  ): Promise<void> {
    for (const benefit of benefits) {
      const isBeverage = benefit.benefit_type === 'BEVERAGE';
      const beverageOptionId = isBeverage ? (snapshot?.beverage_option_id ?? null) : null;

      if (isBeverage && beverageOptionId === null) continue;

      await client.query(
        `INSERT INTO ticket_benefit_selections
           (ticket_id, benefit_definition_id, benefit_type, beverage_option_id,
            quantity, snapshot, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
         ON CONFLICT (ticket_id, benefit_definition_id) DO NOTHING`,
        [
          ticketId,
          benefit.id,
          benefit.benefit_type,
          beverageOptionId,
          benefit.quantity,
          JSON.stringify({
            benefit_name: benefit.name,
            source_type: benefit.source_type,
            beverage: isBeverage ? (snapshot?.beverage ?? null) : null,
          }),
        ],
      );
    }
  }

  private async ticketsForOrder(client: PoolClient, orderId: string): Promise<TicketRow[]> {
    const { rows } = await client.query<TicketRow>(
      `SELECT t.* FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY oi.created_at, t.sequence_number`,
      [orderId],
    );
    return rows;
  }

  /** Public e-ticket lookup by human ticket code. */
  async getByTicketCode(ticketCode: string) {
    const { rows } = await this.db.query(
      `SELECT t.ticket_code, t.status, t.holder_name_snapshot, t.price_snapshot,
              t.discount_snapshot, t.effective_price_snapshot,
              t.congregation_name_snapshot, t.issued_at,
              o.code AS offer_code, o.name AS offer_name,
              e.name AS event_name, e.slug AS event_slug,
              e.starts_at, e.venue_name,
              (SELECT entry_at FROM attendance_sessions a
                WHERE a.ticket_id = t.id AND a.exit_at IS NULL) AS active_entry_at
         FROM tickets t
         JOIN ticket_offers o ON o.id = t.ticket_offer_id
         JOIN order_items oi ON oi.id = t.order_item_id
         JOIN orders ord ON ord.id = oi.order_id
         JOIN events e ON e.id = ord.event_id
        WHERE upper(t.ticket_code) = upper($1)`,
      [ticketCode],
    );
    const ticket = rows[0];
    if (!ticket) {
      throw new AppError('TICKET_NOT_FOUND', 'Ticket not found.', 404, { ticketCode });
    }
    return ticket;
  }
}