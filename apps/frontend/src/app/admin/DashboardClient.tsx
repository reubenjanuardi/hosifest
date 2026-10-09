'use client';

import { useEffect, useState } from 'react';
import { ApiError, getSalesPhases, getTicketOffers, EVENT_SLUG } from '@/lib/api';
import { AdminAuthError, getPaymentsReport, getSalesReport, listConfigResource, type ConfigResource, type SalesReport } from '@/lib/admin-api';
import { readSession, clearSession, type AdminUser } from '@/lib/admin-auth';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { AdminSessionBar } from './AdminSessionBar';

/**
 * Admin dashboard shell.
 *
 * Every figure below is read from the backend at runtime — quotas, phase windows,
 * sold counts and payment totals are configuration and history, never literals.
 * The backend remains authoritative for authorization: this screen only decides
 * which controls to render based on the permissions the backend returned.
 */
interface DashboardData {
  phases: Awaited<ReturnType<typeof getSalesPhases>>;
  offers: Awaited<ReturnType<typeof getTicketOffers>>;
  salesReport: SalesReport | null;
  paymentsReport: { ordersByStatus?: { order_status: string; orders: number; amount: number }[]; paymentsByStatus?: { payment_status: string; payments: number; amount: number }[] } | null;
  errors: Record<string, string>;
}

export function DashboardClient() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const session = readSession();
      if (!session) {
        // Guard in layout redirects; bail out here too in case of race.
        if (!cancelled) setError('Not signed in.');
        if (!cancelled) setLoading(false);
        return;
      }
      setUser(session.user);
      const controller = new AbortController();
      const settle = async <T,>(key: string, run: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          return await run();
        } catch (e) {
          if (e instanceof AdminAuthError) {
            clearSession();
            if (!cancelled) setError('Your session has ended. Redirecting to sign-in…');
            throw e;
          }
          if (!cancelled) {
            setError(
              (prev) =>
                prev ??
                (e instanceof ApiError ? e.message : 'Some data could not be loaded.'),
            );
          }
          return fallback;
        }
      };
      try {
        const [phases, offers, sales, payments] = await Promise.all([
                settle('phases', () => getSalesPhases(EVENT_SLUG, 'client'), []),
                settle('offers', () => getTicketOffers(EVENT_SLUG, 'client'), []),
                settle('sales', () => getSalesReport(EVENT_SLUG), {} as SalesReport),
                settle('payments', () => getPaymentsReport(EVENT_SLUG), null),
              ]);
        if (!cancelled) {
          setData({ phases, offers, salesReport: sales, paymentsReport: payments, errors: {} });
        }
      } catch {
        // Auth failure already handled above.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Dashboard" />
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Card>
            <CardBody>
              <p className="text-sm text-ink-600" role="status">
                Loading dashboard…
              </p>
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Dashboard" />
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <Callout tone="danger" title="Could not load dashboard">
            {error}
          </Callout>
        </div>
      </>
    );
  }

  const phases = data?.phases ?? [];
  const offers = data?.offers ?? [];
  const activePhase = phases.find((p) => p.isActive) ?? null;
  const hasConfigWrite = user?.permissions.includes('config:write') ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Dashboard"
        description="Live status for the current sales phase, ticket capacity and payments."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {error ? (
          <Callout tone="warning" title="Partial data">
            {error} Some figures below may be incomplete.
          </Callout>
        ) : null}

        {/* Current sales phase */}
        <Card>
          <CardHeader title="Current sales phase" description="Read from the backend." />
          <CardBody>
            {phases.length === 0 ? (
              <p className="text-sm text-ink-600">No sales phases configured.</p>
            ) : activePhase ? (
              <div>
                <p className="text-lg font-bold text-ink-900">{activePhase.name}</p>
                <p className="mt-1 text-sm text-ink-600">
                  Window: {formatWindow(activePhase.startsAt, activePhase.endsAt)}
                </p>
                {activePhase.description ? (
                  <p className="mt-2 text-sm text-ink-700">{activePhase.description}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-ink-600">
                No phase is currently active. Configured phases:{' '}
                {phases.map((p) => p.name).join(', ')}
              </p>
            )}
          </CardBody>
        </Card>

        {/* Ticket offers with quota / sold */}
        <Card>
          <CardHeader
            title="Ticket offers"
            description="Quota and sold counts come from the backend; nothing is computed here."
          />
          <CardBody>
            {offers.length === 0 ? (
              <p className="text-sm text-ink-600">No ticket offers configured.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      <th scope="col" className="py-2 pr-4">Offer</th>
                      <th scope="col" className="py-2 pr-4">Phase</th>
                      <th scope="col" className="py-2 pr-4">Price</th>
                      <th scope="col" className="py-2 pr-4">Quota</th>
                      <th scope="col" className="py-2 pr-4">Sold</th>
                      <th scope="col" className="py-2">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((offer) => (
                      <tr key={offer.id} className="border-b border-ink-100 last:border-0">
                        <td className="py-2 pr-4 font-semibold text-ink-900">{offer.name}</td>
                        <td className="py-2 pr-4 text-ink-600">{offer.phaseCode ?? '—'}</td>
                        <td className="py-2 pr-4 text-ink-700">{offer.priceLabel ?? formatAmount(offer.displayPrice, offer.currency)}</td>
                        <td className="py-2 pr-4 text-ink-700">{offer.quotaTotal ?? '—'}</td>
                        <td className="py-2 pr-4 text-ink-700">{offer.soldCount ?? '—'}</td>
                        <td className="py-2 text-ink-700">{offer.quotaRemaining ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {hasConfigWrite ? (
              <p className="mt-4 text-xs text-ink-500">
                You have config:write — configuration editing is available on the resource screens.
              </p>
            ) : (
              <p className="mt-4 text-xs text-ink-500">
                Read-only view. Configuration editing requires config:write.
              </p>
            )}
          </CardBody>
        </Card>

        {/* Orders / payments by status */}
        <Card>
          <CardHeader title="Orders and payments" description="Aggregated by the reporting service." />
          <CardBody>
            {!data?.paymentsReport ? (
              <p className="text-sm text-ink-600">Payment breakdown unavailable.</p>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                <StatusTable
                  title="Orders by status"
                  rows={(data.paymentsReport.ordersByStatus ?? []).map((r) => ({
                    label: r.order_status,
                    count: r.orders,
                    amount: r.amount,
                  }))}
                />
                <StatusTable
                  title="Payments by status"
                  rows={(data.paymentsReport.paymentsByStatus ?? []).map((r) => ({
                    label: r.payment_status,
                    count: r.payments,
                    amount: r.amount,
                  }))}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function StatusTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; amount: number }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink-600">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-600">No data.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between">
              <span className="text-ink-700">{row.label}</span>
              <span className="font-semibold text-ink-900">
                {row.count} · {formatAmount(row.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWindow(start?: string | null, end?: string | null): string {
  if (!start && !end) return 'Not set';
  const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : '—');
  return `${fmt(start)} → ${fmt(end)}`;
}

function formatAmount(value?: number | null, currency?: string | null): string {
  if (value === null || value === undefined) return '—';
  return currency ? `${value.toLocaleString()} ${currency}` : value.toLocaleString();
}