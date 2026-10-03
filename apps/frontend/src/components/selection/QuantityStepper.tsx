'use client';

import type { TicketOffer } from '@/lib/api';
import { describeAvailability, maxSelectableQuantity } from '@/lib/offers';

export interface QuantityStepperProps {
  offer: TicketOffer;
  quantity: number;
  onChange: (quantity: number) => void;
  label?: string;
}

/**
 * Quantity selector. The ceiling is derived only from backend-reported limits
 * (maxPerOrder / quotaRemaining) purely as a UX guard — the backend performs the
 * authoritative quota reservation and will reject anything invalid.
 */
export function QuantityStepper({
  offer,
  quantity,
  onChange,
  label = 'How many tickets?',
}: QuantityStepperProps) {
  const max = Math.max(1, maxSelectableQuantity(offer));
  const availability = describeAvailability(offer);
  const disabled = availability.isAvailable === false;

  const set = (next: number) => onChange(Math.min(Math.max(1, next), max));

  return (
    <div>
      <label
        htmlFor="quantity-input"
        className="mb-2 block text-sm font-semibold text-ink-800"
      >
        {label}
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-ink-300 bg-white">
          <button
            type="button"
            onClick={() => set(quantity - 1)}
            disabled={disabled || quantity <= 1}
            aria-label="Decrease quantity"
            className="min-h-[52px] min-w-[52px] rounded-l-lg px-4 text-2xl font-bold text-ink-800 hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
          >
            −
          </button>
          <input
            id="quantity-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={quantity}
            disabled={disabled}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              if (!Number.isNaN(parsed)) set(parsed);
            }}
            className="min-h-[52px] w-16 border-x border-ink-300 text-center text-lg font-bold text-ink-900"
          />
          <button
            type="button"
            onClick={() => set(quantity + 1)}
            disabled={disabled || quantity >= max}
            aria-label="Increase quantity"
            className="min-h-[52px] min-w-[52px] rounded-r-lg px-4 text-2xl font-bold text-ink-800 hover:bg-ink-100 disabled:cursor-not-allowed disabled:text-ink-300"
          >
            +
          </button>
        </div>

        <p className="text-sm text-ink-600">
          {availability.label}
          {offer.maxPerOrder ? ` · up to ${offer.maxPerOrder} per order` : ''}
        </p>
      </div>
    </div>
  );
}
