'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getOrder,
  submitPaymentProof,
  type Order,
  type PaymentMethodOption,
} from '@/lib/api';
import {
  describeOrderStatus,
  formatDateTime,
  formatMoney,
  summarizeTicket,
} from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Countdown } from '@/components/ui/Countdown';
import { StatusBadge } from '@/components/ui/StatusBadge';

/**
 * Order status view (IA doc 18 §7).
 *
 * Shows the authoritative order status, a live countdown of the payment window
 * driven by the backend's `expiresAt`, and the payment-proof upload. When the
 * countdown reaches zero the page re-fetches so the EXPIRED state comes from the
 * server rather than being assumed by the browser.
 */
export function OrderStatusView({
  orderNumber,
  initialOrder = null,
}: {
  orderNumber: string;
  /** Server-fetched order, so the page renders fully without a client fetch. */
  initialOrder?: Order | null;
}) {
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [loading, setLoading] = useState(initialOrder === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [method, setMethod] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofDone, setProofDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getOrder(orderNumber);
      setOrder(next);
      setLoadError(null);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setNotFound(true);
      } else {
        setLoadError(
          error instanceof ApiError
            ? error.message
            : 'We could not load your order right now.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    if (initialOrder) return;
    void refresh();
  }, [refresh, initialOrder]);

  // Prefill the amount from the authoritative total so the customer does not retype it.
  useEffect(() => {
    const total = order?.totals?.total ?? order?.total ?? null;
    if (total !== null && amount === '') {
      setAmount(String(total));
    }
    // Intentionally keyed on the order total only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.totals?.total, order?.total]);

  const methods: PaymentMethodOption[] = order?.paymentMethods ?? [];
  const total = order?.totals?.total ?? order?.total ?? null;
  const currency = order?.currency ?? null;

  // Upload is only offered while the order is still awaiting payment. Once a proof
  // has been submitted the backend moves the order to review and must not accept a
  // further proof, so the UI stops offering it rather than letting it fail.
  const canUpload = order?.status === 'WAITING_PAYMENT';

  const uploadProof = async () => {
    if (!order) return;
    if (!method) {
      setProofError('Choose a payment method.');
      return;
    }
    if (!amount) {
      setProofError('Enter the amount you paid.');
      return;
    }
    if (!file) {
      setProofError('Attach a screenshot or photo of your payment.');
      fileInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setProofError(null);

    const form = new FormData();
    form.append('method', method);
    form.append('amount', amount);
    form.append('proof', file);

    try {
      await submitPaymentProof(orderNumber, form);
      setProofDone(true);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (error) {
      setProofError(
        error instanceof ApiError
          ? error.message
          : 'We could not upload your proof. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-8 text-center text-ink-600">
        Loading your order…
      </div>
    );
  }

  if (notFound) {
    return (
      <Callout tone="danger" title="Order not found">
        We could not find an order with the number{' '}
        <span className="font-mono font-semibold">{orderNumber}</span>. Please check the
        number and try again.
      </Callout>
    );
  }

  if (loadError || !order) {
    return (
      <Callout tone="danger" title="Order unavailable" role="alert">
        {loadError ?? 'Something went wrong.'}
      </Callout>
    );
  }

  const status = describeOrderStatus(order.status);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={`Order ${order.orderNumber}`}
          description={`Placed ${formatDateTime(order.createdAt)}`}
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={status} size="lg" />
            <span className="text-sm text-ink-700">{status.description}</span>
          </div>

          {/* Countdown is only meaningful while waiting for payment. */}
          {order.status === 'WAITING_PAYMENT' ? (
            <div className="rounded-xl border-2 border-ink-300 bg-ink-50 px-4 py-4">
              <Countdown expiresAt={order.expiresAt} onElapsed={() => void refresh()} />
            </div>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-600">Customer</dt>
              <dd className="font-semibold text-ink-900">{order.customerName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-600">Email</dt>
              <dd className="font-semibold text-ink-900">{order.customerEmail ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-600">Total (authoritative)</dt>
              <dd className="text-lg font-black text-ink-950">
                {formatMoney(total, currency)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-ink-600">Payment window closes</dt>
              <dd className="font-semibold text-ink-900">
                {formatDateTime(order.expiresAt)}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {order.items?.length ? (
        <Card>
          <CardHeader
            title="Your tickets"
            description="Each ticket is listed with its individual choices."
          />
          <CardBody>
            <ul className="space-y-3">
              {order.items.map((ticket, index) => (
                <li
                  key={ticket.id ?? `item-${index}`}
                  className="rounded-xl border-2 border-ink-300 bg-white p-4"
                >
                  <p className="font-black text-ink-950">
                    {summarizeTicket(ticket, index + 1)}
                  </p>
                  <dl className="mt-2 space-y-1 text-sm text-ink-700">
                    {ticket.congregationName ? (
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>Congregation</dt>
                        <dd className="font-semibold text-ink-900">
                          {ticket.congregationName}
                        </dd>
                      </div>
                    ) : null}
                    {ticket.unitPrice != null ? (
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>Unit price</dt>
                        <dd className="font-semibold text-ink-900">
                          {formatMoney(ticket.unitPrice, currency)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  {ticket.ticketCode ? (
                    <p className="mt-3">
                      <a
                        href={`/ticket/${encodeURIComponent(ticket.ticketCode)}`}
                        className="inline-flex min-h-[44px] items-center font-semibold text-brand-800 underline underline-offset-4"
                      >
                        View e-ticket {ticket.ticketCode} →
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      {/* Payment instructions + proof upload */}
      {order.status === 'PAID' ? (
        <Callout tone="success" title="Payment approved">
          Your e-tickets are ready. Open each ticket from the list above to view its QR
          code. The same QR is used for entry and exit, and re-entry is allowed.
        </Callout>
      ) : order.status === 'EXPIRED' ? (
        <Callout tone="danger" title="Payment window expired">
          This order expired before payment proof was received, so the ticket reservation
          was released. Please start a new order.
        </Callout>
      ) : order.status === 'CANCELLED' ? (
        <Callout tone="danger" title="Order cancelled">
          This order was cancelled and its reservation released. Please place a new order.
        </Callout>
      ) : null}

      {canUpload ? (
        <Card>
          <CardHeader
            title="Payment instructions"
            description="Pay using one of the methods below, then upload your proof."
          />
          <CardBody className="space-y-4">
            {methods.length > 0 ? (
              <ul className="space-y-2">
                {methods.map((paymentMethod) => (
                  <li
                    key={paymentMethod.code}
                    className="rounded-lg border border-ink-200 px-4 py-3 text-sm"
                  >
                    <p className="font-bold text-ink-900">{paymentMethod.name}</p>
                    {paymentMethod.accountLabel && paymentMethod.accountValue ? (
                      <p className="mt-1 font-mono text-ink-800">
                        {paymentMethod.accountLabel}: {paymentMethod.accountValue}
                      </p>
                    ) : null}
                    {paymentMethod.instructions ? (
                      <p className="mt-1 text-ink-600">{paymentMethod.instructions}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {order.paymentInstructions ? (
              <p className="whitespace-pre-line rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-800">
                {order.paymentInstructions}
              </p>
            ) : null}

            <div className="space-y-4 border-t border-ink-200 pt-4">
              <div>
                <label
                  htmlFor="proof-method"
                  className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                  Payment method <span className="text-red-700">*</span>
                </label>
                <select
                  id="proof-method"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  required
                  className="min-h-[44px] w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-base"
                >
                  <option value="">Select a method…</option>
                  {methods.map((paymentMethod) => (
                    <option key={paymentMethod.code} value={paymentMethod.code}>
                      {paymentMethod.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="proof-amount"
                  className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                  Amount paid <span className="text-red-700">*</span>
                </label>
                <input
                  id="proof-amount"
                  type="number"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  className="min-h-[44px] w-full rounded-lg border border-ink-300 px-3 py-2 text-base"
                />
                <p className="mt-1 text-xs text-ink-600">
                  Please enter the exact amount shown above so our team can verify your
                  payment quickly.
                </p>
              </div>

              <div>
                <label
                  htmlFor="proof-file"
                  className="mb-1.5 block text-sm font-semibold text-ink-800"
                >
                  Payment proof <span className="text-red-700">*</span>
                </label>
                <input
                  id="proof-file"
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  required
                  className="block w-full rounded-lg border border-ink-300 p-2 text-sm file:mr-3 file:min-h-[40px] file:rounded-md file:border-0 file:bg-brand-700 file:px-4 file:font-semibold file:text-white"
                />
                <p className="mt-1 text-xs text-ink-600">
                  Upload a screenshot or photo of your QRIS / bank transfer receipt.
                </p>
              </div>

              {proofError ? (
                <Callout tone="danger" title="Could not submit proof" role="alert">
                  {proofError}
                </Callout>
              ) : null}
              {proofDone ? (
                <Callout tone="success" title="Proof received">
                  Thank you. Our team is verifying your payment and your e-tickets will
                  appear here once it is approved.
                </Callout>
              ) : null}
            </div>
          </CardBody>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => void refresh()}>
              Refresh status
            </Button>
            <Button size="lg" onClick={uploadProof} disabled={submitting}>
              {submitting ? 'Uploading…' : 'Submit payment proof'}
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}


