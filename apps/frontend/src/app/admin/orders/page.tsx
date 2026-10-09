'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  getOrderDetail,
  listOrders,
  runExpireSweep,
  type OrderDetail,
  type OrderRow,
} from '@/lib/admin-api';
import { clearSession, readSession, type AdminUser } from '@/lib/admin-auth';
import { describeOrderStatus, formatDateTime, formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AdminSessionBar } from '../AdminSessionBar';

/**
 * Order list + detail.
 *
 * The status tabs are a client-side filter over the rows the backend returned;
 * they never decide an order's state. All transitions belong to the payment
 * endpoints (see /admin/payments), so this screen is read-only apart from the
 * manual expiry sweep, which the backend documents as safe to repeat.
 */

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'WAITING_PAYMENT', label: 'Waiting payment' },
  { value: 'PAYMENT_REVIEW', label: 'In review' },
  { value: 'PAID', label: 'Paid' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export default function OrdersPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listOrders({ limit: 200 }, signal));
    } catch (e) {
      if (e instanceof AdminAuthError) {
        clearSession();
        setError('Your session has ended. Please sign in again.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not load orders.');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const session = readSession();
    if (session) setUser(session.user);
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openDetail = useCallback(async (orderId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    setSelected(null);
    try {
      setSelected(await getOrderDetail(orderId));
    } catch (e) {
      if (e instanceof AdminAuthError) {
        clearSession();
        setDetailError('Your session has ended. Please sign in again.');
      } else {
        setDetailError(e instanceof ApiError ? e.message : 'Could not load that order.');
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function handleSweep() {
    setSweeping(true);
    setSweepResult(null);
    try {
      const result = await runExpireSweep();
      setSweepResult(
        result.expired === 0
          ? 'No orders were expired — nothing was overdue.'
          : `${result.expired} order(s) moved to EXPIRED.`,
      );
      await load();
    } catch (e) {
      setSweepResult(
        e instanceof ApiError ? e.message : 'The expiry sweep could not be run.',
      );
    } finally {
      setSweeping(false);
    }
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status && row.status !== status) return false;
      if (!term) return true;
      return (
        row.order_number.toLowerCase().includes(term) ||
        row.customer_name.toLowerCase().includes(term) ||
        (row.customer_email ?? '').toLowerCase().includes(term)
      );
    });
  }, [rows, status, search]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Orders"
        description="Every order with its customer, payment state and issued tickets."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {error ? (
          <Callout tone="danger" title="Could not load orders">
            {error}
          </Callout>
        ) : null}

        {sweepResult ? (
          <Callout tone="neutral" title="Expiry sweep" role="status">
            {sweepResult}
          </Callout>
        ) : null}

        <Card>
          <CardHeader
            title="Filters"
            description="Filtering happens on the rows the backend returned; nothing here changes order state."
          />
          <CardBody>
            <div className="space-y-4">
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Filter by order status"
              >
                {STATUS_TABS.map((tab) => {
                  const active = status === tab.value;
                  return (
                    <Button
                      key={tab.value || 'all'}
                      size="sm"
                      variant={active ? 'primary' : 'secondary'}
                      aria-pressed={active}
                      onClick={() => setStatus(tab.value)}
                    >
                      {tab.label}
                    </Button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-ink-800">
                    Search order number or customer
                  </span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="e.g. HSF-2026-0001 or Budi"
                    className="min-h-[44px] rounded-lg border border-ink-300 px-3 py-2 text-base text-ink-900 placeholder:text-ink-400"
                  />
                </label>
                <Button variant="secondary" onClick={() => void load()}>
                  Refresh
                </Button>
                {user?.permissions.includes('order:write') ? (
                  <Button onClick={() => void handleSweep()} disabled={sweeping}>
                    {sweeping ? 'Sweeping…' : 'Run expiry sweep'}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Orders"
            description={`${visible.length} of ${rows.length} shown.`}
          />
          <CardBody>
            {loading ? (
              <p className="text-sm text-ink-600" role="status">
                Loading orders…
              </p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-ink-600">
                No orders match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      <th scope="col" className="py-2 pr-4">Order</th>
                      <th scope="col" className="py-2 pr-4">Customer</th>
                      <th scope="col" className="py-2 pr-4">Status</th>
                      <th scope="col" className="py-2 pr-4">Total</th>
                      <th scope="col" className="py-2 pr-4">Placed</th>
                      <th scope="col" className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.id} className="border-b border-ink-100 last:border-0">
                        <td className="py-2 pr-4 font-semibold text-ink-900">
                          {row.order_number}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {row.customer_name}
                          {row.customer_email ? (
                            <span className="block text-xs text-ink-500">{row.customer_email}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-4">
                          <StatusBadge status={describeOrderStatus(row.status)} size="sm" />
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {formatMoney(row.total_amount)}
                        </td>
                        <td className="py-2 pr-4 text-ink-600">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="py-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void openDetail(row.id)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {detailLoading || detailError || selected ? (
          <Card>
            <CardHeader
              title="Order detail"
              description="Tickets are issued by the backend when payment is approved."
            />
            <CardBody>
              {detailLoading ? (
                <p className="text-sm text-ink-600" role="status">
                  Loading order…
                </p>
              ) : detailError ? (
                <Callout tone="danger" title="Could not load order">
                  {detailError}
                </Callout>
              ) : selected ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-bold text-ink-900">
                        {selected.order_number}
                      </p>
                      <p className="text-sm text-ink-600">
                        {selected.customer_name} · {selected.customer_phone}
                      </p>
                      {selected.customer_email ? (
                        <p className="text-sm text-ink-600">{selected.customer_email}</p>
                      ) : null}
                    </div>
                    <StatusBadge status={describeOrderStatus(selected.status)} />
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Detail label="Subtotal" value={formatMoney(selected.subtotal_amount)} />
                    <Detail label="Discount" value={formatMoney(selected.discount_amount)} />
                    <Detail label="Total" value={formatMoney(selected.total_amount)} />
                    <Detail label="Placed" value={formatDateTime(selected.created_at)} />
                    <Detail
                      label="Payment window ends"
                      value={formatDateTime(selected.expires_at)}
                    />
                    <Detail
                      label="Payment"
                      value={selected.payment_method ?? 'No payment recorded'}
                    />
                  </dl>

                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-ink-600">
                      Tickets
                    </h3>
                    {selected.tickets.length === 0 ? (
                      <p className="mt-2 text-sm text-ink-600">
                        No tickets issued yet.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {selected.tickets.map((ticket) => (
                          <li
                            key={ticket.ticket_code}
                            className="flex flex-wrap justify-between gap-2 border-b border-ink-100 py-1 last:border-0"
                          >
                            <span className="font-mono font-semibold text-ink-900">
                              {ticket.ticket_code}
                            </span>
                            <span className="text-ink-600">{ticket.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelected(null);
                      setDetailError(null);
                    }}
                  >
                    Close detail
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}