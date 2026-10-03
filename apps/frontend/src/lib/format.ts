/**
 * Presentation-only helpers.
 *
 * HARD RULE: nothing in this file decides a business outcome. These helpers format
 * backend-returned values and drive UI state (e.g. the payment countdown). The
 * backend remains the authority on whether a window is actually open.
 */

import type { OrderStatus, TicketStatus } from '@/lib/api';

/** Default fallback only when the backend omits a currency. */
const FALLBACK_CURRENCY = 'IDR';

/**
 * Formats a backend-supplied amount. The number is never computed locally — only
 * rendered. Pass-through of the authoritative value is the whole point.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || FALLBACK_CURRENCY,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('id-ID')} ${currency || FALLBACK_CURRENCY}`;
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(parsed);
}

/* ------------------------------------------------------------------ */
/* Countdown                                                           */
/* ------------------------------------------------------------------ */

export interface CountdownState {
  /** Milliseconds left until the backend-declared deadline. Never negative. */
  remainingMs: number;
  /** Whole minutes left, floored. */
  remainingMinutes: number;
  remainingSeconds: number;
  /** True once the client-side clock passes expiresAt. The backend still decides. */
  isElapsed: boolean;
  label: string;
}

/**
 * Derives the countdown display from the backend-provided `expiresAt`.
 * This is display-only. Once elapsed, the UI prompts a status refresh so the
 * authoritative state (EXPIRED vs still open) comes from the server.
 */
export function computeCountdown(expiresAt: string | null | undefined): CountdownState {
  if (!expiresAt) {
    return {
      remainingMs: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      isElapsed: true,
      label: '—',
    };
  }

  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) {
    return {
      remainingMs: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      isElapsed: true,
      label: '—',
    };
  }

  const remainingMs = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const remainingMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  const isElapsed = remainingMs <= 0;

  return {
    remainingMs,
    remainingMinutes,
    remainingSeconds,
    isElapsed,
    label: `${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`,
  };
}

/* ------------------------------------------------------------------ */
/* Status vocabulary                                                   */
/* ------------------------------------------------------------------ */

export interface StatusDescriptor {
  label: string;
  /** Plain-language explanation shown next to the label. Never color-only. */
  description: string;
  tone: 'neutral' | 'progress' | 'success' | 'warning' | 'danger';
}

/**
 * Maps an order status to accessible wording.
 *
 * NOTE: the IA doc and the API spec disagree on the name of the
 * "proof submitted" state (`PAYMENT_SUBMITTED` vs `PAYMENT_REVIEW`). Both are
 * handled so the UI works either way. See CONTRACT ISSUE #1 in the frontend report.
 */
export function describeOrderStatus(status: OrderStatus | string): StatusDescriptor {
  switch (status) {
    case 'WAITING_PAYMENT':
      return {
        label: 'Waiting for payment',
        description: 'Your order is reserved. Submit payment proof before the timer ends.',
        tone: 'progress',
      };
    case 'PAYMENT_REVIEW':
    case 'PAYMENT_SUBMITTED':
      return {
        label: 'Payment proof received',
        description: 'Our team is verifying your payment. E-tickets are issued once approved.',
        tone: 'warning',
      };
    case 'PAID':
      return {
        label: 'Paid — tickets issued',
        description: 'Payment approved. Your e-tickets are ready to view and scan.',
        tone: 'success',
      };
    case 'EXPIRED':
      return {
        label: 'Expired',
        description: 'The payment window closed before proof was received. The reservation was released.',
        tone: 'danger',
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        description: 'This order was cancelled and the reservation released. Please place a new order.',
        tone: 'danger',
      };
    default:
      return {
        label: String(status),
        description: 'Order status.',
        tone: 'neutral',
      };
  }
}

export function describeTicketStatus(status: TicketStatus | string | null | undefined): StatusDescriptor {
  switch (status) {
    case 'VALID':
    case 'ISSUED':
    case 'ACTIVE':
      return {
        label: 'Valid',
        description: 'This ticket is valid for entry and exit.',
        tone: 'success',
      };
    case 'USED':
      return {
        label: 'Used',
        description: 'This ticket has been marked as used.',
        tone: 'neutral',
      };
    case 'VOID':
      return {
        label: 'Void',
        description: 'This ticket is no longer valid for entry.',
        tone: 'danger',
      };
    default:
      return {
        label: status ? String(status) : 'Unknown',
        description: 'Ticket status.',
        tone: 'neutral',
      };
  }
}

/* ------------------------------------------------------------------ */
/* Attendance feedback vocabulary                                      */
/* ------------------------------------------------------------------ */

export function describeAttendanceStatus(status: string): StatusDescriptor & { icon: string } {
  switch (status) {
    case 'CHECKED_IN':
      return {
        label: 'CHECKED IN',
        description: 'Entry recorded. Attendance session is now active.',
        tone: 'success',
        icon: '✓',
      };
    case 'CHECKED_OUT':
      return {
        label: 'CHECKED OUT',
        description: 'Exit recorded. The attendee is now outside; re-entry is allowed.',
        tone: 'progress',
        icon: '→',
      };
    case 'ALREADY_INSIDE':
      return {
        label: 'ALREADY INSIDE',
        description: 'No new session created. This ticket already has an active entry.',
        tone: 'warning',
        icon: '!',
      };
    case 'ALREADY_OUTSIDE':
      return {
        label: 'ALREADY OUTSIDE',
        description: 'No exit recorded. This ticket has no active entry session.',
        tone: 'warning',
        icon: '!',
      };
    case 'INVALID_TICKET':
      return {
        label: 'INVALID TICKET',
        description: 'Rejected. Attendance state was not changed.',
        tone: 'danger',
        icon: '×',
      };
    default:
      return {
        label: status,
        description: 'Attendance result returned by the server.',
        tone: 'neutral',
        icon: '•',
      };
  }
}

/* ------------------------------------------------------------------ */
/* Souvenir helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * How many options a ticket must choose within a group.
 * Read from the backend-provided group configuration; defaults are display-only
 * fallbacks for a group that omits the fields entirely.
 */
export function souvenirGroupLimits(group: {
  minSelections?: number | null;
  maxSelections?: number | null;
  required?: boolean;
}): { min: number; max: number } {
  const min =
    typeof group.minSelections === 'number'
      ? group.minSelections
      : group.required === false
        ? 0
        : 1;
  const max =
    typeof group.maxSelections === 'number' && group.maxSelections > 0
      ? group.maxSelections
      : Math.max(min, 1);
  return { min, max };
}

export function summarizeSouvenirSelections(
  selections: { optionGroupName?: string | null; optionName?: string | null }[] | null | undefined,
): string {
  if (!selections || selections.length === 0) return 'Not set';
  return selections
    .map((selection) =>
      [selection.optionGroupName, selection.optionName].filter(Boolean).join(' · '),
    )
    .join(', ');
}

export function summarizeTicket(
  ticket: {
    offerName?: string | null;
    ticketTypeName?: string | null;
    beverageOptionName?: string | null;
    souvenirSelections?:
      | { optionGroupName?: string | null; optionName?: string | null }[]
      | null;
  },
  index: number,
): string {
  const parts = [ticket.offerName || ticket.ticketTypeName || 'Ticket'];
  if (ticket.beverageOptionName) parts.push(ticket.beverageOptionName);
  const souvenir = summarizeSouvenirSelections(ticket.souvenirSelections);
  if (souvenir !== 'Not set') parts.push(souvenir);
  return `Ticket #${index}: ${parts.join(' — ')}`;
}

/** Normalises a phone number for a light client-side hint only. Not validation. */
export function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '');
}

