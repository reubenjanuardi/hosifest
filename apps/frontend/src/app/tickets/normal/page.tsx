import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventCatalog } from '@/lib/api';
import { getOffersForPhase } from '@/lib/offers';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { OfferCard } from '@/components/tickets/OfferCard';
import { SelectionFlow } from '@/components/selection/SelectionFlow';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Normal tickets' };

/** Normal / OTS flow (IA doc 18 §5): quantity → per-ticket souvenir → checkout. */
export default async function NormalPage() {
  const catalog = await getEventCatalog();
  const offers = getOffersForPhase(catalog.offers, 'NORMAL');

  if (offers.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Normal" title="Normal / OTS tickets" />
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
          <Callout tone="warning" title="Normal sales are not open right now">
            No Normal offers are currently visible. Please check the phase dates on the{' '}
            <Link href="/event" className="font-semibold underline underline-offset-4">
              event page
            </Link>
            .
          </Callout>
          <Link
            href="/tickets"
            className="inline-flex min-h-[44px] items-center font-semibold text-brand-800 underline underline-offset-4"
          >
            ← Back to ticket phases
          </Link>
        </div>
      </>
    );
  }

  const offer = offers[0];
  if (!offer) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Normal"
        title={offer.name}
        description="Normal / on-the-spot sales include a custom canvas keychain that you design per ticket."
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
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
