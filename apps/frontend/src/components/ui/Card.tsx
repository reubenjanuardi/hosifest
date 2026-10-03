import { cn } from '@/components/ui/cn';

type CardTag = 'div' | 'section' | 'article' | 'li';

export interface CardProps {
  as?: CardTag;
  className?: string;
  id?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  children?: React.ReactNode;
}

/**
 * Base surface used for every content block.
 *
 * Props are restricted to the small set this codebase actually uses, which keeps
 * the polymorphic element free of the `onToggle` conflict between div/li typings.
 */
export function Card({ as: Tag = 'div', className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border border-ink-200 bg-white shadow-sm',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  step,
  id,
  className,
}: {
  title: string;
  description?: string | null;
  step?: number | string | null;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-ink-200 px-5 py-4 sm:px-6', className)}>
      <div className="flex items-start gap-3">
        {step !== null && step !== undefined ? (
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white"
          >
            {step}
          </span>
        ) : null}
        <div>
          <h2 id={id} className="text-lg font-bold tracking-tight text-ink-900">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm text-ink-600">{description}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CardBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 py-5 sm:px-6', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border-t border-ink-200 bg-ink-50 px-5 py-4 sm:px-6',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
