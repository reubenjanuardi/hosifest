import type { Metadata } from 'next';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'FAQ' };

/**
 * FAQ explains process and expectations only.
 *
 * Deliberately contains no prices, quotas, dates, discount codes or congregation
 * names: those are configurable and are only ever shown from API responses.
 */
const FAQ_ITEMS: { question: string; answer: React.ReactNode }[] = [
  {
    question: 'What are the sales phases?',
    answer: (
      <>
        <p>
          Tickets are sold in three phases: <strong>Early Bird</strong>,{' '}
          <strong>Presale</strong> and <strong>Normal</strong>. Each phase has its own
          dates and its own set of offers, configured by the organising committee. The{' '}
          <a href="/event" className="font-semibold text-brand-800 underline underline-offset-4">
            Event page
          </a>{' '}
          shows the current schedule.
        </p>
      </>
    ),
  },
  {
    question: 'Why can I not see Early Bird on the ticket page?',
    answer: (
      <p>
        Early Bird is a controlled offer and is not promoted as a broadly public sale.
        It is only available to eligible congregations through direct access. If you
        believe you are eligible, use the Early Bird entry link on the{' '}
        <a href="/tickets" className="font-semibold text-brand-800 underline underline-offset-4">
          tickets page
        </a>
        .
      </p>
    ),
  },
  {
    question: 'Can I buy more than one ticket?',
    answer: (
      <p>
        Yes. A single order may contain multiple tickets, and each ticket can have its
        own congregation, beverage and souvenir choices. Per-order purchase limits, if
        any, are shown on each offer.
      </p>
    ),
  },
  {
    question: 'How do I pay?',
    answer: (
      <p>
        Payment is by QRIS or bank transfer. After placing your order you will see the
        payment instructions for your order, then upload your payment proof on the order
        status page. Our team verifies the proof manually before tickets are issued.
      </p>
    ),
  },
  {
    question: 'How long do I have to pay?',
    answer: (
      <p>
        You have a limited payment window, shown as a live countdown on your order page.
        If the proof is not submitted before the countdown reaches zero, the order
        expires and the ticket reservation is released so it can be sold to someone
        else. The exact deadline for your order is always shown on your order page.
      </p>
    ),
  },
  {
    question: 'What if my payment is rejected?',
    answer: (
      <p>
        A rejected payment cancels the order and releases the reserved tickets
        immediately. You would need to place a new order. Please double-check the amount
        and reference before submitting your proof.
      </p>
    ),
  },
  {
    question: 'What do I get with a Presale ticket?',
    answer: (
      <p>
        One beverage and one tumbler per ticket. Choosing a beverage is mandatory and is
        done per ticket, so everyone in your order can pick a different drink. The
        current beverage list is on the{' '}
        <a href="/benefits" className="font-semibold text-brand-800 underline underline-offset-4">
          benefits page
        </a>
        .
      </p>
    ),
  },
  {
    question: 'Why do I have to customise a keychain?',
    answer: (
      <p>
        Every ticket includes one custom canvas keychain, and customisation is mandatory
        because it is made for that specific ticket. It is free and does not change the
        ticket price. Choices are made per ticket.
      </p>
    ),
  },
  {
    question: 'How do I use my e-ticket?',
    answer: (
      <p>
        After payment is approved, open your e-ticket and show the QR code at the
        entrance. The same QR is used for both entry and exit, and re-entry is allowed —
        simply scan again when you come back in.
      </p>
    ),
  },
  {
    question: 'I forgot my order number.',
    answer: (
      <p>
        Use the{' '}
        <a href="/order/lookup" className="font-semibold text-brand-800 underline underline-offset-4">
          order lookup
        </a>{' '}
        page with the order number and email address you used at checkout.
      </p>
    ),
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="How ticketing, payment and entry work for HOSIFEST."
      />

      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
        <Callout tone="progress" title="Prices and dates are configurable">
          Prices, quotas, phase dates and eligibility are managed by the organising
          committee. Always trust the amounts and availability shown on the ticket and
          checkout pages — they come from the ticketing system at the time you order.
        </Callout>

        <ul className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <li key={item.question}>
              <Card>
                <CardHeader title={item.question} />
                <CardBody className="space-y-2 text-ink-700">{item.answer}</CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
