import type { StatusDescriptor } from '@/lib/format';
import { cn } from '@/components/ui/cn';

/**
 * Tones always pair colour WITH an icon glyph and a text label, so status is never
 * communicated by colour alone (accessibility requirement in doc 18 §11).
 */
const TONE_CLASSES: Record<StatusDescriptor['tone'], string> = {
  neutral: 'bg-ink-100 text-ink-800 border-ink-300',
  progress: 'bg-brand-50 text-brand-900 border-brand-300',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-400',
  warning: 'bg-amber-50 text-amber-900 border-amber-400',
  danger: 'bg-red-50 text-red-900 border-red-400',
};

const TONE_ICONS: Record<StatusDescriptor['tone'], string> = {
  neutral: '●',
  progress: '◐',
  success: '✓',
  warning: '⚠',
  danger: '✕',
};

export function StatusBadge({
  status,
  size = 'md',
  className,
}: {
  status: StatusDescriptor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const icon = TONE_ICONS[status.tone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border font-bold',
        TONE_CLASSES[status.tone],
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : '',
        size === 'md' ? 'px-3 py-1 text-sm' : '',
        size === 'lg' ? 'px-4 py-2 text-base' : '',
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{status.label}</span>
      <span className="sr-only">. {status.description}</span>
    </span>
  );
}

const PHASE_STYLES: Record<string, string> = {
  EARLY_BIRD: 'bg-accent-500 text-white border-accent-600',
  PRESALE: 'bg-brand-700 text-white border-brand-800',
  NORMAL: 'bg-ink-800 text-white border-ink-900',
};

/** Phase label. The label text itself comes from the backend configuration. */
export function PhaseBadge({
  code,
  name,
  className,
}: {
  code?: string | null;
  name?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        (code && PHASE_STYLES[code]) || 'bg-ink-100 text-ink-800 border-ink-300',
        className,
      )}
    >
      {name || code || 'Phase'}
    </span>
  );
}
