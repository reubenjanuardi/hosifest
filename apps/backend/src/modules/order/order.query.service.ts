import { AppError } from '../../core/errors.js';
import type { Database } from '../../db/database.js';
import { lockOrderByNumber } from '../../db/locks.js';
import type { OrderItemRow, OrderRow, PaymentRow } from '../../db/types.js';
import type { ExpiryService } from './order.expiry.service.js';

export interface OrderTicketView {
  order_item_id: string;
  ticket_code: string;
  status: string;
  holder_name_snapshot: string;
  price_snapshot: number;
  discount_snapshot: number;
  congregation_name_snapshot: string | null;
  issued_at: string | null;
}

export interface OrderView {
  order: OrderRow;
  items: (OrderItemRow & { tickets?: OrderTicketView[] })[];
  payments: PaymentRow[];
}

export class OrderQueryService {
  constructor(
    private readonly db: Database,
    private readonly expiry: ExpiryService,
  ) {}

  async getByOrderNumber(orderNumber: string): Promise<OrderView> {
    const order = await this.loadOrder(orderNumber);

    const { rows: items } = await this.db.query<OrderItemRow>(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
      [order.id],
    );

    const { rows: payments } = await this.db.query<PaymentRow>(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at',
      [order.id],
    );

    const { rows: tickets } = await this.db.query<OrderTicketView>(
      `SELECT t.order_item_id, t.ticket_code, t.status, t.holder_name_snapshot,
              t.price_snapshot, t.discount_snapshot, t.congregation_name_snapshot,
              t.issued_at
         FROM tickets t
         JOIN order_items oi ON oi.id = t.order_item_id
        WHERE oi.order_id = $1
        ORDER BY t.ticket_code`,
      [order.id],
    );

    // Attach only the tickets that belong to each order item.
    const ticketsByItem = new Map<string, OrderTicketView[]>();
    for (const ticket of tickets) {
      const bucket = ticketsByItem.get(ticket.order_item_id);
      if (bucket) bucket.push(ticket);
      else ticketsByItem.set(ticket.order_item_id, [ticket]);
    }

    return {
      order,
      items: items.map((item) => ({
        ...item,
        tickets: ticketsByItem.get(item.id) ?? [],
      })),
      payments,
    };
  }

  private async loadOrder(orderNumber: string): Promise<OrderRow> {
    const { rows } = await this.db.query<OrderRow>(
      'SELECT * FROM orders WHERE order_number = $1',
      [orderNumber],
    );
    const order = rows[0];
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'Order not found.', 404, { orderNumber });
    }
    return order;
  }

  /**
   * Payment proof submission. Rejects EXPIRED, CANCELLED and already PAID
   * orders, and lazily expires an overdue WAITING_PAYMENT order (releasing its
   * reservations) instead of accepting a late proof.
   */
  async submitPaymentProof(
    orderNumber: string,
    input: {
      method: string;
      amount: number;
      proofFileKey?: string | undefined;
      reference?: string | undefined;
    },
  ): Promise<{ order: OrderRow; payment: PaymentRow }> {
    // Lazily expire an overdue order in its own transaction FIRST, so the
    // expiry commits even though we then reject this proof with ORDER_EXPIRED.
    // (Expiring inside the payment transaction below would be rolled back by
    // the throw, leaving the order stuck in WAITING_PAYMENT holding quota.)
    await this.db.transaction(async (client) => {
      await lockOrderByNumber(client, orderNumber);
      const { rows } = await client.query<OrderRow>(
        'SELECT * FROM orders WHERE order_number = $1',
        [orderNumber],
      );
      const order = rows[0];
      if (!order) return;
      const isOverdue =
        (order.status === 'WAITING_PAYMENT' || order.status === 'PAYMENT_REVIEW') &&
        order.expires_at !== null &&
        new Date(order.expires_at).getTime() <= Date.now();
      if (isOverdue) {
        await this.expiry.expireWithin(client, order.id);
      }
    });

    return this.db.transaction(async (client) => {
      await lockOrderByNumber(client, orderNumber);

      const { rows } = await client.query<OrderRow>(
        'SELECT * FROM orders WHERE order_number = $1',
        [orderNumber],
      );
      const order = rows[0];
      if (!order) {
        throw new AppError('ORDER_NOT_FOUND', 'Order not found.', 404, { orderNumber });
      }

      if (order.status === 'EXPIRED') {
        throw new AppError('ORDER_EXPIRED', 'The payment window for this order has closed.', 409, {
          orderNumber,
        });
      }
      if (order.status === 'CANCELLED') {
        throw new AppError('ORDER_CANCELLED', 'This order was cancelled and cannot be paid.', 409, {
          orderNumber,
        });
      }
      if (order.status === 'PAID') {
        throw new AppError('ORDER_ALREADY_PAID', 'This order is already paid.', 409, {
          orderNumber,
        });
      }

      const isOverdue =
        order.expires_at !== null && new Date(order.expires_at).getTime() <= Date.now();
      if (isOverdue) {
        // Defensive: the pre-transaction above already expired it, but if the
        // clock crossed between the two transactions, expire inline (same
        // transaction commits implicitly when this throw is NOT used — the
        // status check above will catch it on retry).
        await this.expiry.expireWithin(client, order.id);
        throw new AppError(
          'ORDER_EXPIRED',
          'The payment window for this order has closed.',
          409,
          { orderNumber },
        );
      }

      if (input.amount !== order.total_amount) {
        throw new AppError(
          'PAYMENT_AMOUNT_MISMATCH',
          'Payment amount does not match the order total.',
          422,
          { expected: order.total_amount, received: input.amount },
        );
      }

      const { rows: paymentRows } = await client.query<PaymentRow>(
        `INSERT INTO payments
           (order_id, method, amount, proof_file_key, external_reference,
            status, submitted_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'SUBMITTED', now(), now(), now())
         RETURNING *`,
        [
          order.id,
          input.method,
          input.amount,
          input.proofFileKey ?? null,
          input.reference ?? null,
        ],
      );
      const payment = paymentRows[0];
      if (!payment) throw new AppError('INTERNAL_ERROR', 'Failed to record payment proof.', 500);

      await client.query(
        `UPDATE orders SET status = 'PAYMENT_REVIEW', updated_at = now() WHERE id = $1`,
        [order.id],
      );

      const { rows: updated } = await client.query<OrderRow>(
        'SELECT * FROM orders WHERE id = $1',
        [order.id],
      );
      return { order: updated[0] ?? order, payment };
    });
  }
}