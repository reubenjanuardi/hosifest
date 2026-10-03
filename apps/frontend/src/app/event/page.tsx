import type { Metadata } from 'next';
import { getEventCatalog } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { PhaseBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Event' };

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-ink-100 py-2 last:border-0">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className="text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

export default async function EventPage() {
  const catalog = await getEventCatalog();
  const event = catalog.event;

  return (
    <>
      <PageHeader
        eyebrow="Event"
        title={event?.name ?? 'Event details'}
        description={event?.tagline ?? null}
      />

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
        {catalog.failures.event ? (
          <Callout tone="danger" title="Event details unavailable">
            We could not load the event information right now. Please refresh or
            contact the committee.
          </Callout>
        ) : null}

        <Card>
          <CardHeader title="Schedule & venue" />
          <CardBody>
            <dl>
              <DetailRow label="Starts" value={formatDateTime(event?.startsAt)} />
              <DetailRow label="Ends" value={formatDateTime(event?.endsAt)} />
              <DetailRow label="Venue" value={event?.venue || 'To be announced'} />
              <DetailRow label="Address" value={event?.address || 'To be announced'} />
              <DetailRow label="Timezone" value={event?.timezone || '—'} />
            </dl>
          </CardBody>
        </Card>

        {event?.description ? (
          <Card>
            <CardHeader title="About this event" />
            <CardBody className="whitespace-pre-line text-ink-700">{event.description}</CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Sales phases"
            description="Phase boundaries and dates are configured by the committee."
          />
          <CardBody>
            {catalog.phases.length === 0 ? (
              <p className="text-sm text-ink-600">Phase information is unavailable.</p>
            ) : (
              <ul className="space-y-3">
                {catalog.phases.map((phase) => (
                  <li key={phase.id} className="rounded-lg border border-ink-200 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <PhaseBadge code={phase.code} name={phase.name} />
                      {phase.isActive ? (
                        <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                          ✓ Currently active
                        </span>
                      ) : null}
                    </div>
                    {phase.description ? (
                      <p className="mt-2 text-sm text-ink-700">{phase.description}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-ink-600">
                      {formatDateTime(phase.startsAt)} → {formatDateTime(phase.endsAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
