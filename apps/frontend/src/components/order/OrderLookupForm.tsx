'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';

/**
 * Order lookup. Sends the customer to the status page which itself fetches the
 * authoritative order from the backend.
 */
export function OrderLookupForm() {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = orderNumber.trim();
    if (!trimmed) {
      setError('Enter your order number.');
      return;
    }
    setError(null);
    router.push(`/order/${encodeURIComponent(trimmed)}`);
  };

  return (
    <Card as="section" className="mx-auto max-w-lg">
      <CardHeader
        title="Check your order"
        description="Enter the order number you received after checkout."
      />
      <form onSubmit={submit}>
        <CardBody>
          <Field
            label="Order number"
            name="order-number"
            value={orderNumber}
            onChange={setOrderNumber}
            required
            autoComplete="off"
            placeholder="e.g. HOS-0000-0000"
            error={error}
            hint="Your order number is shown on the confirmation screen after you place an order."
          />
        </CardBody>
        <CardFooter>
          <Button type="submit" size="lg" fullWidth>
            View order status
          </Button>
        </CardFooter>
      </form>
      <CardBody className="border-t border-ink-200 pt-4">
        <Callout tone="progress" title="Lost your confirmation?">
          If your order expired or was cancelled, the reservation was released
          automatically and a new order is needed. Contact the committee if you need help
          with an order that was already paid.
        </Callout>
      </CardBody>
    </Card>
  );
}
