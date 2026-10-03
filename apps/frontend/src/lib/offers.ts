/**
 * Offer visibility and phase grouping helpers.
 *
 * Visibility is decided by the BACKEND (BR-TKT-04, doc 18 §2). These helpers only
 * read the flags the API returns; they never decide that an offer is purchasable.
 */

import type { SalesPhaseCode, TicketOffer } from '@/lib/api';

export const PHASE_ORDER: SalesPhaseCode[] = ['EARLY_BIRD', 'PRESALE', 'NORMAL'];

export interface PhaseGroup {
  code: SalesPhaseCode;
  /** Phase name from backend configuration. Falls back to the code. */
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  /** Backend-reported phase status, shown verbatim. */
  status: string | null;
  offers: TicketOffer[];
}

function truthy(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * True when the backend explicitly says the offer may be shown publicly.
 * An absent flag is treated as "unknown" rather than "allowed".
 */
export function isPubliclyVisible(offer: TicketOffer): boolean | undefined {
  return truthy(offer.isPubliclyVisible);
}

/**
 * Offers safe to render on the PUBLIC ticket listing.
 *
 * Two independent gates, both fail-closed:
 *
 * 1. Early Bird is excluded unconditionally. Doc 18 §2 requires Early Bird to be a
 *    controlled/private offer that is not positioned as broadly public, so it must
 *    never appear in the public listing regardless of what the visibility flag says.
 *    It is reachable only through the restricted route.
 *
 * 2. For every other phase, the offer is listed only if the backend reported
 *    `isPubliclyVisible = true`. If the flag is absent the offer is withheld, because
 *    silence from the backend is not permission to sell.
 */
export function getPubliclyListableOffers(offers: TicketOffer[]): TicketOffer[] {
  return offers.filter((offer) => {
    if (offer.phaseCode === 'EARLY_BIRD') return false;
    return isPubliclyVisible(offer) === true;
  });
}

/**
 * Offers shown on the restricted Early Bird route.
 *
 * The route itself is the access control, so the public visibility flag is not
 * applied here — otherwise an offer the backend flags as "not publicly visible"
 * would be unreachable through the only legitimate entry point.
 *
 * NOTE (contract issue): the API exposes a single visibility flag and no separate
 * "restricted access granted" signal, so this list cannot express "an offer that
 * exists but that this visitor is not yet entitled to see". The backend still
 * re-validates every order.
 */
export function getEarlyBirdOffers(offers: TicketOffer[]): TicketOffer[] {
  return offers.filter((offer) => offer.phaseCode === 'EARLY_BIRD');
}

export function getOffersForPhase(
  offers: TicketOffer[],
  phaseCode: SalesPhaseCode,
): TicketOffer[] {
  return getPubliclyListableOffers(offers).filter(
    (offer) => offer.phaseCode === phaseCode,
  );
}

/** Groups API offers into the three documented phase sections. */
export function groupOffersByPhase(
  offers: TicketOffer[],
  phases: {
    code: SalesPhaseCode;
    name?: string | null;
    description?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
    status?: string | null;
  }[],
): PhaseGroup[] {
  const listable = getPubliclyListableOffers(offers);

  return PHASE_ORDER.map((code) => {
    const phase = phases.find((candidate) => candidate.code === code);
    return {
      code,
      name: phase?.name ?? code,
      description: phase?.description ?? null,
      startsAt: phase?.startsAt ?? null,
      endsAt: phase?.endsAt ?? null,
      status: phase?.status ?? null,
      offers: listable.filter((offer) => offer.phaseCode === code),
    };
  });
}

/** Sells-out / unavailable label driven purely by backend-reported quota. */
export function describeAvailability(offer: TicketOffer): {
  label: string;
  isAvailable: boolean;
} {
  const remaining = typeof offer.quotaRemaining === 'number' ? offer.quotaRemaining : null;
  const maxPerOrder = typeof offer.maxPerOrder === 'number' ? offer.maxPerOrder : null;

  if (remaining === 0) {
    return { label: 'Sold out', isAvailable: false };
  }
  if (remaining !== null && remaining <= (maxPerOrder ?? 1) * 2) {
    return {
      label: `Only ${remaining} left`,
      isAvailable: true,
    };
  }
  if (remaining !== null) {
    return { label: `${remaining} available`, isAvailable: true };
  }
  return { label: 'Availability shown at checkout', isAvailable: true };
}

/** Earliest valid upper bound for the quantity stepper, from backend config. */
export function maxSelectableQuantity(offer: TicketOffer): number {
  const maxPerOrder = typeof offer.maxPerOrder === 'number' ? offer.maxPerOrder : null;
  const remaining =
    typeof offer.quotaRemaining === 'number' ? offer.quotaRemaining : null;

  if (maxPerOrder !== null && remaining !== null) {
    return Math.max(0, Math.min(maxPerOrder, remaining));
  }
  if (maxPerOrder !== null) return Math.max(0, maxPerOrder);
  if (remaining !== null) return Math.max(0, remaining);
  return 10;
}

