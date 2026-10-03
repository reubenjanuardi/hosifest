'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type {
  BeverageOption,
  Congregation,
  SouvenirOptionGroup,
  TicketOffer,
} from '@/lib/api';
import { maxSelectableQuantity } from '@/lib/offers';
import {
  createEmptyTickets,
  missingTicketInputs,
  saveCatalogSnapshot,
  saveOrderDraft,
  type DraftTicketSelection,
  type OrderDraft,
} from '@/lib/selection-draft';
import { BeveragePicker } from '@/components/selection/BeveragePicker';
import { CongregationPicker } from '@/components/selection/CongregationPicker';
import { QuantityStepper } from '@/components/selection/QuantityStepper';
import { SouvenirCustomizer } from '@/components/selection/SouvenirCustomizer';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';

export interface SelectionFlowProps {
  offer: TicketOffer;
  congregations: Congregation[];
  beverages: BeverageOption[];
  souvenirGroups: SouvenirOptionGroup[];
  /** Hidden on the Early Bird route, where the phase is already implied. */
  showPhaseContext?: boolean;
}

/**
 * Shared selection flow used by all three phases (IA doc 18 §3, §4, §5).
 *
 * The flow is identical in structure and differs only by which requirements the
 * backend reports for the chosen offer:
 *   - Early Bird → congregation + possible discount code + souvenir
 *   - Presale   → beverage + souvenir
 *   - Normal    → souvenir
 *
 * All requirement flags come from the offer payload. Nothing about a phase is
 * hardcoded, so if the backend adds a requirement it is enforced immediately.
 */
export function SelectionFlow({
  offer,
  congregations,
  beverages,
  souvenirGroups,
  showPhaseContext = true,
}: SelectionFlowProps) {
  const router = useRouter();
  const maxQuantity = Math.max(1, maxSelectableQuantity(offer));

  const [quantity, setQuantity] = useState(1);
  const [tickets, setTickets] = useState<DraftTicketSelection[]>(() =>
    createEmptyTickets(1),
  );

  const requiresCongregation = Boolean(offer.requiresCongregation);
  const requiresBeverage = Boolean(offer.requiresBeverageSelection);
  const requiresSouvenir = offer.requiresSouvenirCustomization !== false;
  const requiresDiscount = Boolean(offer.requiresDiscountCode);

  /** Congregations flagged as discount-eligible drive the per-ticket code field. */
  const discountCongregationIds = useMemo(
    () =>
      new Set(
        congregations
          .filter((congregation) => congregation.supportsDiscountCode)
          .map((congregation) => congregation.id),
      ),
    [congregations],
  );

  const setTicket = (index: number, patch: Partial<DraftTicketSelection>) => {
    setTickets((current) =>
      current.map((ticket, ticketIndex) =>
        ticketIndex === index ? { ...ticket, ...patch } : ticket,
      ),
    );
  };

  const handleQuantity = (next: number) => {
    const clamped = Math.min(Math.max(1, next), maxQuantity);
    setQuantity(clamped);
    setTickets((current) => {
      if (clamped === current.length) return current;
      if (clamped < current.length) return current.slice(0, clamped);
      return [...current, ...createEmptyTickets(clamped - current.length)];
    });
  };

  /** Requirement set for one ticket, derived from offer flags + its congregation. */
  const optionsFor = (index: number) => {
    const congregation = congregations.find(
      (candidate) => candidate.id === tickets[index]?.congregationId,
    );

    return {
      requiresCongregation,
      requiresDiscountCode: requiresDiscount,
      requiresBeverageSelection: requiresBeverage,
      requiresSouvenirCustomization: requiresSouvenir,
      isDiscountCongregation: congregation
        ? discountCongregationIds.has(congregation.id)
        : false,
      souvenirGroups,
    };
  };

  const missingByTicket = tickets.map((ticket, index) => {
    const options = optionsFor(index);
    const hasAnyRequirement =
      options.requiresCongregation ||
      options.requiresDiscountCode ||
      options.requiresBeverageSelection ||
      options.requiresSouvenirCustomization;
    return hasAnyRequirement ? missingTicketInputs(ticket, options) : [];
  });

  const allComplete = missingByTicket.every((missing) => missing.length === 0);

  const continueToCheckout = () => {
    const draft: OrderDraft = {
      offerId: offer.id,
      offerName: offer.name,
      phaseCode: offer.phaseCode ?? '',
      quantity,
      tickets,
      updatedAt: Date.now(),
    };

    saveOrderDraft(draft);
    saveCatalogSnapshot({ congregations, beverages, souvenirGroups });
    router.push('/checkout');
  };

  return (
    <div className="space-y-6">
      {showPhaseContext ? (
        <Callout tone="progress" title={offer.name}>
          {offer.description ??
            'Complete each ticket below, then continue to checkout.'}
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          step={1}
          title="How many tickets?"
          description="A single order can contain multiple tickets. Each ticket is customised separately."
        />
        <CardBody>
          <QuantityStepper offer={offer} quantity={quantity} onChange={handleQuantity} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          step={2}
          title="Customise each ticket"
          description="Eligibility, benefits and souvenirs are recorded per ticket so nobody is confused about who gets what."
        />
        <CardBody className="space-y-6">
          {tickets.map((ticket, index) => {
            const options = optionsFor(index);
            const missing = missingByTicket[index] ?? [];
            const congregation = congregations.find(
              (candidate) => candidate.id === ticket.congregationId,
            );
            const showDiscountField =
              options.requiresDiscountCode || options.isDiscountCongregation;

            return (
              <section
                key={`ticket-${index}`}
                aria-labelledby={`ticket-heading-${index}`}
                className="rounded-xl border-2 border-ink-200 bg-ink-50/60 p-4 sm:p-5"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3
                    id={`ticket-heading-${index}`}
                    className="text-lg font-black text-ink-950"
                  >
                    Ticket #{index + 1}
                  </h3>
                  <span className="rounded-full bg-ink-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    {offer.name}
                  </span>
                </div>

                <div className="space-y-5">
                  {options.requiresCongregation ? (
                    <CongregationPicker
                      idPrefix={`t${index}`}
                      congregations={congregations}
                      value={ticket.congregationId}
                      onChange={(congregationId) =>
                        // Drop a code that belonged to the previous congregation.
                        setTicket(index, {
                          congregationId,
                          discountCode: discountCongregationIds.has(congregationId)
                            ? ticket.discountCode
                            : '',
                        })
                      }
                    />
                  ) : null}

                  {showDiscountField ? (
                    <div>
                      <Field
                        label="Discount code"
                        name={`ticket-${index}-discount-code`}
                        value={ticket.discountCode}
                        onChange={(value) => setTicket(index, { discountCode: value })}
                        placeholder="Enter your code"
                        required
                        autoComplete="off"
                        hint={
                          congregation?.discountHint ??
                          (options.requiresDiscountCode
                            ? 'This offer requires a dedicated discount code, entered per ticket.'
                            : 'Your congregation is eligible for a dedicated discount code.')
                        }
                      />
                      <p className="mt-1 text-xs text-ink-600">
                        Codes are configured by the committee and validated by the
                        ticketing system when your order is placed.
                      </p>
                    </div>
                  ) : null}

                  {options.requiresBeverageSelection ? (
                    <BeveragePicker
                      idPrefix={`t${index}`}
                      beverages={beverages}
                      value={ticket.beverageOptionId}
                      onChange={(beverageOptionId) => setTicket(index, { beverageOptionId })}
                      tumblerNote={
                        offer.benefitSummary ??
                        'One tumbler is included per Presale ticket.'
                      }
                    />
                  ) : null}

                  {options.requiresSouvenirCustomization ? (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-ink-800">
                        Custom canvas keychain <span className="text-red-700">*</span>
                      </p>
                      <p className="mb-3 text-xs text-ink-600">
                        Every ticket includes one personalised keychain. Choices are made
                        per ticket and cost nothing extra.
                      </p>
                      <SouvenirCustomizer
                        idPrefix={`t${index}`}
                        groups={souvenirGroups}
                        selections={ticket.souvenirSelections}
                        onChange={(groupId, optionId) =>
                          setTicket(index, {
                            souvenirSelections: {
                              ...ticket.souvenirSelections,
                              [groupId]: optionId,
                            },
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>

                {missing.length > 0 ? (
                  <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2">
                    <p className="text-sm font-bold text-amber-900">
                      ⚠ Ticket #{index + 1} still needs:
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-amber-900">
                      {missing.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">
                    ✓ Ticket #{index + 1} is complete.
                  </p>
                )}
              </section>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/tickets"
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-brand-800 underline underline-offset-4"
          >
            ← Back to ticket phases
          </Link>
          <Button size="lg" onClick={continueToCheckout} disabled={!allComplete}>
            Continue to checkout ({quantity} {quantity === 1 ? 'ticket' : 'tickets'})
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
