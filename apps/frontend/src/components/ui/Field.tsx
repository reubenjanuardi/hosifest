'use client';

import { useId } from 'react';
import { cn } from '@/components/ui/cn';

export interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string | null;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  maxLength?: number;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * Accessible text field: real `<label>` association, hint and error wired through
 * `aria-describedby`, and `aria-invalid` when an error is present.
 */
export function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  hint,
  required,
  type = 'text',
  autoComplete,
  inputMode,
  maxLength,
  disabled,
  error,
  className,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-800">
        {label}
        {required ? (
          <span className="ml-1 text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'min-h-[44px] rounded-lg border px-3 py-2 text-base text-ink-900',
          'placeholder:text-ink-400 disabled:bg-ink-100 disabled:text-ink-500',
          error ? 'border-red-600' : 'border-ink-300',
        )}
      />

      {hint ? (
        <p id={hintId} className="text-xs text-ink-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-semibold text-red-800">
          ✕ {error}
        </p>
      ) : null}
    </div>
  );
}
