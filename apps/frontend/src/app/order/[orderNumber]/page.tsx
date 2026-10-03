import type { Metadata } from 'next';
import { getOrder, type Order } from '@/lib/api';
import { OrderStatusView } from '@/components/order/OrderStatusView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Order status' };

interface PageProps {
  params: { orderNumber: string };
}

/**
 * Fetches the order server-side and seeds the client view, so the status and the
 * payment countdown are present in the first paint instead of appearing after a
 * round-trip.
 */
export default async function OrderStatusPage({ params }: PageProps) {
  const orderNumber = decodeURIComponent(params.orderNumber);
  const initialOrder = await getOrder(orderNumber).catch(() => null);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <OrderStatusView orderNumber={orderNumber} initialOrder={initialOrder} />
    </div>
  );
}
