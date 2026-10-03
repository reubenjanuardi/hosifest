'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-ink-300 disabled:text-ink-600',
  secondary:
    'border border-ink-300 bg-white text-ink-900 hover:bg-ink-100 disabled:text-ink-400',
  ghost: 'text-brand-800 underline underline-offset-4 hover:text-brand-900',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-ink-300',
};

/** Minimum 44px targets: `md` and above stay comfortably clickable on phones. */
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 py-1.5 text-sm',
  md: 'min-h-[44px] px-4 py-2 text-sm',
  lg: 'min-h-[52px] px-6 py-3 text-base',
  xl: 'min-h-[64px] px-8 py-4 text-lg',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * Shared button. Large variants are used on the event-day attendance screen so
 * scanning operators can hit targets reliably.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', fullWidth, className = '', type = 'button', ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={[
          'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
          'transition-colors disabled:cursor-not-allowed',
          VARIANTS[variant],
          SIZES[size],
          fullWidth ? 'w-full' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    );
  },
);
