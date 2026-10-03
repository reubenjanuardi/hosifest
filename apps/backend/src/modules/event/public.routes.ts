import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseOrThrow, sendData } from '../../core/response.js';
import type { Container } from '../container.js';

const slugParams = z.object({ slug: z.string().min(1).max(200) });

/**
 * Public catalogue endpoints (16-api-specification.md section 2).
 * All content is read from configuration; nothing is hardcoded here.
 */
export function publicEventRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    const { sales, catalog } = container;

    app.get('/events/:slug', async (request, reply) => {
      const { slug } = parseOrThrow(slugParams, request.params);
      return sendData(reply, await sales.getEvent(slug));
    });

    app.get('/events/:slug/sales-phases', async (request, reply) => {
      const { slug } = parseOrThrow(slugParams, request.params);
      const eventId = await sales.requireEventBySlug(slug);
      return sendData(reply, await sales.listSalesPhases(eventId));
    });

    app.get('/events/:slug/ticket-offers', async (request, reply) => {
      const { slug } = parseOrThrow(slugParams, request.params);
      const eventId = await sales.requireEventBySlug(slug);
      return sendData(reply, await sales.listTicketOffers(eventId));
    });

    app.get('/events/:slug/congregations', async (request, reply) => {
      parseOrThrow(slugParams, request.params);
      return sendData(reply, await sales.listCongregations());
    });

    app.get('/events/:slug/beverage-options', async (request, reply) => {
      parseOrThrow(slugParams, request.params);
      return sendData(reply, await catalog.listBeverageOptions());
    });

    app.get('/events/:slug/souvenir-option-groups', async (request, reply) => {
      parseOrThrow(slugParams, request.params);
      return sendData(reply, await catalog.listSouvenirOptionGroups());
    });
  };
}