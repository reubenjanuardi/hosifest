import { getTicket } from '@/lib/api';
import { describeTicketStatus, formatDateTime } from '@/lib/format';
import { buildQrDataUrl } from '@/lib/qr';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ ticketCode: string }>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-ink-100 py-2.5 last:border-0">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className="text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}

/**
 * E-ticket page (IA doc 18 §8): event, ticket code, QR, holder name snapshot,
 * ticket type and status.
 *
 * The QR token is only encoded into an image — it is never displayed as text.
 */
export default async function TicketPage({ params }: PageProps) {
  const { ticketCode } = await params;
  const decodedTicketCode = decodeURIComponent(ticketCode);

  let ticket: Awaited<ReturnType<typeof getTicket>>;
  try {
    ticket = await getTicket(decodedTicketCode);
  } catch {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <Callout tone="danger" title="Ticket not found">
          We could not load ticket{' '}
          <span className="font-mono font-semibold">{decodedTicketCode}</span>. Please check the
          code and try again.
        </Callout>
      </div>
    );
  }

  // Prefer a server-rendered QR image; fall back to a token only if that is absent.
  const qrPayload = ticket.qrImageUrl ?? null;
  const qrToken = ticket.qrToken ?? ticket.qrPayload ?? null;
  const qrDataUrl = qrPayload ?? (qrToken ? await buildQrDataUrl(qrToken) : null);

  const status = describeTicketStatus(ticket.status);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <Card as="section">
        <CardHeader
          title={ticket.eventName ?? ticket.event?.name ?? 'HOSIFEST'}
          description="Show this QR at the entrance. The same code is used for entry and exit."
        />
        <CardBody className="space-y-6">
          <div className="flex justify-center">
            {qrDataUrl ? (
              // Data URL produced on the server; the QR token itself is never shown.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={`QR code for ticket ${ticket.ticketCode}`}
                width={320}
                height={320}
                className="h-auto w-full max-w-[320px] rounded-xl border border-ink-200 bg-white p-3"
              />
            ) : (
              <div className="rounded-xl border-2 border-dashed border-red-400 bg-red-50 p-8 text-center text-sm font-semibold text-red-900">
                ⚠ No QR code is available for this ticket. Please see the committee desk
                for assistance.
              </div>
            )}
          </div>

          <p className="text-center text-xs text-ink-600">
            Keep this screen open or take a screenshot. Do not share your QR with anyone
            other than the person attending.
          </p>

          <dl>
            <DetailRow label="Ticket code" value={ticket.ticketCode} />
            <DetailRow
              label="Holder name (snapshot)"
              value={ticket.holderNameSnapshot ?? '—'}
            />
            <DetailRow
              label="Ticket type"
              value={ticket.ticketTypeName ?? ticket.offerName ?? '—'}
            />
            {ticket.congregationName ? (
              <DetailRow label="Congregation" value={ticket.congregationName} />
            ) : null}
            {ticket.beverageOptionName ? (
              <DetailRow label="Beverage benefit" value={ticket.beverageOptionName} />
            ) : null}
            <DetailRow label="Issued" value={formatDateTime(ticket.issuedAt)} />
          </dl>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
            <StatusBadge status={status} size="lg" />
            <span className="text-sm text-ink-700">{status.description}</span>
          </div>
        </CardBody>
      </Card>

      <Callout tone="progress" title="Entry, exit and re-entry">
        This one ticket covers both entry and exit. Every movement is scanned. If you
        leave and come back, simply scan the same QR again — re-entry is allowed.
      </Callout>
    </div>
  );
}
