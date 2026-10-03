/**
 * Typed API client for the HOSIFEST backend.
 *
 * Contract source of truth:
 *   - hosifest-system-design/16-api-specification.md
 *   - hosifest-system-design/18-frontend-information-architecture.md
 *
 * EVERY field below that represents a business value (price, quota, phase dates,
 * beverage catalog, souvenir catalog, congregation list, discount codes) is read
 * from the backend at runtime. Nothing here is a seed literal.
 *
 * Backend is authoritative: this client never computes totals, eligibility or
 * entitlement. It only transports what the backend returns.
 */

export const API_BASE_PATH = '/api/v1';

/**
 * Public base URL. Only ever a backend origin / proxy path — never a secret.
 * Read from NEXT_PUBLIC_API_URL at build time.
 */
export const PUBLIC_API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? ''
).replace(/\/+$/, '');

/** Server-side base URL: falls back to the container-internal backend address. */
export const SERVER_API_BASE_URL = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  ''
).replace(/\/+$/, '');

/** The slug of the single HOSIFEST event, per the API contract. */
export const EVENT_SLUG = 'hosifest';

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ApiEnvelope<T> {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: ApiErrorBody | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the backend rejected the request for a business-rule reason. */
  get isBusinessRuleRejection(): boolean {
    return this.status === 409 || this.status === 422 || this.status === 400;
  }
}

/* ------------------------------------------------------------------ */
/* Domain types                                                        */
/* ------------------------------------------------------------------ */

/** The three operational sales phases (BR-TKT-01). Values come from the API. */
export type SalesPhaseCode = 'EARLY_BIRD' | 'PRESALE' | 'NORMAL' | (string & {});

export type OrderStatus =
  | 'WAITING_PAYMENT'
  | 'PAYMENT_REVIEW'
  | 'PAYMENT_SUBMITTED'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED'
  | (string & {});

export type TicketStatus =
  | 'VALID'
  | 'ISSUED'
  | 'VOID'
  | 'USED'
  | (string & {});

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  venue?: string | null;
  address?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
}

export interface SalesPhase {
  id: string;
  code: SalesPhaseCode;
  name: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  /** Availability state decided by the backend, surfaced verbatim. */
  status?: string | null;
  [key: string]: unknown;
}

export interface TicketOffer {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  phaseCode?: SalesPhaseCode | null;
  /** Authoritative, backend-calculated. Displayed as-is; never recomputed here. */
  displayPrice?: number | null;
  currency?: string | null;
  priceLabel?: string | null;
  originalPriceLabel?: string | null;
  /** Quota as reported by the backend. Never used to compute anything locally. */
  quotaTotal?: number | null;
  quotaRemaining?: number | null;
  soldCount?: number | null;
  /** Visibility + restrictedness decided by the backend (BR-TKT-04). */
  isPubliclyVisible?: boolean;
  requiresCongregation?: boolean;
  requiresDiscountCode?: boolean;
  requiresBeverageSelection?: boolean;
  requiresSouvenirCustomization?: boolean;
  maxPerOrder?: number | null;
  benefitSummary?: string | null;
  [key: string]: unknown;
}

export interface Congregation {
  id: string;
  code?: string | null;
  name: string;
  /** Set when a congregation is eligible for a discount (e.g. Hosiana). */
  supportsDiscountCode?: boolean;
  discountHint?: string | null;
  [key: string]: unknown;
}

export interface BeverageOption {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  isAvailable?: boolean;
  displayOrder?: number | null;
  [key: string]: unknown;
}

export interface SouvenirOption {
  id: string;
  groupId?: string | null;
  code?: string | null;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number | null;
  isAvailable?: boolean;
  [key: string]: unknown;
}

export interface SouvenirOptionGroup {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  /** How many options a ticket must pick in this group. From the backend. */
  selectionRule?: string | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  required?: boolean;
  displayOrder?: number | null;
  options?: SouvenirOption[] | null;
  [key: string]: unknown;
}

export interface TicketOrderItemPayload {
  ticketOfferId: string;
  quantity: number;
  tickets: TicketSelectionPayload[];
}

export interface TicketSelectionPayload {
  congregationId?: string | null;
  discountCode?: string | null;
  beverageOptionId?: string | null;
  souvenirSelections: SouvenirSelectionPayload[];
}

export interface SouvenirSelectionPayload {
  optionGroupId: string;
  optionId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  eventSlug: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  items: TicketOrderItemPayload[];
}

export interface OrderTotals {
  subtotal?: number | null;
  discountTotal?: number | null;
  total: number;
  currency?: string | null;
  [key: string]: unknown;
}

export interface OrderTicketView {
  id?: string;
  ticketNumber?: string | null;
  ticketCode?: string | null;
  ticketOfferId?: string | null;
  offerName?: string | null;
  ticketTypeName?: string | null;
  phaseCode?: SalesPhaseCode | null;
  congregationId?: string | null;
  congregationName?: string | null;
  beverageOptionId?: string | null;
  beverageOptionName?: string | null;
  discountCode?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  souvenirSelections?: {
    optionGroupId?: string | null;
    optionGroupName?: string | null;
    optionId?: string | null;
    optionName?: string | null;
    optionCode?: string | null;
    quantity?: number | null;
  }[] | null;
  [key: string]: unknown;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  eventSlug?: string | null;
  eventName?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  items?: OrderTicketView[] | null;
  /** Authoritative totals. Display these; never recompute. */
  totals?: OrderTotals | null;
  total?: number | null;
  currency?: string | null;
  paymentInstructions?: string | null;
  paymentMethods?: PaymentMethodOption[] | null;
  /** ISO-8601. 30-minute payment deadline, set by the backend. */
  expiresAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface PaymentMethodOption {
  code: string;
  name: string;
  instructions?: string | null;
  accountLabel?: string | null;
  accountValue?: string | null;
  [key: string]: unknown;
}

export interface PaymentProofResponse {
  orderNumber?: string;
  status?: OrderStatus;
  acceptedAt?: string | null;
  [key: string]: unknown;
}

export interface TicketView {
  id?: string;
  ticketCode: string;
  status?: TicketStatus | null;
  holderNameSnapshot?: string | null;
  ticketTypeName?: string | null;
  offerName?: string | null;
  phaseCode?: SalesPhaseCode | null;
  congregationName?: string | null;
  beverageOptionName?: string | null;
  event?: EventSummary | null;
  eventName?: string | null;
  /** Rendered as a QR image. Never displayed as plain text. */
  qrToken?: string | null;
  qrImageUrl?: string | null;
  qrPayload?: string | null;
  issuedAt?: string | null;
  [key: string]: unknown;
}

export interface CheckInSearchResult {
  ticketCode?: string;
  holderNameSnapshot?: string | null;
  ticketTypeName?: string | null;
  status?: TicketStatus | null;
  currentlyInside?: boolean | null;
  [key: string]: unknown;
}

export type AttendanceResultStatus =
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'ALREADY_INSIDE'
  | 'ALREADY_OUTSIDE'
  | 'INVALID_TICKET'
  | (string & {});

export interface AttendanceResult {
  status: AttendanceResultStatus;
  sessionId?: string | null;
  ticketCode?: string | null;
  holderNameSnapshot?: string | null;
  ticketTypeName?: string | null;
  message?: string | null;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

type FetchMode = 'server' | 'client';

function buildUrl(path: string, mode: FetchMode): string {
  const base = mode === 'server' ? SERVER_API_BASE_URL : PUBLIC_API_BASE_URL;
  return `${base}${API_BASE_PATH}${path}`;
}

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = `HTTP_${response.status}`;
  let message = `Request failed with status ${response.status}.`;
  let details: Record<string, unknown> | null = null;

  try {
    const body = (await response.json()) as unknown;
    if (isEnvelope(body) && body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? null;
    }
  } catch {
    // Non-JSON error body: keep the status-derived fallback.
  }

  return new ApiError(response.status, code, message, details);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  mode: FetchMode = 'server',
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path, mode), {
      ...init,
      cache: init.cache ?? 'no-store',
    });
  } catch {
    throw new ApiError(
      0,
      'BACKEND_UNREACHABLE',
      'The ticket service is unavailable. Please try again shortly.',
    );
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as unknown;

  if (isEnvelope(body)) {
    if (body.error) {
      throw new ApiError(
        response.status,
        body.error.code ?? 'UNKNOWN_ERROR',
        body.error.message ?? 'The request could not be completed.',
        body.error.details ?? null,
      );
    }
    return body.data as T;
  }

  return body as T;
}

/* ------------------------------------------------------------------ */
/* Event + configuration (public)                                      */
/* ------------------------------------------------------------------ */

export function getEvent(slug = EVENT_SLUG, mode: FetchMode = 'server') {
  return request<EventSummary>(`/events/${slug}`, {}, mode);
}

export function getSalesPhases(slug = EVENT_SLUG, mode: FetchMode = 'server') {
  return request<SalesPhase[]>(`/events/${slug}/sales-phases`, {}, mode);
}

export function getTicketOffers(slug = EVENT_SLUG, mode: FetchMode = 'server') {
  return request<TicketOffer[]>(`/events/${slug}/ticket-offers`, {}, mode);
}

export function getCongregations(slug = EVENT_SLUG, mode: FetchMode = 'server') {
  return request<Congregation[]>(`/events/${slug}/congregations`, {}, mode);
}

export function getBeverageOptions(slug = EVENT_SLUG, mode: FetchMode = 'server') {
  return request<BeverageOption[]>(`/events/${slug}/beverage-options`, {}, mode);
}

export function getSouvenirOptionGroups(
  slug = EVENT_SLUG,
  mode: FetchMode = 'server',
) {
  return request<SouvenirOptionGroup[]>(
    `/events/${slug}/souvenir-option-groups`,
    {},
    mode,
  );
}

export interface EventCatalog {
  event: EventSummary | null;
  phases: SalesPhase[];
  offers: TicketOffer[];
  congregations: Congregation[];
  beverages: BeverageOption[];
  souvenirGroups: SouvenirOptionGroup[];
  /** Errors encountered per slice; the page degrades per-slice, never all-or-nothing. */
  failures: Record<string, string>;
}

/**
 * Loads every catalog slice the public site needs. Each slice is independent so a
 * single unavailable endpoint degrades that section only.
 */
export async function getEventCatalog(slug = EVENT_SLUG): Promise<EventCatalog> {
  const failures: Record<string, string> = {};

  const settle = async <T>(
    key: string,
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      failures[key] =
        error instanceof ApiError ? error.message : 'Unable to load this section.';
      return fallback;
    }
  };

  const [event, phases, offers, congregations, beverages, souvenirGroups] =
    await Promise.all([
      settle('event', () => getEvent(slug), null as EventSummary | null),
      settle('salesPhases', () => getSalesPhases(slug), [] as SalesPhase[]),
      settle('ticketOffers', () => getTicketOffers(slug), [] as TicketOffer[]),
      settle('congregations', () => getCongregations(slug), [] as Congregation[]),
      settle('beverageOptions', () => getBeverageOptions(slug), [] as BeverageOption[]),
      settle(
        'souvenirOptionGroups',
        () => getSouvenirOptionGroups(slug),
        [] as SouvenirOptionGroup[],
      ),
    ]);

  return {
    event,
    phases,
    offers,
    congregations,
    beverages,
    souvenirGroups,
    failures,
  };
}

/* ------------------------------------------------------------------ */
/* Orders (public)                                                     */
/* ------------------------------------------------------------------ */

export async function createOrder(payload: CreateOrderRequest): Promise<Order> {
  return request<Order>(
    '/orders',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    'client',
  );
}

export async function getOrder(orderNumber: string): Promise<Order> {
  return request<Order>(`/orders/${encodeURIComponent(orderNumber)}`);
}

export async function submitPaymentProof(
  orderNumber: string,
  form: FormData,
): Promise<PaymentProofResponse> {
  return request<PaymentProofResponse>(
    `/orders/${encodeURIComponent(orderNumber)}/payment-proof`,
    { method: 'POST', body: form },
    'client',
  );
}

/* ------------------------------------------------------------------ */
/* Tickets (public)                                                    */
/* ------------------------------------------------------------------ */

export async function getTicket(ticketCode: string): Promise<TicketView> {
  return request<TicketView>(`/tickets/${encodeURIComponent(ticketCode)}`);
}

/* ------------------------------------------------------------------ */
/* Attendance (staff surface)                                          */
/* ------------------------------------------------------------------ */

export async function searchTicketForAttendance(
  query: string,
): Promise<CheckInSearchResult[]> {
  return request<CheckInSearchResult[]>(
    `/admin/check-in/search?q=${encodeURIComponent(query)}`,
    {},
    'client',
  );
}

export async function recordAttendance(
  mode: 'entry' | 'exit',
  input: { ticketCode?: string; qrToken?: string },
): Promise<AttendanceResult> {
  return request<AttendanceResult>(
    `/admin/check-in/${mode}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    'client',
  );
}
