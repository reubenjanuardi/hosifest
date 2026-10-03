import type { Metadata } from 'next';
import Link from 'next/link';
import { getEventCatalog } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getEarlyBirdOffers, groupOffersByPhase } from '@/lib/offers';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PhaseBadge } from '@/components/ui/StatusBadge';
import { OfferCard } from '@/components/tickets/OfferCard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tickets' };

/**
 * Public ticket page (IA doc 18 §2).
 *
 * Only offers the backend marks as publicly visible are rendered. Early Bird is
 * deliberately excluded here and reached through its restricted direct route, so
 * it is never positioned as a broadly public offer (BR-TKT-04).
 */
export default async function TicketsPage() {
  const catalog = await getEventCatalog();
  const phaseGroups = groupOffersByPhase(catalog.offers, catalog.phases);
  const earlyBirdOffers = getEarlyBirdOffers(catalog.offers);
  const catalogUnavailable = Object.keys(catalog.failures).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Tickets"
        title="Choose your ticket"
        description="Each phase offers a different set of ticket types. Prices, quotas and availability are shown exactly as configured by the ticketing system, and the final amount is confirmed by the server when you place your order."
      />

      <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        {catalogUnavailable ? (
          <Callout tone="warning" title="Some information could not be loaded">
            Parts of the ticket catalogue are temporarily unavailable, so the offers
            below may be incomplete. Nothing will be ordered until the server confirms
            your selection.
          </Callout>
        ) : null}

        {phaseGroups.map((group) => (
          <section key={group.code} aria-labelledby={`phase-${group.code}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2
                  id={`phase-${group.code}`}
                  className="text-2xl font-black tracking-tight text-ink-950"
                >
                  {group.name}
                </h2>
                <PhaseBadge code={group.code} name={group.name} />
              </div>
              <p className="text-sm text-ink-600">
                {formatDateTime(group.startsAt)} → {formatDateTime(group.endsAt)}
              </p>
            </div>

            {group.description ? (
              <p className="mt-2 max-w-prose text-ink-700">{group.description}</p>
            ) : null}

            <div className="mt-5">
              {group.code === 'EARLY_BIRD' ? (
                <Card className="border-accent-500 bg-accent-400/10">
                  <CardBody className="space-y-4">
                    <Callout tone="warning" title="Controlled access — not a public sale">
                      Early Bird is a restricted offer. It is only available to eligible
                      congregations through direct access, so it is not listed as a
                      general offer on this page.
                    </Callout>

                    {earlyBirdOffers.length > 0 ? (
                      <div>
                        <p className="text-sm text-ink-800">
                          If you have been given Early Bird access, continue to the
                          restricted entry point to select your congregation:
                        </p>
                        <Link
                          href="/tickets/early-bird/access"
                          className="mt-3 inline-flex min-h-[52px] items-center rounded-lg bg-accent-600 px-6 py-3 font-semibold text-white hover:bg-accent-500"
                        >
                          Enter restricted Early Bird access
                        </Link>
                      </div>
                    ) : (
                      <p className="text-sm text-ink-700">
                        Early Bird is not currently available.
                      </p>
                    )}
                  </CardBody>
                </Card>
              ) : group.offers.length === 0 ? (
                <Card>
                  <CardBody>
                    <p className="text-sm text-ink-600">
                      No offers are currently visible in this phase. Please check back
                      during the phase dates above.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                <ul className="grid gap-4 lg:grid-cols-2">
                  {group.offers.map((offer) => (
                    <li key={offer.id}>
                      <OfferCard offer={offer}>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/tickets/${encodeURIComponent(offer.id)}`}
                            className="inline-flex min-h-[52px] flex-1 items-center justify-center rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800"
                          >
                            Select this ticket
                          </Link>
                        </div>
                      </OfferCard>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}

        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-2xl font-black tracking-tight text-ink-950">
            How buying works
          </h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: '1. Choose a phase',
                body: 'Pick the ticket type you want. Eligibility and limits are shown per offer.',
              },
              {
                title: '2. Customise each ticket',
                body: 'Every ticket is individual — beverage (Presale) and keychain choices are made per ticket.',
              },
              {
                title: '3. Checkout',
                body: 'Enter your details and review a per-ticket summary before you order.',
              },
              {
                title: '4. Pay within the window',
                body: 'Follow the payment instructions and upload your proof before the countdown ends.',
              },
            ].map((step) => (
              <li key={step.title}>
                <Card>
                  <CardBody>
                    <p className="font-bold text-ink-900">{step.title}</p>
                    <p className="mt-1 text-sm text-ink-600">{step.body}</p>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
