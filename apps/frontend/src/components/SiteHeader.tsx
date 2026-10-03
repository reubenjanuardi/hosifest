import Link from 'next/link';

/**
 * Public navigation per IA doc 18 §1.
 * "Tickets" is the only purchase entry point.
 */
const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/event', label: 'Event' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/benefits', label: 'Benefits' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-xl font-black tracking-tight text-ink-950">HOSIFEST</span>
          <span className="hidden text-xs font-semibold uppercase tracking-widest text-ink-500 sm:inline">
            Official Ticketing
          </span>
        </Link>

        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-100 hover:text-ink-950"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/order/lookup"
                className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-300 px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ink-100"
              >
                Check order
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
