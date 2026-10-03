'use client';

import type { SouvenirOptionGroup } from '@/lib/api';
import { souvenirGroupLimits } from '@/lib/format';
import { cn } from '@/components/ui/cn';

export interface SouvenirCustomizerProps {
  groups: SouvenirOptionGroup[];
  /** Keyed by option group id. One choice per group for MVP. */
  selections: Record<string, string>;
  onChange: (groupId: string, optionId: string) => void;
  disabled?: boolean;
  idPrefix: string;
}

/**
 * Per-ticket souvenir customization (BR-SOU-01/02/03).
 *
 * Every ticket gets exactly one custom canvas keychain and customization is
 * mandatory, so groups marked required by the backend must all be answered before
 * the flow can continue. Groups and options come from the API — no charm type or
 * letter set is hardcoded.
 */
export function SouvenirCustomizer({
  groups,
  selections,
  onChange,
  disabled,
  idPrefix,
}: SouvenirCustomizerProps) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        ⚠ The souvenir options are currently unavailable. Please contact the
        committee before continuing.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => {
        const limits = souvenirGroupLimits(group);
        const name = `${idPrefix}-souvenir-${group.id}`;
        const selected = selections[group.id];
        const options = group.options ?? [];

        return (
          <fieldset key={group.id} disabled={disabled} className="border-0 p-0">
            <legend className="mb-1 text-sm font-semibold text-ink-800">
              {group.name}
              {limits.min > 0 ? (
                <span className="text-red-700"> *</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-ink-500">(optional)</span>
              )}
            </legend>

            {group.description ? (
              <p className="mb-2 text-xs text-ink-600">{group.description}</p>
            ) : null}

            {options.length === 0 ? (
              <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠ No options are currently available for “{group.name}”.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const inputId = `${name}-${option.id}`;
                  const checked = selected === option.id;
                  return (
                    <label
                      key={option.id}
                      htmlFor={inputId}
                      className={cn(
                        'inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold',
                        checked
                          ? 'border-brand-700 bg-brand-700 text-white'
                          : 'border-ink-300 bg-white text-ink-800 hover:bg-ink-50',
                      )}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={name}
                        value={option.id}
                        checked={checked}
                        onChange={() => onChange(group.id, option.id)}
                        className="sr-only"
                      />
                      <span aria-hidden="true">{checked ? '✓' : '+'}</span>
                      <span>{option.name}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {limits.min > 0 && !selected ? (
              <p className="mt-2 text-xs font-semibold text-amber-800">
                ⚠ Required: choose {limits.min === 1 ? 'an option' : `${limits.min} options`}{' '}
                for this ticket.
              </p>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}
