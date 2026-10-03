import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEarlyBirdOffers } from '@/lib/offers';
import { getEventCatalog } from '@/lib/api';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { OfferCard } from '@/components/tickets/OfferCard';
import { SelectionFlow } from '@/components/selection/SelectionFlow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Early Bird' };

/**
 * Early Bird flow entry (IA doc 18 §3).
 *
 * Reached only through the restricted access page. The phase has several offers
 * (e.g. congregation-specific pricing), so the customer picks one here and then
 * completes the per-ticket steps in the shared selection flow.
 *
 * Everything shown — congregation list, prices, quotas, codes — comes from the API.
 */
export default async function EarlyBirdPage() {
  const catalog = await getEventCatalog();
  const offers = getEarlyBirdOffers(catalog.offers);

  if (offers.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Restricted" title="Early Bird" />
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <Callout tone="danger" title="Early Bird is not available">
            There are no Early Bird offers available at the moment. Please contact the
            committee if you believe you should have access.
          </Callout>
          <Link
            href="/tickets"
            className="mt-4 inline-flex min-h-[44px] items-center font-semibold text-brand-800 underline underline-offset-4"
          >
            ← Back to ticket phases
          </Link>
        </div>
      </>
    );
  }

  // Single offer → skip the chooser and go straight to per-ticket configuration.
  if (offers.length === 1) {
    const offer = offers[0];
    if (!offer) notFound();

    return (
      <>
        <PageHeader
          eyebrow="Restricted · Early Bird"
          title={offer.name}
          description="Select your congregation, then customise each ticket. Some congregations require a dedicated discount code."
        />
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
          <Callout tone="warning" title="Controlled access">
            Early Bird is a restricted offer. Eligibility, congregation and discount
            codes are all verified by the ticketing system when your order is placed.
          </Callout>
          <SelectionFlow
            offer={offer}
            congregations={catalog.congregations}
            beverages={catalog.beverages}
            souvenirGroups={catalog.souvenirGroups}
            showPhaseContext={false}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Restricted · Early Bird"
        title="Choose your Early Bird offer"
        description="Early Bird offers are restricted to configured congregations. Select the offer that matches your eligibility."
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <Callout tone="warning" title="Controlled offer">
          These offers are not open to the general public. If you are unsure which one
          applies to you, please ask your congregation contact before ordering.
        </Callout>

        <ul className="space-y-4">
          {offers.map((offer) => (
            <li key={offer.id}>
              <OfferCard offer={offer}>
                <Link
                  href={`/tickets/${encodeURIComponent(offer.id)}`}
                  className="inline-flex min-h-[52px] w-full items-center justify-center rounded-lg bg-accent-600 px-6 py-3 font-semibold text-white hover:bg-accent-500"
                >
                  Continue with this offer
                </Link>
              </OfferCard>
            </li>
          ))}
        </ul>

        <Card>
          <CardHeader title="Not an Early Bird customer?" />
          <CardBody>
            <p className="text-sm text-ink-700">
              Presale and Normal tickets are available to everyone during their phase.
            </p>
            <Link
              href="/tickets"
              className="mt-3 inline-flex min-h-[44px] items-center font-semibold text-brand-800 underline underline-offset-4"
            >
              ← Back to ticket phases
            </Link>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
