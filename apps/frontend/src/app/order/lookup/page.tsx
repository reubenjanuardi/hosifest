import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { OrderLookupForm } from '@/components/order/OrderLookupForm';

export const metadata: Metadata = { title: 'Check order' };

export default function OrderLookupPage() {
  return (
    <>
      <PageHeader
        eyebrow="Orders"
        title="Check your order"
        description="View payment status, submit payment proof, and open your e-tickets."
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <OrderLookupForm />
      </div>
    </>
  );
}
