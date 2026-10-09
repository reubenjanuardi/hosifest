'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ApiError,
  createOrder,
  EVENT_SLUG,
  getOrder,
  type CreateOrderRequest,
  type Order,
  type TicketOffer,
} from '@/lib/api';
import { formatMoney, normalizePhone, describeOrderStatus } from '@/lib/format';
import {
  clearOrderDraft,
  loadCatalogSnapshot,
  loadOrderDraft,
  type DraftTicketSelection,
} from '@/lib/selection-draft';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';

interface CheckoutViewProps {
  /** Full catalog; the offer for this checkout is resolved from the draft's offerId. */
  offers: TicketOffer[];
}

/** Resolves a display name for a catalog id, falling back to a neutral label. */
function labelFor<T extends { id: string; name: string }>(
  items: T[],
  id: string | null | undefined,
  fallback = 'Not selected',
): string {
  if (!id) return fallback;
  return items.find((item) => item.id === id)?.name ?? fallback;
}

/**
 * Checkout page (IA doc 18 §6).
 *
 * Renders the eight documented sections and every ticket as a visually separable
 * card. Section 7 (Total) and section 8 (Payment instructions) are populated from
 * the ORDER RESPONSE — never computed here. Before the order exists those sections
 * state plainly that the ticketing system confirms them.
 */
export function CheckoutView({ offers }: CheckoutViewProps) {
  const [draft, setDraft] = useState<ReturnType<typeof loadOrderDraft>>(null);
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState(loadCatalogSnapshot());

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [polling, setPolling] = useState(false);

  // Draft lives in localStorage, so it is only available after mount.
  useEffect(() => {
    setDraft(loadOrderDraft());
    setCatalog(loadCatalogSnapshot());
    setReady(true);
  }, []);

  /**
   * Once the order exists, its status can change without this page acting:
   * the committee may verify the payment, or the payment window may lapse.
   * Poll so the screen never shows a stale WAITING_PAYMENT next to an
   * already-verified order.
   */
  useEffect(() => {
    if (!createdOrder) return;
    if (createdOrder.status !== 'WAITING_PAYMENT') return;
    setPolling(true);
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const next = await getOrder(createdOrder.orderNumber);
          setCreatedOrder(next);
          if (next.status !== 'WAITING_PAYMENT') setPolling(false);
        } catch {
          // A transient failure must not clear the screen; the next tick retries.
        }
      })();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [createdOrder]);

  const tickets: DraftTicketSelection[] = draft?.tickets ?? [];

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const phoneLooksValid = normalizePhone(phone).length >= 9;
  const customerComplete =
    name.trim().length > 0 && emailLooksValid && phoneLooksValid;

  const offer = useMemo(() => {
    const draftOfferId = draft?.offerId;
    if (!draftOfferId) return null;
    return offers.find((candidate) => candidate.id === draftOfferId) ?? null;
  }, [draft, offers]);
  const requiresCongregation = Boolean(offer?.requiresCongregation);
  const requiresBeverage = Boolean(offer?.requiresBeverageSelection);

  const anyCongregation = useMemo(
    () => tickets.some((ticket) => Boolean(ticket.congregationId)),
    [tickets],
  );
  const anyDiscount = useMemo(
    () => tickets.some((ticket) => ticket.discountCode.trim().length > 0),
    [tickets],
  );


  if (!ready) {
    return (
      <div className="rounded-xl border border-ink-200 bg-white p-8 text-center text-ink-600">
        Loading your selection…
      </div>
    );
  }

  if (!draft || !offer || tickets.length === 0) {
    return (
      <div className="space-y-4">
        <Callout tone="warning" title="No selection in progress">
          We could not find a ticket selection on this device. Please start again from
          the ticket page.
        </Callout>
        <Link
          href="/tickets"
          className="inline-flex min-h-[52px] items-center rounded-lg bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-800"
        >
          Go to ticket phases
        </Link>
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    const payload: CreateOrderRequest = {
      eventSlug: EVENT_SLUG,
      customer: {
        name: name.trim(),
        email: email.trim(),
        phone: normalizePhone(phone),
      },
      items: [
        {
          ticketOfferId: draft.offerId,
          quantity: draft.quantity,
          tickets: tickets.map((ticket) => ({
            congregationId: ticket.congregationId,
            discountCode: ticket.discountCode.trim() || null,
            beverageOptionId: ticket.beverageOptionId,
            souvenirSelections: Object.entries(ticket.souvenirSelections).map(
              ([optionGroupId, optionId]) => ({
                optionGroupId,
                optionId,
                quantity: 1,
              }),
            ),
          })),
        },
      ],
    };

    try {
      const order = await createOrder(payload);
      setCreatedOrder(order);
      clearOrderDraft();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'We could not place your order. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const currency = createdOrder?.currency ?? offer.currency ?? null;
  const authoritativeTotal =
    createdOrder?.totals?.total ?? createdOrder?.total ?? null;

  return (
    <div className="space-y-6">
      {/* 1 — Customer information */}
      <Card as="section" aria-labelledby="section-customer">
        <CardHeader
          step={1}
          id="section-customer"
          title="Customer information"
          description="Used for your order confirmation and e-ticket. We contact you only about this order."
        />
        <CardBody className="space-y-4">
          <Field
            label="Full name"
            name="customer-name"
            value={name}
            onChange={setName}
            required
            autoComplete="name"
            placeholder="As it should appear on the order"
          />
          <Field
            label="Email address"
            name="customer-email"
            type="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
            error={email && !emailLooksValid ? 'Enter a valid email address.' : null}
          />
          <Field
            label="Phone number (WhatsApp)"
            name="customer-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
            required
            autoComplete="tel"
            error={phone && !phoneLooksValid ? 'Enter a valid phone number.' : null}
          />
          <p className="text-xs text-ink-600">
            Your name is stored as a snapshot on the order. The ticketing system is the
            final authority on whether your details are accepted.
          </p>
        </CardBody>
      </Card>

      {/* 2 — Ticket breakdown (also 3/5/6 detail per ticket) */}
      <Card as="section" aria-labelledby="section-breakdown">
        <CardHeader
          step={2}
          id="section-breakdown"
          title="Ticket breakdown"
          description="Every ticket is listed separately with its individual choices."
        />
        <CardBody>
          <ul className="space-y-4">
            {tickets.map((ticket, index) => {
              const beverage = labelFor(
                catalog?.beverages ?? [],
                ticket.beverageOptionId,
              );
              const congregation = labelFor(
                catalog?.congregations ?? [],
                ticket.congregationId,
              );
              const souvenirPairs = Object.entries(ticket.souvenirSelections).map(
                ([groupId, optionId]) => {
                  const group = catalog?.souvenirGroups?.find(
                    (candidate) => candidate.id === groupId,
                  );
                  const option = group?.options?.find(
                    (candidate) => candidate.id === optionId,
                  );
                  return { groupName: group?.name ?? '', optionName: option?.name ?? '' };
                },
              );

              return (
                <li
                  key={`breakdown-${index}`}
                  className="rounded-xl border-2 border-ink-300 bg-white p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200 pb-3">
                    <h3 className="text-lg font-black text-ink-950">
                      Ticket #{index + 1}
                    </h3>
                    <span className="rounded-full bg-ink-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                      {draft.offerName}
                    </span>
                  </div>

                  <dl className="mt-3 space-y-2 text-sm">
                    {/* 3 — Eligibility / congregation */}
                    {requiresCongregation ? (
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-600">Congregation</dt>
                        <dd className="font-semibold text-ink-900">{congregation}</dd>
                      </div>
                    ) : null}

                    {/* 4 — Presale benefits */}
                    {requiresBeverage ? (
                      <>
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt className="text-ink-600">Beverage</dt>
                          <dd className="font-semibold text-ink-900">{beverage}</dd>
                        </div>
                        <div className="flex flex-wrap justify-between gap-2">
                          <dt className="text-ink-600">Tumbler</dt>
                          <dd className="font-semibold text-ink-900">
                            Included (1 per ticket)
                          </dd>
                        </div>
                      </>
                    ) : null}

                    {/* 5 — Souvenir */}
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-ink-600">Keychain</dt>
                      <dd className="max-w-[60%] text-right font-semibold text-ink-900">
                        {souvenirPairs.length === 0
                          ? 'Not set'
                          : souvenirPairs
                              .map((pair) =>
                                [pair.groupName, pair.optionName]
                                  .filter(Boolean)
                                  .join(' + '),
                              )
                              .join(', ')}
                      </dd>
                    </div>

                    {/* 6 — Discount */}
                    {ticket.discountCode.trim() ? (
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt className="text-ink-600">Discount code</dt>
                        <dd className="font-mono font-semibold text-ink-900">
                          {ticket.discountCode.trim()}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {/* 3 / 4 / 5 / 6 — roll-ups so each IA section is explicitly present */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="section-eligibility">
          <CardHeader
            step={3}
            id="section-eligibility"
            title="Eligibility & congregation"
          />
          <CardBody>
            {anyCongregation ? (
              <ul className="space-y-1 text-sm text-ink-800">
                {tickets.map((ticket, index) => (
                  <li key={`elig-${index}`}>
                    <strong>Ticket #{index + 1}:</strong>{' '}
                    {labelFor(catalog?.congregations ?? [], ticket.congregationId)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">
                No congregation is required for this offer.
              </p>
            )}
          </CardBody>
        </Card>

        <Card as="section" aria-labelledby="section-benefits">
          <CardHeader step={4} id="section-benefits" title="Presale benefits" />
          <CardBody>
            {requiresBeverage ? (
              <ul className="space-y-1 text-sm text-ink-800">
                {tickets.map((ticket, index) => (
                  <li key={`benefit-${index}`}>
                    <strong>Ticket #{index + 1}:</strong>{' '}
                    {labelFor(catalog?.beverages ?? [], ticket.beverageOptionId)} + 1 tumbler
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">
                This offer does not include beverage benefits.
              </p>
            )}
          </CardBody>
        </Card>

        <Card as="section" aria-labelledby="section-souvenir">
          <CardHeader step={5} id="section-souvenir" title="Souvenir customization" />
          <CardBody>
            <ul className="space-y-1 text-sm text-ink-800">
              {tickets.map((ticket, index) => (
                <li key={`souvenir-${index}`}>
                  <strong>Ticket #{index + 1}:</strong>{' '}
                  {Object.values(ticket.souvenirSelections).length === 0
                    ? 'Not set'
                    : Object.values(ticket.souvenirSelections).length +
                      ' selection(s)'}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-600">
              Customization adds no cost. Your selections are frozen as a snapshot once
              payment is approved.
            </p>
          </CardBody>
        </Card>

        <Card as="section" aria-labelledby="section-discount">
          <CardHeader step={6} id="section-discount" title="Discount" />
          <CardBody>
            {anyDiscount ? (
              <ul className="space-y-1 text-sm text-ink-800">
                {tickets.map((ticket, index) => (
                  <li key={`discount-${index}`}>
                    <strong>Ticket #{index + 1}:</strong>{' '}
                    {ticket.discountCode.trim() || 'No code'}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">
                No discount code applied to this order.
              </p>
            )}
            <p className="mt-3 text-xs text-ink-600">
              Discount eligibility and usage limits are validated by the ticketing
              system. An invalid code causes the order to be rejected.
            </p>
          </CardBody>
        </Card>
      </div>

      {/* 7 — Total (backend-authoritative) */}
      <Card as="section" aria-labelledby="section-total">
        <CardHeader
          step={7}
          id="section-total"
          title="Total"
          description="The amount charged is calculated by the ticketing system — never in your browser."
        />
        <CardBody>
          {createdOrder ? (
            <>
              <p className="text-3xl font-black text-ink-950">
                {formatMoney(authoritativeTotal, currency)}
              </p>
              <p className="mt-2 text-sm text-ink-700">
                Confirmed by the ticketing system for order{' '}
                <span className="font-mono font-semibold">{createdOrder.orderNumber}</span>.
              </p>
            </>
          ) : (
            <Callout tone="progress" title="Total confirmed when you place the order">
              Your total is calculated server-side once your selection is submitted, so
              the amount shown on your order page is always the amount you must pay.
            </Callout>
          )}
        </CardBody>
      </Card>

      {/* 8 — Payment instructions (backend-authoritative) */}
      <Card as="section" aria-labelledby="section-payment">
        <CardHeader
          step={8}
          id="section-payment"
          title="Payment instructions"
          description="Pay by QRIS or bank transfer, then upload your proof on the order page."
        />
        <CardBody className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
            <li>Place your order to reserve your tickets and start the payment window.</li>
            <li>Pay using the method and details shown on your order page.</li>
            <li>Upload your payment proof before the countdown ends.</li>
            <li>Your e-tickets are issued once the payment is verified.</li>
          </ol>

          {createdOrder ? (
            <div className="space-y-3">
              {createdOrder.paymentMethods?.length ? (
                <ul className="space-y-2">
                  {createdOrder.paymentMethods.map((method) => (
                    <li
                      key={method.code}
                      className="rounded-lg border border-ink-200 px-4 py-3 text-sm"
                    >
                      <p className="font-bold text-ink-900">{method.name}</p>
                      {method.accountLabel && method.accountValue ? (
                        <p className="mt-1 font-mono text-ink-800">
                          {method.accountLabel}: {method.accountValue}
                        </p>
                      ) : null}
                      {method.instructions ? (
                        <p className="mt-1 text-ink-600">{method.instructions}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {createdOrder.paymentInstructions ? (
                <p className="whitespace-pre-line rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-800">
                  {createdOrder.paymentInstructions}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-600">
              Exact payment details are shown on your order page immediately after you
              place the order.
            </p>
          )}
        </CardBody>

        <CardFooter className="space-y-3">
          {error ? (
            <Callout tone="danger" title="Order could not be placed" role="alert">
              {error}
            </Callout>
          ) : null}

          {createdOrder ? (
            <div className="space-y-3">
              <Callout
                tone={createdOrder.status === 'WAITING_PAYMENT' ? 'progress' : 'success'}
                title={
                  createdOrder.status === 'WAITING_PAYMENT'
                    ? 'Order placed — tickets reserved'
                    : 'Order status updated'
                }
              >
                {createdOrder.status === 'WAITING_PAYMENT' ? (
                  <>
                    Your tickets are reserved until{' '}
                    {createdOrder.expiresAt
                      ? new Date(createdOrder.expiresAt).toLocaleString('id-ID')
                      : 'the payment window ends'}
                    . Submit your payment proof on the order page to keep them.
                    {polling ? (
                      <span className="mt-2 block text-xs">
                        Checking the ticketing system for updates…
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    This order is now{' '}
                    <strong>{describeOrderStatus(createdOrder.status).label}</strong>
                    .{' '}
                    <Link
                      className="font-semibold underline"
                      href={`/order/${encodeURIComponent(createdOrder.orderNumber)}`}
                    >
                      View the latest status and your e-tickets
                    </Link>
                    .
                  </>
                )}
              </Callout>
              <Link
                href={`/order/${encodeURIComponent(createdOrder.orderNumber)}`}
                className="inline-flex min-h-[56px] w-full items-center justify-center rounded-lg bg-brand-700 px-6 py-3 text-base font-semibold text-white hover:bg-brand-800"
              >
                Go to order &amp; pay →
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-700">
                {customerComplete
                  ? 'Ready to place your order.'
                  : 'Complete your name, email and phone number to continue.'}
              </p>
              <Button
                size="lg"
                onClick={submit}
                disabled={!customerComplete || submitting}
              >
                {submitting ? 'Placing order…' : 'Place order'}
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}



