'use client';

import { useEffect, useRef, useState } from 'react';
import { computeCountdown } from '@/lib/format';

export interface CountdownProps {
  /** Backend-provided deadline. The backend, not this clock, is authoritative. */
  expiresAt: string | null | undefined;
  /** Fires when the local clock passes expiresAt. Use it to refresh server state. */
  onElapsed?: () => void;
  className?: string;
}

/**
 * Live countdown for the payment window (BR-PAY-03/04).
 *
 * Uses the backend's `expiresAt`, not a locally-started timer, so a late page load
 * or a refreshed tab cannot silently extend the window. When it elapses the
 * component reports upward so the page can re-fetch the authoritative status
 * (the backend decides whether the order is EXPIRED or still open).
 */
export function Countdown({ expiresAt, onElapsed, className }: CountdownProps) {
  const [state, setState] = useState(() => computeCountdown(expiresAt));
  const reportedRef = useRef(false);

  useEffect(() => {
    reportedRef.current = false;
    setState(computeCountdown(expiresAt));
  }, [expiresAt]);

  useEffect(() => {
    if (!expiresAt) return;

    const interval = window.setInterval(() => {
      const next = computeCountdown(expiresAt);
      setState(next);

      if (next.isElapsed && !reportedRef.current) {
        reportedRef.current = true;
        onElapsed?.();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiresAt, onElapsed]);

  const urgent = !state.isElapsed && state.remainingMs <= 5 * 60 * 1000;

  if (state.isElapsed) {
    return (
      <p className={className}>
        <span className="font-semibold text-red-800">Payment window closed</span>
        <span className="block text-sm text-ink-700">
          Refreshing the order status from the server…
        </span>
      </p>
    );
  }

  return (
    <p className={className}>
      <span className="text-sm font-medium text-ink-700">Time remaining to pay:</span>{' '}
      <span
        // Announced politely so screen readers get the remaining time without spam.
        aria-live="off"
        className={[
          'font-mono text-2xl font-bold tabular-nums',
          urgent ? 'text-red-800' : 'text-ink-900',
        ].join(' ')}
      >
        {state.label}
      </span>
      <span className="sr-only">
        {state.remainingMinutes} minutes and {state.remainingSeconds} seconds remaining.
      </span>
      {urgent ? (
        <span className="mt-1 block text-sm font-semibold text-red-800">
          ⚠ Under 5 minutes left. Submit your payment proof now.
        </span>
      ) : null}
    </p>
  );
}
