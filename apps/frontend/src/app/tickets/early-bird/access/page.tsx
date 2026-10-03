import type { Metadata } from 'next';
import Link from 'next/link';
import { getEventCatalog } from '@/lib/api';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Early Bird access' };

/**
 * Gate in front of the restricted Early Bird flow (BR-TKT-04).
 *
 * This is a client-side *access* step, not a security boundary: the backend
 * re-validates phase, offer, congregation and discount on every order. All
 * question content is static copy — no price, code or congregation is hardcoded.
 */
export default async function EarlyBirdAccessPage() {
  const catalog = await getEventCatalog();
  const earlyBirdOffers = catalog.offers.filter(
    (offer) => offer.phaseCode === 'EARLY_BIRD',
  );
  const hasEarlyBird = earlyBirdOffers.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Restricted"
        title="Early Bird access"
        description="Early Bird is a controlled offer for eligible congregations. Please confirm how you were invited before continuing."
      />

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <Callout tone="warning" title="Controlled offer — handle with care">
          Early Bird is not a public sale. Access is intended for congregations that
          received an invitation. If you are not sure whether you qualify, please ask
          your congregation contact before ordering.
        </Callout>

        {!hasEarlyBird ? (
          <Callout tone="danger" title="Early Bird is not available right now">
            There are no Early Bird offers available for this event at the moment.
          </Callout>
        ) : null}

        <Card>
          <CardHeader
            title="Before you continue"
            description="Three quick checks."
          />
          <CardBody>
            <ol className="list-decimal space-y-3 pl-5 text-ink-700">
              <li>
                <strong>Your congregation is on the eligibility list.</strong> You will
                choose your congregation in the next step. The list is maintained by the
                committee.
              </li>
              <li>
                <strong>You have your discount code, if you are entitled to one.</strong>{' '}
                Some congregations require a dedicated code. Codes are issued by the
                committee and are entered per ticket — one code does not cover a whole
                order.
              </li>
              <li>
                <strong>You can pay within the payment window.</strong> Your order
                reserves tickets only for the payment window shown after checkout.
              </li>
            </ol>
          </CardBody>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/tickets/early-bird"
            aria-disabled={!hasEarlyBird}
            className={[
              'inline-flex min-h-[52px] items-center rounded-lg px-6 py-3 font-semibold',
              hasEarlyBird
                ? 'bg-accent-600 text-white hover:bg-accent-500'
                : 'pointer-events-none bg-ink-300 text-ink-600',
            ].join(' ')}
          >
            {hasEarlyBird
              ? 'Continue to Early Bird selection'
              : 'Early Bird unavailable'}
          </Link>
          <Link
            href="/tickets"
            className="inline-flex min-h-[52px] items-center rounded-lg border border-ink-300 bg-white px-6 py-3 font-semibold text-ink-900 hover:bg-ink-100"
          >
            Back to ticket phases
          </Link>
        </div>

        <p className="text-sm text-ink-600">
          Availability note: this page lists what the ticketing system currently reports.
          It does not reserve anything — your order is only confirmed once you complete
          checkout and the server accepts it.
        </p>
      </div>
    </>
  );
}
