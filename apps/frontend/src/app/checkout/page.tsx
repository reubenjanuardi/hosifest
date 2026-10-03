import type { Metadata } from 'next';
import { getEventCatalog } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { CheckoutView } from '@/components/order/CheckoutView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Checkout' };

/**
 * Checkout shell.
 *
 * The whole catalog is passed down and the offer is resolved client-side from the
 * draft's `offerId`, so a selection made in any phase keeps its own requirements
 * even when other offers exist.
 */
export default async function CheckoutPage() {
  const catalog = await getEventCatalog();

  return (
    <>
      <PageHeader
        eyebrow="Checkout"
        title="Review and place your order"
        description="Check every ticket below, then place your order to reserve it and start the payment window."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <CheckoutView offers={catalog.offers} />
      </div>
    </>
  );
}
