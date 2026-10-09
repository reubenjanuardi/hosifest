'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EVENT_SLUG } from '@/lib/api';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  getAttendanceReport,
  getBeverageReport,
  getDiscountsReport,
  getPaymentsReport,
  getSalesReport,
  getSouvenirReport,
  getTicketsReport,
} from '@/lib/admin-api';
import { readSession, clearSession, type AdminUser } from '@/lib/admin-auth';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { AdminSessionBar } from '../AdminSessionBar';

type ReportKey = 'sales' | 'payments' | 'attendance' | 'souvenir' | 'beverage' | 'discounts' | 'tickets';

type Row = Record<string, unknown>;

const TABS: { key: ReportKey; label: string }[] = [
  { key: 'sales', label: 'Sales' },
  { key: 'payments', label: 'Payments' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'souvenir', label: 'Souvenir' },
  { key: 'beverage', label: 'Beverage' },
  { key: 'discounts', label: 'Discounts' },
  { key: 'tickets', label: 'Tickets' },
];

const FETCHERS: Record<ReportKey, (slug?: string) => Promise<unknown>> = {
  sales: (s) => getSalesReport(s),
  payments: (s) => getPaymentsReport(s),
  attendance: (s) => getAttendanceReport(s),
  souvenir: (s) => getSouvenirReport(s),
  beverage: (s) => getBeverageReport(s),
  discounts: (s) => getDiscountsReport(s),
  tickets: (s) => getTicketsReport(s),
};

/** Flatten the two composite payloads into plain row arrays. */
function normalize(key: ReportKey, raw: unknown): { rows: Row[]; summary?: Row } {
  if (raw == null) return { rows: [] };
  if (Array.isArray(raw)) return { rows: raw as Row[] };
  const obj = raw as Record<string, unknown>;
  if (key === 'payments') {
    const orders = (obj.ordersByStatus ?? []) as Row[];
    const payments = (obj.paymentsByStatus ?? []) as Row[];
    return {
      rows: [
        ...orders.map((r) => ({
          section: 'orders',
          status: r.order_status,
          count: r.orders,
          amount: r.amount,
        })),
        ...payments.map((r) => ({
          section: 'payments',
          status: r.payment_status,
          count: r.payments,
          amount: r.amount,
        })),
      ],
    };
  }
  if (key === 'attendance') {
    return {
      rows: ((obj.tickets ?? []) as Row[]),
      summary: (obj.summary ?? undefined) as Row | undefined,
    };
  }
  return { rows: [] };
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toCSV(rows: Row[], columns: string[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportsClient() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [tab, setTab] = useState<ReportKey>('sales');
  const [eventSlug, setEventSlug] = useState(EVENT_SLUG);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(
    async (reportKey: ReportKey, slug: string) => {
      setLoading(true);
      setError(null);
      setFilter('');
      setSortKey(null);
      try {
        const slugArg = slug.trim() === '' ? undefined : slug.trim();
        const raw = await FETCHERS[reportKey](slugArg);
        const { rows: normalized, summary: sum } = normalize(reportKey, raw);
        setRows(normalized);
        setSummary(sum);
      } catch (e) {
        if (e instanceof AdminAuthError) {
          clearSession();
          setError('Your session has ended. Please sign in again.');
        } else {
          setError(e instanceof ApiError ? e.message : 'Could not load this report.');
        }
        setRows([]);
        setSummary(undefined);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const session = readSession();
    if (session) setUser(session.user);
    void load('sales', EVENT_SLUG);
  }, [load]);

  const switchTab = (key: ReportKey) => {
    setTab(key);
    void load(key, eventSlug);
  };

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
    return [...keys];
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter((r) => Object.values(r).some((v) => formatCell(v).toLowerCase().includes(q)));
    }
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av;
        }
        const as = formatCell(av);
        const bs = formatCell(bv);
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
      });
    }
    return out;
  }, [rows, filter, sortKey, sortDir]);

  const toggleSort = (col: string) => {
    if (sortKey !== col) {
      setSortKey(col);
      setSortDir('asc');
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  const hasReportRead = user?.permissions.includes('report:read') ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Reports"
        description="Operational reports aggregated from immutable history. Source: GET /admin/reports/{type}."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {!hasReportRead ? (
          <Callout tone="warning" title="Permission required">
            This screen calls endpoints guarded by report:read. The backend enforces it; a 403 means
            the signed-in role lacks that capability.
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="danger" title="Could not load report">
            {error}
          </Callout>
        ) : null}

        <Card>
          <CardHeader title="Filters" description="Scoped per event, mirroring the ?eventSlug= query param." />
          <CardBody>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink-700">Event slug</span>
                <input
                  value={eventSlug}
                  onChange={(e) => setEventSlug(e.target.value)}
                  placeholder={EVENT_SLUG}
                  className="min-h-[44px] rounded-lg border border-ink-300 px-3 text-sm text-ink-900"
                />
              </label>
              <Button variant="secondary" onClick={() => void load(tab, eventSlug)} disabled={loading}>
                Reload
              </Button>
              <Button
                variant="secondary"
                disabled={loading || visibleRows.length === 0 || columns.length === 0}
                onClick={() => downloadCSV(`${tab}-report.csv`, toCSV(visibleRows, columns))}
              >
                Download CSV
              </Button>
            </div>
          </CardBody>
        </Card>

        <div role="tablist" aria-label="Report types" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => switchTab(t.key)}
              className={[
                'min-h-[44px] rounded-lg px-4 text-sm font-semibold transition-colors',
                tab === t.key
                  ? 'bg-brand-700 text-white'
                  : 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-100',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>

        {summary && Object.keys(summary).length > 0 ? (
          <Card>
            <CardHeader title="Summary" description="Aggregates returned alongside the row data." />
            <CardBody>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(summary).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-ink-200 p-3">
                    <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{k}</dt>
                    <dd className="mt-1 text-lg font-bold text-ink-900">{formatCell(v)}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={`${TABS.find((t) => t.key === tab)?.label} report`}
            description={
              loading
                ? 'Loading…'
                : `${visibleRows.length} of ${rows.length} rows`
            }
          />
          <CardBody>
            <div className="mb-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink-700">Filter rows</span>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Type to filter…"
                  className="min-h-[44px] max-w-sm rounded-lg border border-ink-300 px-3 text-sm text-ink-900"
                />
              </label>
            </div>
            {loading ? (
              <p className="text-sm text-ink-600" role="status">
                Loading report…
              </p>
            ) : visibleRows.length === 0 || columns.length === 0 ? (
              <p className="text-sm text-ink-600">No rows.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      {columns.map((col) => (
                        <th key={col} scope="col" className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => toggleSort(col)}
                            className="font-bold uppercase tracking-wide hover:text-ink-900"
                            title={`Sort by ${col}`}
                          >
                            {col}
                            {sortKey === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, i) => (
                      <tr key={i} className="border-b border-ink-100 last:border-0">
                        {columns.map((col) => (
                          <td key={col} className="py-2 pr-4 text-ink-700">
                            {formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
