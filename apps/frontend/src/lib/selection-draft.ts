/**
 * Client-side draft of an in-progress order selection.
 *
 * This is UX state only. It exists so a customer can move between the selection
 * flow and the checkout page without losing their per-ticket choices. The backend
 * receives it as a *request* and remains the sole validator (AGENTS.md §4).
 */

import type {
  BeverageOption,
  Congregation,
  SouvenirOptionGroup,
  TicketOffer,
} from '@/lib/api';

export interface DraftTicketSelection {
  congregationId: string | null;
  /** Hosiana Early Bird requires a discount code per ticket (BR-TKT-06). */
  discountCode: string;
  /** Mandatory for Presale tickets (BR-BEN-03). */
  beverageOptionId: string | null;
  /** Mandatory per ticket; keyed by souvenir option group id (BR-SOU-02). */
  souvenirSelections: Record<string, string>;
}

export interface OrderDraft {
  offerId: string;
  offerName: string;
  phaseCode: string;
  quantity: number;
  tickets: DraftTicketSelection[];
  updatedAt: number;
}

export interface DraftCatalogSnapshot {
  congregations: Congregation[];
  beverages: BeverageOption[];
  souvenirGroups: SouvenirOptionGroup[];
}

const DRAFT_KEY = 'hosifest.orderDraft.v1';
const CATALOG_KEY = 'hosifest.catalogSnapshot.v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function createEmptyTickets(count: number): DraftTicketSelection[] {
  return Array.from({ length: Math.max(0, count) }, () => ({
    congregationId: null,
    discountCode: '',
    beverageOptionId: null,
    souvenirSelections: {},
  }));
}

export function loadOrderDraft(): OrderDraft | null {
  if (!isBrowser()) return null;
  const draft = safeParse<OrderDraft>(window.localStorage.getItem(DRAFT_KEY));
  if (!draft || !Array.isArray(draft.tickets)) return null;
  return draft;
}

export function saveOrderDraft(draft: OrderDraft): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: Date.now() }),
    );
  } catch {
    // Storage full or blocked (private mode): the checkout page handles a
    // missing draft gracefully.
  }
}

export function clearOrderDraft(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(DRAFT_KEY);
}

/**
 * Caches the catalogs the selection pages fetched, so the checkout page can render
 * the selection summary without re-fetching. The checkout submission always sends
 * IDs to the backend for authoritative validation regardless of this cache.
 */
export function saveCatalogSnapshot(snapshot: DraftCatalogSnapshot): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CATALOG_KEY, JSON.stringify(snapshot));
  } catch {
    // Non-fatal.
  }
}

export function loadCatalogSnapshot(): DraftCatalogSnapshot | null {
  if (!isBrowser()) return null;
  return safeParse<DraftCatalogSnapshot>(window.localStorage.getItem(CATALOG_KEY));
}

export function clearAllSelectionState(): void {
  clearOrderDraft();
  if (!isBrowser()) return;
  window.localStorage.removeItem(CATALOG_KEY);
}

/**
 * Which mandatory inputs are still missing for a ticket.
 * Used to gate "continue" and to show per-ticket guidance. The backend still
 * re-validates everything on submit.
 */
export function missingTicketInputs(
  ticket: DraftTicketSelection,
  options: {
    requiresCongregation?: boolean | null;
    requiresDiscountCode?: boolean | null;
    requiresBeverageSelection?: boolean | null;
    requiresSouvenirCustomization?: boolean | null;
    isDiscountCongregation?: boolean;
    souvenirGroups?: SouvenirOptionGroup[];
  },
): string[] {
  const missing: string[] = [];

  if (options.requiresCongregation && !ticket.congregationId) {
    missing.push('Select a congregation.');
  }
  if (
    (options.requiresDiscountCode || options.isDiscountCongregation) &&
    !ticket.discountCode.trim()
  ) {
    missing.push('Enter your discount code.');
  }
  if (options.requiresBeverageSelection && !ticket.beverageOptionId) {
    missing.push('Choose one beverage.');
  }

  const groups = options.souvenirGroups ?? [];
  if (options.requiresSouvenirCustomization !== false) {
    for (const group of groups) {
      const required = group.required !== false;
      const min = typeof group.minSelections === 'number' ? group.minSelections : required ? 1 : 0;
      for (let index = 0; index < min; index += 1) {
        if (!ticket.souvenirSelections[group.id]) {
          missing.push(`Choose an option for “${group.name}”.`);
          break;
        }
      }
    }
  }

  return missing;
}

export function ticketIsComplete(
  ticket: DraftTicketSelection,
  options: Parameters<typeof missingTicketInputs>[1],
): boolean {
  return missingTicketInputs(ticket, options).length === 0;
}
