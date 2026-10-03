import type { Metadata } from 'next';
import Link from 'next/link';
import { getEventCatalog } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage() {
  const catalog = await getEventCatalog();

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Contact the committee"
        description="Use these details for questions about eligibility, orders or on-site entry."
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <Card>
          <CardHeader
            title={catalog.event?.name ?? 'HOSIFEST'}
            description="Event information as currently configured."
          />
          <CardBody>
            <dl className="space-y-3 text-ink-800">
              <div>
                <dt className="text-sm font-semibold text-ink-600">Venue</dt>
                <dd className="text-sm">
                  {catalog.event?.venue || 'To be announced'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink-600">Address</dt>
                <dd className="text-sm">
                  {catalog.event?.address || 'To be announced'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-ink-600">Event date</dt>
                <dd className="text-sm">{formatDateTime(catalog.event?.startsAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Before you write" />
          <CardBody className="space-y-3 text-ink-700">
            <p>
              The fastest way to resolve most questions is to check these first — all of
              them are answered by the ticketing system itself:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Current prices, quotas and phase dates:{' '}
                <Link href="/tickets" className="font-semibold text-brand-800 underline underline-offset-4">
                  ticket page
                </Link>
              </li>
              <li>
                Payment status and proof submission:{' '}
                <Link href="/order/lookup" className="font-semibold text-brand-800 underline underline-offset-4">
                  order lookup
                </Link>
              </li>
              <li>
                How payment and entry work:{' '}
                <Link href="/faq" className="font-semibold text-brand-800 underline underline-offset-4">
                  FAQ
                </Link>
              </li>
            </ul>
            <p>
              If an order shows as expired or cancelled, a member of the committee must
              assist — the ticketing system releases the reservation automatically and no
              longer accepts a proof for that order.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
