import type { Metadata } from 'next';
import Link from 'next/link';
import { getEventCatalog } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PhaseBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Benefits' };

/**
 * Benefits page. Included benefits are described from backend configuration
 * (beverage catalog + offer benefitSummary) rather than hardcoded per phase, so a
 * catalogue change on the backend flows straight through to this page.
 */
export default async function BenefitsPage() {
  const catalog = await getEventCatalog();
  const beverageOffers = catalog.offers.filter(
    (offer) => offer.requiresBeverageSelection,
  );
  const souvenirOffers = catalog.offers.filter(
    (offer) => offer.requiresSouvenirCustomization !== false,
  );

  return (
    <>
      <PageHeader
        eyebrow="Benefits"
        title="What your ticket includes"
        description="Benefits are attached to the ticket offer you buy and are confirmed by the ticketing system when your order is placed."
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <Card>
          <CardHeader title="Presale beverage & tumbler" />
          <CardBody className="space-y-4">
            <p className="text-ink-700">
              {beverageOffers.length > 0
                ? `${beverageOffers[0]?.name ?? 'Presale'} includes one beverage and one tumbler per ticket. The beverage choice is mandatory and is recorded per ticket.`
                : 'Presale tickets include one beverage and one tumbler per ticket. The beverage choice is mandatory and is recorded per ticket.'}
            </p>

            {catalog.beverages.length === 0 ? (
              <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠ The beverage catalogue is currently unavailable.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {catalog.beverages.map((beverage) => (
                  <li
                    key={beverage.id}
                    className="flex items-center gap-3 rounded-lg border border-ink-200 px-4 py-3"
                  >
                    <span aria-hidden="true" className="text-lg text-brand-700">
                      ✓
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">
                        {beverage.name}
                      </span>
                      {beverage.description ? (
                        <span className="block text-xs text-ink-600">
                          {beverage.description}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-sm text-ink-600">
              Tumbler: one tumbler per Presale ticket. It is an included entitlement, so
              no separate selection or extra charge is required.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Custom canvas keychain" />
          <CardBody className="space-y-4">
            <p className="text-ink-700">
              Every ticket — in every phase — includes exactly one custom canvas
              keychain. Customization is mandatory and belongs to an individual ticket,
              so each person in your order can choose differently. Customization adds no
              extra cost.
            </p>

            {catalog.souvenirGroups.length === 0 ? (
              <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠ Souvenir options are currently unavailable.
              </p>
            ) : (
              <ul className="space-y-3">
                {catalog.souvenirGroups.map((group) => (
                  <li key={group.id} className="rounded-lg border border-ink-200 p-4">
                    <p className="font-semibold text-ink-900">
                      {group.name}
                      {group.required !== false ? (
                        <span className="ml-2 text-xs font-bold uppercase text-amber-800">
                          Required per ticket
                        </span>
                      ) : null}
                    </p>
                    {group.description ? (
                      <p className="mt-1 text-sm text-ink-600">{group.description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(group.options ?? []).map((option) => (
                        <span
                          key={option.id}
                          className="rounded-full border border-ink-300 bg-ink-50 px-3 py-1 text-xs font-semibold text-ink-800"
                        >
                          {option.name}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {souvenirOffers.length === 0 && catalog.offers.length > 0 ? (
          <Card>
            <CardHeader title="Applies to" />
            <CardBody>
              <p className="text-sm text-ink-700">
                Souvenir customization currently applies to{' '}
                {souvenirOffers.length > 0
                  ? souvenirOffers.map((offer) => offer.name).join(', ')
                  : 'the offers listed on the tickets page'}
                .
              </p>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Eligibility by phase" />
          <CardBody>
            {catalog.phases.length === 0 ? (
              <p className="text-sm text-ink-600">Phase information is unavailable.</p>
            ) : (
              <ul className="space-y-3">
                {catalog.phases.map((phase) => (
                  <li key={phase.id} className="flex flex-wrap items-center gap-3">
                    <PhaseBadge code={phase.code} name={phase.name} />
                    <span className="text-sm text-ink-700">{phase.description}</span>
                    <span className="text-xs text-ink-500">
                      {formatDateTime(phase.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <p className="text-sm text-ink-700">
          Ready to buy?{' '}
          <Link href="/tickets" className="font-semibold text-brand-800 underline underline-offset-4">
            Go to the ticket page
          </Link>
          .
        </p>
      </div>
    </>
  );
}
