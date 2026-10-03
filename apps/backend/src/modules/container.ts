import type { Env } from '../config/env.js';
import { createDatabase, type Database, type LoggerLike } from '../db/database.js';
import { ConfigCrudService } from '../modules/admin-config/config-crud.service.js';
import { AttendanceService } from '../modules/attendance/attendance.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { CatalogService } from '../modules/catalog/catalog.service.js';
import { IdentityService } from '../modules/identity/identity.service.js';
import { createTokenService } from '../modules/identity/token.js';
import { ExpiryService } from '../modules/order/order.expiry.service.js';
import { OrderQueryService } from '../modules/order/order.query.service.js';
import { OrderService } from '../modules/order/order.service.js';
import { PaymentService } from '../modules/payment/payment.service.js';
import { PromotionService } from '../modules/promotion/promotion.service.js';
import { ReportingService } from '../modules/reporting/reporting.service.js';
import { SalesService } from '../modules/sales/sales.service.js';
import { SouvenirService } from '../modules/souvenir/souvenir.service.js';
import { StorageService } from '../modules/storage/storage.service.js';
import { TicketService } from '../modules/ticketing/ticketing.service.js';

export interface Container {
  env: Env;
  db: Database;
  audit: AuditService;
  identity: IdentityService;
  sales: SalesService;
  promotions: PromotionService;
  catalog: CatalogService;
  orders: OrderService;
  orderQueries: OrderQueryService;
  expiry: ExpiryService;
  payments: PaymentService;
  tickets: TicketService;
  attendance: AttendanceService;
  souvenir: SouvenirService;
  reporting: ReportingService;
  config: ConfigCrudService;
  storage: StorageService;
}

/**
 * Modular monolith composition root. Modules depend on each other through
 * explicit service interfaces, never on Fastify internals, so they stay unit
 * testable without a running server.
 */
export function buildContainer(env: Env, log: LoggerLike): Container {
  const db = createDatabase({ connectionString: env.DATABASE_URL, log });

  const audit = new AuditService(db);
  const identity = new IdentityService(
    db,
    createTokenService(env.JWT_SECRET),
    env.JWT_EXPIRES_IN,
  );
  const sales = new SalesService(db);
  const promotions = new PromotionService();
  const catalog = new CatalogService(db);
  const expiry = new ExpiryService(db, promotions);
  const orders = new OrderService(db, sales, promotions, catalog);
  const orderQueries = new OrderQueryService(db, expiry);
  const tickets = new TicketService(db, audit);
  const payments = new PaymentService(db, promotions, tickets, audit, expiry);
  const attendance = new AttendanceService(db);
  const souvenir = new SouvenirService(db);
  const reporting = new ReportingService(db);
  const config = new ConfigCrudService(db, audit);
  const storage = new StorageService(env);

  return {
    env,
    db,
    audit,
    identity,
    sales,
    promotions,
    catalog,
    orders,
    orderQueries,
    expiry,
    payments,
    tickets,
    attendance,
    souvenir,
    reporting,
    config,
    storage,
  };
}