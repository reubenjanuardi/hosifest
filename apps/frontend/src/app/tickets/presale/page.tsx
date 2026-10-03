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

export const metadata: Metadata = { title: 'Presale tickets' };

/**
 * Presale flow (IA doc 18 §4): quantity → per-ticket beverage + souvenir → checkout.
 *
 * The beverage requirement itself is enforced per ticket inside SelectionFlow from
 * the offer's `requiresBeverageSelection` flag, not hardcoded here.
 */
export default async function PresalePage() {
  const catalog = await getEventCatalog();
  const offers = getOffersForPhase(catalog.offers, 'PRESALE');

  if (offers.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Presale" title="Presale tickets" />
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
          <Callout tone="warning" title="Presale is not available right now">
            No Presale offers are currently visible. Please check the phase dates on the{' '}
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
        eyebrow="Presale"
        title={offer.name}
        description="Each Presale ticket includes one beverage and one tumbler. Beverage choice is mandatory and made per ticket, so everyone in your order can choose differently."
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        <Callout tone="progress" title="What is included">
          Per ticket: one beverage (your choice), one tumbler, and one custom canvas
          keychain that you design. Items are confirmed by the ticketing system when
          your order is placed.
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
