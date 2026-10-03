'use client';

import type { Congregation } from '@/lib/api';
import { cn } from '@/components/ui/cn';

export interface CongregationPickerProps {
  congregations: Congregation[];
  value: string | null;
  onChange: (congregationId: string) => void;
  disabled?: boolean;
  idPrefix: string;
}

/**
 * Per-ticket congregation selector (Early Bird eligibility, BR-TKT-05).
 * The list is rendered exactly as returned by the API — no congregation name is
 * hardcoded anywhere in this codebase.
 */
export function CongregationPicker({
  congregations,
  value,
  onChange,
  disabled,
  idPrefix,
}: CongregationPickerProps) {
  const name = `${idPrefix}-congregation`;

  return (
    <fieldset disabled={disabled} className="border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-ink-800">
        Congregation <span className="text-red-700">*</span>
      </legend>

      {congregations.length === 0 ? (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ The congregation list is currently unavailable. Please contact the
          committee before continuing.
        </p>
      ) : (
        <div className={cn('grid gap-2 sm:grid-cols-2', disabled ? 'opacity-60' : '')}>
          {congregations.map((congregation) => {
            const inputId = `${name}-${congregation.id}`;
            const checked = value === congregation.id;
            return (
              <label
                key={congregation.id}
                htmlFor={inputId}
                className={cn(
                  'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2',
                  checked
                    ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                    : 'border-ink-300 bg-white hover:bg-ink-50',
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={name}
                  value={congregation.id}
                  checked={checked}
                  onChange={() => onChange(congregation.id)}
                  className="h-4 w-4 accent-brand-700"
                />
                <span className="text-sm font-medium text-ink-900">
                  {congregation.name}
                </span>
                {congregation.supportsDiscountCode ? (
                  <span className="ml-auto rounded bg-accent-500 px-1.5 py-0.5 text-[11px] font-bold uppercase text-white">
                    Discount
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-600">
        Every Early Bird ticket must record its own congregation. Eligibility is
        verified by the ticketing system when your order is placed.
      </p>
    </fieldset>
  );
}
