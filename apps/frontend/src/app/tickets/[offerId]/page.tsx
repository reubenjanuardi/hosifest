import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventCatalog } from '@/lib/api';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { SelectionFlow } from '@/components/selection/SelectionFlow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Select ticket' };

interface PageProps {
  params: { offerId: string };
}

/**
 * Selection route for a single offer. The requirement set is driven entirely by the
 * offer payload returned by the backend, so Presale, Normal and any future offer
 * type all work through this one page.
 */
export default async function OfferSelectionPage({ params }: PageProps) {
  const catalog = await getEventCatalog();
  const offer = catalog.offers.find((candidate) => candidate.id === params.offerId);

  if (!offer) notFound();

  // Hidden offers must not be reachable from the public site.
  if (offer.isPubliclyVisible === false) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Select ticket"
        title={offer.name}
        description="Each ticket is customised individually so eligibility, benefits and souvenirs are never ambiguous."
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        {offer.phaseCode === 'EARLY_BIRD' ? (
          <Callout tone="warning" title="Restricted Early Bird offer">
            This is a controlled offer. Eligibility and any required discount code are
            verified by the ticketing system when you place your order.
          </Callout>
        ) : null}

        <SelectionFlow
          offer={offer}
          congregations={catalog.congregations}
          beverages={catalog.beverages}
          souvenirGroups={catalog.souvenirGroups}
        />
      </div>
    </>
  );
}
