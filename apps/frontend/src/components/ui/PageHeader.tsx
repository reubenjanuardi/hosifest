import { cn } from '@/components/ui/cn';

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string | null;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {eyebrow ? (
          <p className="text-sm font-bold uppercase tracking-widest text-brand-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-950 sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <div className="mt-3 max-w-prose text-base text-ink-700">{description}</div>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </header>
  );
}

