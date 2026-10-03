import type { PoolClient } from 'pg';
import { config } from '../../config/env.js';
import { AppError, generateOrderNumber } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import { lockOfferAllocations, lockTicketOffers } from '../../db/locks.js';
import { aggregateQuotaTargets, applyQuotaChange } from '../../db/quota.js';
import type {
  CongregationRow,
  CustomerRow,
  DiscountCodeRow,
  OfferAllocationRow,
  OrderItemRow,
  OrderRow,
  TicketOfferRow,
} from '../../db/types.js';
import type { CatalogService } from '../catalog/catalog.service.js';
import type { PromotionService } from '../promotion/promotion.service.js';
import type { SalesService } from '../sales/sales.service.js';
import { computeTotals, priceTicket } from './order.pricing.js';
import type { CreateOrderInput } from './order.schema.js';

export interface PreparedTicket {
  offerId: string;
  offerName: string;
  offerCode: string;
  allocationId: string | null;
  unitPrice: number;
  discountAmount: number;
  congregation: CongregationRow | null;
  discount: DiscountCodeRow | null;
  beverageOptionId: string | null;
  beverageSnapshot: Record<string, unknown> | null;
  souvenir: {
    optionGroupId: string;
    optionId: string;
    quantity: number;
    groupSnapshot: Record<string, unknown>;
    optionSnapshot: Record<string, unknown>;
  }[];
}

export interface CreateOrderResult {
  order: OrderRow;
  items: OrderItemRow[];
  totals: { subtotal: number; discount: number; total: number };
}

interface ResolvedContext {
  offer: TicketOfferRow;
  allocation: OfferAllocationRow | null;
}

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly sales: SalesService,
    private readonly promotions: PromotionService,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * POST /orders — the 13 responsibilities from API spec section 3, in order,
   * inside ONE database transaction:
   *
   *   1. resolve active sales phase     -> SalesService.resolveOffer
   *   2. validate ticket offer          -> SalesService.resolveOffer
   *   3. validate offer allocation      -> SalesService.resolveAllocation
   *   4. validate congregation          -> SalesService.validateCongregation
   *   5. validate discount if supplied  -> PromotionService
   *   6. validate discount capacity     -> PromotionService.assertCapacity
   *   7. validate beverage entitlement  -> CatalogService.resolveBeverage
   *   8. validate souvenir rules        -> CatalogService.resolveSouvenirSelections
   *   9. authoritative total            -> order.pricing.computeTotals
   *  10. atomic quota reservation       -> applyQuotaChange (row-locked)
   *  11. atomic discount reservation    -> PromotionService.reserve
   *  12. create order + items
   *  13. expires_at = created_at + 30 minutes
   *
   * Any failure rolls everything back, so a partially reserved order cannot
   * exist.
   */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const eventId = await this.sales.requireEventBySlug(input.eventSlug);
    const now = new Date();

    return this.db.transaction(async (client) => {
      // Steps 1-3. We must know which rows participate before locking, and we
      // lock in a stable order so concurrent checkouts on the same offer queue
      // instead of racing.
      const contexts: ResolvedContext[] = [];
      for (const item of input.items) {
        const { offer } = await this.sales.resolveOffer(client, item.ticketOfferId, now);
        const allocation = await this.sales.resolveAllocation(
          client,
          item.ticketOfferId,
          item.tickets[0]?.congregationId ?? null,
        );
        contexts.push({ offer, allocation });
      }

      await lockTicketOffers(client, contexts.map((entry) => entry.offer.id));
      await lockOfferAllocations(
        client,
        contexts
          .map((entry) => entry.allocation?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );

      // Guest checkout (FR-07): one customer row per order, no account.
      const customer = await this.createCustomer(client, input);

      const prepared: PreparedTicket[] = [];
      const quotaTargets: {
        offerId: string;
        allocationId: string | null;
        quantity: number;
      }[] = [];
      const discountQuantities = new Map<string, number>();

      for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index];
        const context = contexts[index];
        if (!item || !context) continue;
        const { offer, allocation } = context;

        // Purchase limits are per-offer configuration, not constants.
        this.sales.assertPurchaseLimit(offer, item.quantity);

        const needsCongregation = requiresCongregation(allocation);
        const requiresDiscount = allocation?.eligibility_type === 'DISCOUNT_CODE';
        const souvenirRequired = allocation?.requires_souvenir ?? true;
        const beverageDefinition = await this.catalog.mandatoryBeverageBenefit(client, offer.id);

        // Per-ticket selections drive eligibility, benefit and souvenir data
        // (BR-TKT-08). Expand to exactly `quantity` entries.
        const selections = buildSelections(item, item.quantity);

        for (const selection of selections) {
          // Step 4 - congregation eligibility from the configured list.
          let congregation: CongregationRow | null = null;
          if (selection.congregationId) {
            congregation = await this.sales.validateCongregation(client, selection.congregationId);
            this.assertCongregationMatchesAllocation(congregation, allocation, offer.id);
          } else if (needsCongregation) {
            throw new AppError(
              'CONGREGATION_REQUIRED',
              'A congregation must be selected for this offer.',
              422,
              { offerId: offer.id, allocationId: allocation?.id ?? null },
            );
          }

          // Steps 5 + 6 - discount validity and usage capacity (row-locked).
          let discount: DiscountCodeRow | null = null;
          if (selection.discountCode) {
            discount = await this.promotions.validateAndReserve(
              client,
              selection.discountCode,
              offer.id,
              1,
              customer.id,
            );
            discountQuantities.set(discount.id, (discountQuantities.get(discount.id) ?? 0) + 1);
          } else if (requiresDiscount) {
            throw new AppError(
              'INVALID_DISCOUNT_CODE',
              'This offer requires a valid discount code.',
              422,
              { offerId: offer.id, allocationId: allocation?.id ?? null },
            );
          }

          // A DISCOUNT_CODE allocation pins the code; a supplied code that
          // resolves to a different one must not silently be accepted.
          if (discount && allocation?.discount_code_id && discount.id !== allocation.discount_code_id) {
            throw new AppError(
              'INVALID_DISCOUNT_CODE_FOR_OFFER',
              'This discount code cannot be used for the selected offer.',
              422,
              { offerId: offer.id, allocationId: allocation.id },
            );
          }

          // Step 7 - mandatory beverage from the dynamic catalog.
          const beverage = await this.catalog.resolveBeverage(
            client,
            selection.beverageOptionId,
            beverageDefinition,
          );

          // Step 8 - mandatory per-ticket souvenir customization.
          const souvenir = await this.catalog.resolveSouvenirSelections(
            client,
            selection.souvenirSelections,
            souvenirRequired,
          );

          // Step 9 - authoritative price recomputed from configuration. The
          // request schema has no price/total field, so a client-sent total
          // cannot even reach this code.
          const priced = priceTicket(offer.base_price, discount);

          prepared.push({
            offerId: offer.id,
            offerName: offer.name,
            offerCode: offer.code,
            allocationId: allocation?.id ?? null,
            unitPrice: priced.unitPrice,
            discountAmount: priced.discount,
            congregation,
            discount,
            beverageOptionId: beverage?.id ?? null,
            beverageSnapshot: beverage
              ? { id: beverage.id, code: beverage.code, name: beverage.name }
              : null,
            souvenir,
          });

          quotaTargets.push({
            offerId: offer.id,
            allocationId: allocation?.id ?? null,
            quantity: 1,
          });
        }
      }

      // Step 10 - atomic quota reservation, guarded by the UPDATE's WHERE
      // clause so sold + reserved can never exceed quota under concurrency.
      await applyQuotaChange(
        client,
        aggregateQuotaTargets(quotaTargets).map((target) => ({
          ...target,
          reservedDelta: target.quantity,
          soldDelta: 0,
        })),
      );

      // Step 9 (persist) + Step 12.
      const totals = computeTotals(
        prepared.map((ticket) => ({
          unitPrice: ticket.unitPrice,
          discount: ticket.discountAmount,
        })),
      );
      const order = await this.insertOrder(client, eventId, customer.id, totals);
      const items = await this.insertOrderItems(client, order.id, prepared);

      // Step 11 - atomic discount reservation ledger rows.
      for (const [discountCodeId, quantity] of discountQuantities) {
        await this.promotions.reserve(client, discountCodeId, order.id, quantity);
      }

      return { order, items, totals };
    });
  }

  private assertCongregationMatchesAllocation(
    congregation: CongregationRow,
    allocation: OfferAllocationRow | null,
    offerId: string,
  ): void {
    if (!allocation?.congregation_id) return;
    if (congregation.id !== allocation.congregation_id) {
      throw new AppError(
        'CONGREGATION_NOT_ELIGIBLE',
        'Selected congregation is not eligible for this allocation.',
        422,
        { allocationId: allocation.id, congregationId: congregation.id, offerId },
      );
    }
  }

  private async createCustomer(
    client: PoolClient,
    input: CreateOrderInput,
  ): Promise<CustomerRow> {
    const { rows } = await client.query<CustomerRow>(
      `INSERT INTO customers (name, email, phone, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       RETURNING *`,
      [input.customer.name, input.customer.email ?? null, input.customer.phone],
    );
    const customer = rows[0];
    if (!customer) throw new AppError('INTERNAL_ERROR', 'Failed to create customer.', 500);
    return customer;
  }

  /** Step 12 + 13: expires_at = created_at + 30 minutes, set in SQL. */
  private async insertOrder(
    client: PoolClient,
    eventId: string,
    customerId: string,
    totals: { subtotal: number; discount: number; total: number },
  ): Promise<OrderRow> {
    const { rows } = await client.query<OrderRow>(
      `INSERT INTO orders
         (order_number, event_id, customer_id, status, subtotal_amount, discount_amount,
          total_amount, payment_deadline_at, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'WAITING_PAYMENT', $4, $5, $6,
               now() + make_interval(mins => $7), now() + make_interval(mins => $7),
               now(), now())
       RETURNING *`,
      [
        generateOrderNumber(),
        eventId,
        customerId,
        totals.subtotal,
        totals.discount,
        totals.total,
        config.PAYMENT_PROOF_WINDOW_MINUTES,
      ],
    );
    const order = rows[0];
    if (!order) throw new AppError('INTERNAL_ERROR', 'Failed to create order.', 500);
    return order;
  }

  /**
   * One `order_items` row per distinct (offer, allocation, unit price, discount)
   * group. `allocation_id` is a real FK — the quota bucket is therefore
   * recoverable from the row itself rather than only from JSONB.
   */
  private async insertOrderItems(
    client: PoolClient,
    orderId: string,
    prepared: readonly PreparedTicket[],
  ): Promise<OrderItemRow[]> {
    const grouped = new Map<
      string,
      {
        offerId: string;
        name: string;
        offerCode: string;
        allocationId: string | null;
        unitPrice: number;
        discountPerTicket: number;
        tickets: PreparedTicket[];
      }
    >();

    for (const ticket of prepared) {
      const key = `${ticket.offerId}|${ticket.allocationId}|${ticket.unitPrice}|${ticket.discountAmount}`;
      const existing = grouped.get(key);
      if (existing) existing.tickets.push(ticket);
      else {
        grouped.set(key, {
          offerId: ticket.offerId,
          name: ticket.offerName,
          offerCode: ticket.offerCode,
          allocationId: ticket.allocationId,
          unitPrice: ticket.unitPrice,
          discountPerTicket: ticket.discountAmount,
          tickets: [ticket],
        });
      }
    }

    const items: OrderItemRow[] = [];
    for (const group of grouped.values()) {
      const quantity = group.tickets.length;
      // Per-ticket snapshots. Historical meaning survives later catalog edits.
      const metadata = {
        offer_code: group.offerCode,
        tickets: group.tickets.map((ticket, index) => ({
          index,
          congregation_id: ticket.congregation?.id ?? null,
          congregation_name: ticket.congregation?.name ?? null,
          discount_code_id: ticket.discount?.id ?? null,
          discount_code: ticket.discount?.code ?? null,
          beverage_option_id: ticket.beverageOptionId,
          beverage: ticket.beverageSnapshot,
          souvenir_selections: ticket.souvenir,
        })),
      };

      const { rows } = await client.query<OrderItemRow>(
        `INSERT INTO order_items
           (order_id, item_type, ticket_offer_id, product_id, allocation_id, quantity,
            unit_price, discount_amount, subtotal_amount, item_name_snapshot, metadata,
            created_at)
         VALUES ($1, 'TICKET', $2, NULL, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
         RETURNING *`,
        [
          orderId,
          group.offerId,
          group.allocationId,
          quantity,
          group.unitPrice,
          group.discountPerTicket * quantity,
          group.unitPrice * quantity,
          group.name,
          JSON.stringify(metadata),
        ],
      );
      const item = rows[0];
      if (item) items.push(item);
    }
    return items;
  }
}

/**
 * Congregation requirement is configuration driven. The migration constrains
 * `eligibility_type` to FREE | CONGREGATION_LIST | DISCOUNT_CODE, and a
 * CONGREGATION_LIST bucket must carry a congregation_id (enforced by CHECK).
 */
function requiresCongregation(allocation: OfferAllocationRow | null): boolean {
  return allocation?.eligibility_type === 'CONGREGATION_LIST';
}

interface SelectionShape {
  congregationId?: string | null;
  discountCode?: string | null;
  beverageOptionId?: string | null;
  souvenirSelections?: { optionGroupId: string; optionId: string; quantity: number }[];
}

/**
 * Expand the client's per-ticket list to exactly `quantity` entries. Surplus
 * entries are ignored. Missing entries reuse the first ticket's souvenir
 * selection when the offer needs no per-ticket eligibility or benefit data;
 * otherwise they stay empty so the mandatory validators raise a precise error
 * instead of silently dropping data.
 */
export function buildSelections(
  item: { quantity: number; tickets: readonly SelectionShape[] },
  quantity: number,
): SelectionShape[] {
  void item.quantity;
  const supplied = item.tickets.slice(0, quantity);
  const selections: SelectionShape[] = [];

  for (let index = 0; index < quantity; index += 1) {
    const selection = supplied[index];
    if (selection) {
      selections.push(selection);
      continue;
    }
    const fallback = supplied[0];
    const needsPerTicket =
      Boolean(fallback?.discountCode) ||
      Boolean(fallback?.congregationId) ||
      Boolean(fallback?.beverageOptionId);
    selections.push({
      congregationId: needsPerTicket ? null : (fallback?.congregationId ?? null),
      discountCode: null,
      beverageOptionId: null,
      souvenirSelections: fallback?.souvenirSelections,
    });
  }

  return selections;
}