import Link from 'next/link';
import { getEventCatalog } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { groupOffersByPhase } from '@/lib/offers';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PhaseBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const catalog = await getEventCatalog();
  const phaseGroups = groupOffersByPhase(catalog.offers, catalog.phases);
  const activePhases = catalog.phases.filter(
    (phase) => phase.isActive !== false,
  );

  return (
    <>
      <PageHeader
        eyebrow="Official ticketing"
        title={catalog.event?.name ?? 'HOSIFEST'}
        description={
          <>
            <p>
              {catalog.event?.tagline ??
                'Choose your ticket phase, customise each ticket, and pay securely by QRIS or bank transfer.'}
            </p>
            {catalog.event?.startsAt ? (
              <p className="mt-2 font-semibold text-ink-800">
                {formatDate(catalog.event.startsAt)}
                {catalog.event.venue ? ` · ${catalog.event.venue}` : ''}
              </p>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/tickets"
            className="inline-flex min-h-[52px] items-center rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800"
          >
            View tickets
          </Link>
          <Link
            href="/order/lookup"
            className="inline-flex min-h-[52px] items-center rounded-lg border border-ink-300 bg-white px-6 py-3 font-semibold text-ink-900 hover:bg-ink-100"
          >
            Check an order
          </Link>
        </div>
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        {activePhases.length > 0 ? (
          <section aria-labelledby="phases-heading">
            <h2 id="phases-heading" className="text-2xl font-black tracking-tight text-ink-950">
              Sales phases
            </h2>
            <p className="mt-1 max-w-prose text-ink-700">
              Phase dates and availability are set by the organising committee. Each
              phase shows only the offers the ticketing system has made visible.
            </p>

            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {activePhases.map((phase) => (
                <Card as="li" key={phase.id}>
                  <CardBody className="space-y-2">
                    <PhaseBadge code={phase.code} name={phase.name} />
                    <p className="text-sm text-ink-700">{phase.description}</p>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-ink-500">Opens</dt>
                        <dd className="font-medium text-ink-800">
                          {formatDateTime(phase.startsAt)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-ink-500">Closes</dt>
                        <dd className="font-medium text-ink-800">
                          {formatDateTime(phase.endsAt)}
                        </dd>
                      </div>
                    </dl>
                    {phase.status ? (
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                        Status: {phase.status}
                      </p>
                    ) : null}
                  </CardBody>
                </Card>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="offers-heading">
          <h2 id="offers-heading" className="text-2xl font-black tracking-tight text-ink-950">
            Current offerings
          </h2>

          <div className="mt-5 space-y-4">
            {phaseGroups.map((group) => (
              <Card key={group.code}>
                <CardHeader
                  title={group.name}
                  description={group.description}
                />
                <CardBody>
                  {group.offers.length === 0 ? (
                    <p className="text-sm text-ink-600">
                      No offers are currently visible in this phase.
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {group.offers.map((offer) => (
                        <li
                          key={offer.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 px-4 py-3"
                        >
                          <span className="font-semibold text-ink-900">{offer.name}</span>
                          <span className="font-bold text-brand-800">
                            {offer.priceLabel ?? '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>

          <p className="mt-4 text-sm text-ink-600">
            <Link href="/tickets" className="font-semibold text-brand-800 underline underline-offset-4">
              See the full ticket page
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}

