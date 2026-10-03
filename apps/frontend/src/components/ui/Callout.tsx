import type { StatusDescriptor } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const TONE_CLASSES: Record<StatusDescriptor['tone'], string> = {
  neutral: 'border-ink-300 bg-ink-50 text-ink-800',
  progress: 'border-brand-300 bg-brand-50 text-brand-900',
  success: 'border-emerald-400 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-400 bg-amber-50 text-amber-900',
  danger: 'border-red-400 bg-red-50 text-red-900',
};

const TONE_ICONS: Record<StatusDescriptor['tone'], string> = {
  neutral: 'ℹ',
  progress: 'ℹ',
  success: '✓',
  warning: '⚠',
  danger: '✕',
};

/** Block-level message with icon + heading, never colour-only. */
export function Callout({
  tone = 'neutral',
  title,
  children,
  className,
  role,
}: {
  tone?: StatusDescriptor['tone'];
  title: string;
  children?: React.ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}) {
  return (
    <div
      role={role}
      className={cn(
        'rounded-lg border-l-4 px-4 py-3',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden="true">{TONE_ICONS[tone]}</span>
        {title}
      </p>
      {children ? <div className="mt-1 text-sm leading-relaxed">{children}</div> : null}
    </div>
  );
}
