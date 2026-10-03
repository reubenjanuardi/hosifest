import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

export const metadata: Metadata = { title: 'Admin' };

/**
 * Admin hub — navigation placeholder for Wave 1.
 *
 * The IA doc lists the full admin surface (Dashboard, Sales Phases, Ticket Offers,
 * Offer Allocations, Congregations, Orders, Payments, Tickets, Attendance, Beverage
 * Options, Souvenir, Discount Codes, Products, Reports, Users, Audit Logs). These
 * sections are stubbed here only; their screens belong to a later wave, and none of
 * them may hardcode the values they will eventually edit.
 */
const ADMIN_SECTIONS = [
  { label: 'Dashboard', href: null },
  { label: 'Sales Phases', href: null },
  { label: 'Ticket Offers', href: null },
  { label: 'Offer Allocations', href: null },
  { label: 'Congregations', href: null },
  { label: 'Orders', href: null },
  { label: 'Payments', href: null },
  { label: 'Tickets', href: null },
  { label: 'Beverage Options', href: null },
  { label: 'Souvenir', href: null },
  { label: 'Discount Codes', href: null },
  { label: 'Products', href: null },
  { label: 'Reports', href: null },
  { label: 'Users', href: null },
  { label: 'Audit Logs', href: null },
] as const;

export default function AdminPage() {
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Administration"
        description="Configuration and operations for the ticketing system."
      />
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <Callout tone="warning" title="Stub — not implemented in this wave">
          Only navigation is stubbed. These screens must read and write through the
          admin configuration endpoints, and must never hardcode prices, quotas, phase
          dates, catalogs or the congregation list.
        </Callout>

        <Card>
          <CardHeader title="Attendance" description="Available now." />
          <CardBody>
            <Link
              href="/attendance"
              className="inline-flex min-h-[52px] items-center rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800"
            >
              Open attendance scanner
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Planned sections" />
          <CardBody>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ADMIN_SECTIONS.map((section) => (
                <li
                  key={section.label}
                  className="rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-sm font-semibold text-ink-600"
                >
                  {section.label}
                  <span className="block text-xs font-normal text-ink-500">
                    Coming in a later wave
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
