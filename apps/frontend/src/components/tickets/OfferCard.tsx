'use client';

import type { TicketOffer } from '@/lib/api';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

export interface OfferCardProps {
  offer: TicketOffer;
  /** Renders the buy/select control. */
  children?: React.ReactNode;
  compact?: boolean;
}

/**
 * One ticket offer card. All numbers shown are backend-returned. The component
 * never multiplies price by quantity or derives an amount.
 */
export function OfferCard({ offer, children, compact }: OfferCardProps) {
  return (
    <Card as="article" className={compact ? '' : 'h-full'}>
      <CardHeader
        title={offer.name}
        description={offer.description}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-black text-ink-950">
            {offer.priceLabel ?? (offer.displayPrice != null ? String(offer.displayPrice) : '—')}
          </span>
          {offer.originalPriceLabel ? (
            <span className="text-sm font-medium text-ink-500 line-through">
              {offer.originalPriceLabel}
            </span>
          ) : null}
        </div>

        {offer.benefitSummary ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900">
            {offer.benefitSummary}
          </p>
        ) : null}

        {/* Requirement chips: derived from backend flags, not hardcoded per offer. */}
        <ul className="flex flex-wrap gap-2 text-xs font-semibold">
          {offer.requiresCongregation ? (
            <li className="rounded-full border border-ink-300 bg-ink-50 px-2.5 py-1 text-ink-700">
              Congregation required
            </li>
          ) : null}
          {offer.requiresDiscountCode ? (
            <li className="rounded-full border border-accent-500 bg-accent-400/20 px-2.5 py-1 text-accent-600">
              Discount code required
            </li>
          ) : null}
          {offer.requiresBeverageSelection ? (
            <li className="rounded-full border border-brand-300 bg-brand-50 px-2.5 py-1 text-brand-800">
              Beverage included
            </li>
          ) : null}
          {offer.requiresSouvenirCustomization !== false ? (
            <li className="rounded-full border border-ink-300 bg-ink-50 px-2.5 py-1 text-ink-700">
              Custom keychain
            </li>
          ) : null}
        </ul>

        {offer.requiresDiscountCode ? (
          <Callout tone="warning" title="Restricted offer">
            A valid discount code is required for this offer. The code is checked and
            applied by the ticketing system — entering one here does not guarantee it
            will be accepted.
          </Callout>
        ) : null}

        {children}
      </CardBody>
    </Card>
  );
}
