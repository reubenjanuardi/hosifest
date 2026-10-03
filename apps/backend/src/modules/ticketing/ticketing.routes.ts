import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendData } from '../../core/response.js';
import type { Container } from '../container.js';

const ticketParams = z.object({ ticketCode: z.string().min(1).max(80) });

/**
 * GET /tickets/:ticketCode — public e-ticket lookup.
 *
 * The opaque QR token is deliberately NOT returned here. It is only ever
 * returned in the e-ticket payload at issuance time and is stored solely as a
 * SHA-256 hash, so it cannot be recovered (11-security-and-operations.md).
 */
export function ticketRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/tickets/:ticketCode',
      {
        config: {
          rateLimit: {
            max: container.env.RATE_LIMIT_TICKET_MAX,
            timeWindow: container.env.RATE_LIMIT_WINDOW_MS,
          },
        },
      },
      async (request, reply) => {
        const { ticketCode } = parseOrThrow(ticketParams, request.params);
        const ticket = await container.tickets.getByTicketCode(ticketCode);
        return sendData(reply, {
          ticketCode: ticket.ticket_code,
          status: ticket.status,
          holderName: ticket.holder_name_snapshot,
          priceSnapshot: ticket.price_snapshot,
          discountSnapshot: ticket.discount_snapshot,
          congregationName: ticket.congregation_name_snapshot,
          issuedAt: ticket.issued_at,
          offer: { code: ticket.offer_code, name: ticket.offer_name },
          event: {
            name: ticket.event_name,
            slug: ticket.event_slug,
            startsAt: ticket.starts_at,
            venueName: ticket.venue_name,
          },
          attendance: {
            currentlyInside: ticket.active_entry_at !== null,
            activeEntryAt: ticket.active_entry_at,
          },
        });
      },
    );
  };
}