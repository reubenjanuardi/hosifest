import type { PoolClient } from 'pg';
import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import { lockOrder } from '../../db/locks.js';
import { applyQuotaChange } from '../../db/quota.js';
import type { OrderRow, PaymentRow } from '../../db/types.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ExpiryService } from '../order/order.expiry.service.js';
import { quotaTargetsForOrder } from '../order/order.expiry.service.js';
import type { PromotionService } from '../promotion/promotion.service.js';
import type { TicketService } from '../ticketing/ticketing.service.js';

export interface ApprovalContext {
  actorUserId: string;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ApprovalResult {
  order: OrderRow;
  /** True when this call performed the transition; false on a repeat call. */
  transitioned: boolean;
  issuedTicketCodes: string[];
}

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly promotions: PromotionService,
    private readonly tickets: TicketService,
    private readonly audit: AuditService,
    private readonly expiry: ExpiryService,
  ) {}

  /**
   * IDEMPOTENT APPROVAL (BR-PAY-07, AC-PAY-03).
   *
   * Three independent guards:
   *
   *  1. Row lock + conditional status transition. Inside the transaction we
   *     take `SELECT ... FOR UPDATE` on the order, then attempt
   *     `UPDATE orders SET status='PAID' WHERE id=$1 AND status='PAYMENT_REVIEW'`.
   *     `rowCount === 0` means someone already processed it, so we return the
   *     current state without touching tickets. The row lock makes two
   *     concurrent approvals mutually exclusive; exactly one observes
   *     PAYMENT_REVIEW.
   *  2. The partial unique index `one_approved_payment_per_order` means the
   *     database refuses a second APPROVED payment row for an order.
   *  3. `TicketService.issueForOrder` returns existing tickets instead of
   *     inserting when any exist, so even a crash between the status update and
   *     the insert cannot duplicate tickets on retry.
   */
  async approvePayment(orderId: string, context: ApprovalContext): Promise<ApprovalResult> {
    return this.db.transaction(async (client) => {
      await lockOrder(client, orderId);

      const order = await this.loadOrder(client, orderId);

      // Repeat approval: report the same result, issue nothing.
      if (order.status === 'PAID') {
        return {
          order,
          transitioned: false,
          issuedTicketCodes: await this.existingTicketCodes(client, orderId),
        };
      }
      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        throw new AppError(
          'CONFLICT',
          `Order is ${order.status.toLowerCase()} and cannot be approved.`,
          409,
          { status: order.status },
        );
      }
      if (order.status === 'WAITING_PAYMENT') {
        throw new AppError(
          'CONFLICT',
          'Order has no submitted payment proof to approve.',
          409,
          { status: order.status },
        );
      }
      if (order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
        throw new AppError(
          'ORDER_EXPIRED',
          'The payment window for this order has closed.',
          409,
          { orderNumber: order.order_number },
        );
      }

      // The atomic decision point.
      const { rowCount } = await client.query(
        `UPDATE orders
            SET status = 'PAID', paid_at = now(), updated_at = now()
          WHERE id = $1 AND status = 'PAYMENT_REVIEW'
          RETURNING id`,
        [orderId],
      );
      if (rowCount === 0) {
        const current = await this.loadOrder(client, orderId);
        return {
          order: current,
          transitioned: false,
          issuedTicketCodes: await this.existingTicketCodes(client, orderId),
        };
      }

      const payment = await this.lockPendingPayment(client, orderId);
      if (payment) {
        await client.query(
          `UPDATE payments
              SET status = 'APPROVED', reviewed_at = now(), reviewed_by = $2, updated_at = now()
            WHERE id = $1`,
          [payment.id, context.actorUserId],
        );
      }

      const holder = await this.holderName(client, order.customer_id);
      const issued = await this.tickets.issueForOrder(client, orderId, holder);
      const codes =
        issued.length > 0
          ? issued.map((ticket) => ticket.ticketCode)
          : await this.existingTicketCodes(client, orderId);

      // Reserved capacity becomes sold; the discount ledger is consumed.
      await this.commitQuota(client, orderId);
      await this.promotions.consume(client, orderId);

      // Link each consumed usage unit to its ticket (BR-TKT-06, per ticket).
      await this.linkUsagesToTickets(client, orderId);

      const updated = await this.loadOrder(client, orderId);
      await this.expiry.recordTransition(client, order, 'PAID', 'payment approved', context.actorUserId);
      await this.audit.record(
        {
          actorUserId: context.actorUserId,
          action: 'PAYMENT_APPROVED',
          entityType: 'order',
          entityId: orderId,
          before: { status: order.status, total: order.total_amount },
          after: { status: 'PAID', tickets: codes.length },
          requestId: context.requestId ?? null,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
        client,
      );

      return { order: updated, transitioned: true, issuedTicketCodes: codes };
    });
  }

  /**
   * REJECTION (BR-PAY-05, AC-PAY-04/05/06).
   * Order -> CANCELLED, reserved quota released, discount reservation released,
   * audited. CANCELLED is terminal, so there is no retry path.
   */
  async rejectPayment(
    orderId: string,
    reason: string,
    context: ApprovalContext,
  ): Promise<ApprovalResult> {
    return this.db.transaction(async (client) => {
      await lockOrder(client, orderId);
      const order = await this.loadOrder(client, orderId);

      if (order.status === 'CANCELLED' || order.status === 'EXPIRED') {
        return {
          order,
          transitioned: false,
          issuedTicketCodes: await this.existingTicketCodes(client, orderId),
        };
      }
      if (order.status === 'PAID') {
        throw new AppError(
          'CONFLICT',
          'A paid order cannot be rejected. Use an audited administrative correction instead.',
          409,
          { status: order.status },
        );
      }

      const { rowCount } = await client.query(
        `UPDATE orders
            SET status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2,
                cancel_reason = $3, updated_at = now()
          WHERE id = $1 AND status IN ('WAITING_PAYMENT', 'PAYMENT_REVIEW')
          RETURNING id`,
        [orderId, context.actorUserId, reason],
      );
      if (rowCount === 0) {
        const current = await this.loadOrder(client, orderId);
        return {
          order: current,
          transitioned: false,
          issuedTicketCodes: await this.existingTicketCodes(client, orderId),
        };
      }

      const payment = await this.lockPendingPayment(client, orderId);
      if (payment) {
        await client.query(
          `UPDATE payments
              SET status = 'REJECTED', reviewed_at = now(), reviewed_by = $2,
                  rejection_reason = $3, updated_at = now()
            WHERE id = $1`,
          [payment.id, context.actorUserId, reason],
        );
      } else {
        await client.query(
          `UPDATE payments
              SET status = 'REJECTED', reviewed_at = now(), reviewed_by = $2,
                  rejection_reason = $3, updated_at = now()
            WHERE order_id = $1 AND status NOT IN ('REJECTED', 'APPROVED')`,
          [orderId, context.actorUserId, reason],
        );
      }

      // Release reserved quota and discount reservation.
      const targets = await quotaTargetsForOrder(client, orderId);
      await applyQuotaChange(
        client,
        targets.map((target) => ({
          ...target,
          reservedDelta: -target.quantity,
          soldDelta: 0,
        })),
      );
      await this.promotions.release(client, orderId);

      const updated = await this.loadOrder(client, orderId);
      await this.expiry.recordTransition(
        client,
        order,
        'CANCELLED',
        `payment rejected: ${reason}`,
        context.actorUserId,
      );
      await this.audit.record(
        {
          actorUserId: context.actorUserId,
          action: 'PAYMENT_REJECTED',
          entityType: 'order',
          entityId: orderId,
          before: { status: order.status },
          after: { status: 'CANCELLED', reason },
          requestId: context.requestId ?? null,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
        client,
      );

      return {
        order: updated,
        transitioned: true,
        issuedTicketCodes: await this.existingTicketCodes(client, orderId),
      };
    });
  }

  /** Move reserved capacity into sold. sold + reserved stays <= quota. */
  private async commitQuota(client: PoolClient, orderId: string): Promise<void> {
    const targets = await quotaTargetsForOrder(client, orderId);
    await applyQuotaChange(
      client,
      targets.map((target) => ({
        ...target,
        reservedDelta: -target.quantity,
        soldDelta: target.quantity,
      })),
    );
  }

  /**
   * `discount_usages_one_per_ticket` allows exactly one usage row per ticket.
   * Split the single order-level reservation into per-ticket consumed rows so
   * the ledger matches the "counted per ticket" rule.
   */
  private async linkUsagesToTickets(client: PoolClient, orderId: string): Promise<void> {
    const { rows } = await client.query<{ id: string; ticket_id: string }>(
      `SELECT t.id, t.ticket_id FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1 AND t.discount_code_id IS NOT NULL
        ORDER BY oi.created_at, t.sequence_number`,
      [orderId],
    );
    for (const ticket of rows) {
      await client.query(
        `UPDATE discount_usages
            SET ticket_id = $1, updated_at = now()
          WHERE order_id = $2 AND status = 'CONSUMED' AND ticket_id IS NULL
            AND id = (
              SELECT id FROM discount_usages
               WHERE order_id = $2 AND status = 'CONSUMED' AND ticket_id IS NULL
               ORDER BY created_at
               LIMIT 1
            )`,
        [ticket.ticket_id, orderId],
      );
    }
  }

  private async loadOrder(client: PoolClient, orderId: string): Promise<OrderRow> {
    const { rows } = await client.query<OrderRow>('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order = rows[0];
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found.', 404, { orderId });
    return order;
  }

  private async lockPendingPayment(
    client: PoolClient,
    orderId: string,
  ): Promise<PaymentRow | null> {
    const { rows } = await client.query<PaymentRow>(
      `SELECT * FROM payments
        WHERE order_id = $1 AND status = 'SUBMITTED'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [orderId],
    );
    return rows[0] ?? null;
  }

  private async existingTicketCodes(client: PoolClient, orderId: string): Promise<string[]> {
    const { rows } = await client.query<{ ticket_code: string }>(
      `SELECT t.ticket_code FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY t.ticket_code`,
      [orderId],
    );
    return rows.map((row) => row.ticket_code);
  }

  private async holderName(client: PoolClient, customerId: string): Promise<string> {
    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM customers WHERE id = $1',
      [customerId],
    );
    return rows[0]?.name ?? 'Guest';
  }
}