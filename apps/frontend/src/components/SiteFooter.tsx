import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-200 bg-ink-950 text-ink-200">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-lg font-black tracking-tight text-white">HOSIFEST</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-300">
              Ticket sales, benefits and e-tickets for the HOSIFEST event. All pricing,
              quotas and eligibility are configured by the organising committee and
              confirmed by the ticketing system at checkout.
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="text-sm font-bold uppercase tracking-widest text-ink-400">
              Explore
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { href: '/event', label: 'Event' },
                { href: '/tickets', label: 'Tickets' },
                { href: '/benefits', label: 'Benefits' },
                { href: '/faq', label: 'FAQ' },
                { href: '/contact', label: 'Contact' },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-ink-200 hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-ink-400">
              Already bought?
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/order/lookup" className="text-ink-200 hover:text-white">
                  Check order status
                </Link>
              </li>
              <li>
                <Link href="/attendance" className="text-ink-200 hover:text-white">
                  Staff attendance scanner
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              Your e-ticket QR works for both entry and exit. Re-entry is allowed.
            </p>
          </div>
        </div>

        <p className="mt-8 border-t border-ink-800 pt-6 text-xs text-ink-400">
          © {new Date().getFullYear()} HOSIFEST. All amounts, quotas and eligibility are
          determined by the ticketing system and may change per current configuration.
        </p>
      </div>
    </footer>
  );
}
