'use client';

import type { BeverageOption } from '@/lib/api';
import { cn } from '@/components/ui/cn';

export interface BeveragePickerProps {
  beverages: BeverageOption[];
  value: string | null;
  onChange: (beverageOptionId: string) => void;
  disabled?: boolean;
  idPrefix: string;
  tumblerNote?: string | null;
}

/**
 * Per-ticket beverage selector for Presale tickets (BR-BEN-03).
 *
 * Exactly one beverage per ticket. The tumbler is an included entitlement of the
 * Presale offer, not a separate customer choice, so it is surfaced as information
 * only. Both the catalog and its contents come from the API.
 */
export function BeveragePicker({
  beverages,
  value,
  onChange,
  disabled,
  idPrefix,
  tumblerNote,
}: BeveragePickerProps) {
  const name = `${idPrefix}-beverage`;

  return (
    <fieldset disabled={disabled} className="border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-ink-800">
        Beverage <span className="text-red-700">*</span>
      </legend>

      {beverages.length === 0 ? (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ The beverage catalogue is currently unavailable. Please contact the
          committee before continuing.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {beverages.map((beverage) => {
            const inputId = `${name}-${beverage.id}`;
            const checked = value === beverage.id;
            return (
              <label
                key={beverage.id}
                htmlFor={inputId}
                className={cn(
                  'flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2',
                  checked
                    ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                    : 'border-ink-300 bg-white hover:bg-ink-50',
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  name={name}
                  value={beverage.id}
                  checked={checked}
                  onChange={() => onChange(beverage.id)}
                  className="h-4 w-4 accent-brand-700"
                />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-ink-900">
                    {beverage.name}
                  </span>
                  {beverage.description ? (
                    <span className="text-xs text-ink-600">{beverage.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">
        <p>
          <strong>Tumbler:</strong> 1 tumbler is included with every Presale ticket —
          no extra selection or charge is needed.
        </p>
        {tumblerNote ? <p className="mt-1">{tumblerNote}</p> : null}
      </div>
    </fieldset>
  );
}
