import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors.js';
import { parseOrThrow, sendData } from '../../core/response.js';
import { authorize, currentUserOrThrow } from '../identity/auth.plugin.js';
import { RESOURCES, type ResourceKey } from './resources.js';
import type { Container } from '../container.js';

const idParams = z.object({ id: z.string().uuid() });

/**
 * Admin configuration CRUD (16-api-specification.md section 7).
 *
 * Every route requires the `config:write` permission and every mutation is
 * audited by ConfigCrudService inside the mutation transaction. Clients write
 * only allowlisted columns; quota counters and timestamps are server owned.
 */
export function adminConfigRoutes(container: Container): FastifyPluginAsync {
  return async (app) => {
    register(app, container, 'events', 'events');
    register(app, container, 'salesPhases', 'sales-phases');
    register(app, container, 'ticketOffers', 'ticket-offers');
    register(app, container, 'offerAllocations', 'offer-allocations');
    register(app, container, 'benefitDefinitions', 'benefit-definitions');
    register(app, container, 'congregations', 'congregations');
    register(app, container, 'discountCodes', 'discount-codes');
    register(app, container, 'beverageOptions', 'beverage-options');
    register(app, container, 'products', 'products');
    register(app, container, 'souvenirOptionGroups', 'souvenir-option-groups');
    register(app, container, 'souvenirOptions', 'souvenir-options');
  };
}

function register(
  app: Parameters<FastifyPluginAsync>[0],
  container: Container,
  key: ResourceKey,
  path: string,
): void {
  const resource = RESOURCES[key];
  const crud = container.config;

  app.get(`/admin/${path}`, async (request, reply) => {
    authorize(request, 'config:read');
    return sendData(reply, await crud.list(resource));
  });

  app.get(`/admin/${path}/:id`, async (request, reply) => {
    authorize(request, 'config:read');
    const { id } = parseOrThrow(idParams, request.params);
    const row = await crud.getById(resource, id);
    if (!row) throw new AppError('NOT_FOUND', `${resource.entity} not found.`, 404, { id });
    return sendData(reply, row);
  });

  app.post(`/admin/${path}`, async (request, reply) => {
    authorize(request, 'config:write');
    const payload = (request.body ?? {}) as Record<string, unknown>;
    const created = await crud.create(resource, payload, crudContext(request));
    return sendData(reply, created, {}, 201);
  });

  app.patch(`/admin/${path}/:id`, async (request, reply) => {
    authorize(request, 'config:write');
    const { id } = parseOrThrow(idParams, request.params);
    const payload = (request.body ?? {}) as Record<string, unknown>;
    const updated = await crud.update(resource, id, payload, crudContext(request));
    if (!updated) throw new AppError('NOT_FOUND', `${resource.entity} not found.`, 404, { id });
    return sendData(reply, updated);
  });

  // Configuration rows are deactivated, never hard deleted, so historical
  // orders keep resolving their referenced configuration (BR-ADM-04).
  app.delete(`/admin/${path}/:id`, async (request, reply) => {
    authorize(request, 'config:write');
    const { id } = parseOrThrow(idParams, request.params);
    const updated = await crud.deactivate(resource, id, crudContext(request));
    if (!updated) throw new AppError('NOT_FOUND', `${resource.entity} not found.`, 404, { id });
    return sendData(reply, updated);
  });
}

function crudContext(request: FastifyRequest) {
  const user = currentUserOrThrow(request);
  return {
    actorUserId: user.id,
    requestId: request.id,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
  };
}