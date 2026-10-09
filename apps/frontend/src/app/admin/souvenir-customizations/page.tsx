'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  advanceSouvenirStatus,
  listSouvenirCustomizations,
  type SouvenirCustomizationRow,
} from '@/lib/admin-api';
import { clearSession, readSession, type AdminUser } from '@/lib/admin-auth';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdminSessionBar } from '../AdminSessionBar';

/**
 * Souvenir fulfilment queue.
 *
 * The transition table below mirrors the backend's ALLOWED_TRANSITIONS so the
 * operator sees only legal next steps — but the button still calls the endpoint,
 * and a 409 from the backend is surfaced as-is. Nothing is decided locally.
 */
const NEXT_STATUSES: Record<string, string[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['READY'],
  READY: ['HANDED_OVER'],
  HANDED_OVER: [],
  CANCELLED: [],
};

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_PRODUCTION', label: 'In production' },
  { value: 'READY', label: 'Ready' },
  { value: 'HANDED_OVER', label: 'Handed over' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function SouvenirCustomizationsPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rows, setRows] = useState<SouvenirCustomizationRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canWrite = user?.permissions.includes('config:write') ?? false;

  const load = useCallback(
    async (status: string, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        setRows(await listSouvenirCustomizations(status || undefined, signal));
      } catch (e) {
        if (e instanceof AdminAuthError) {
          clearSession();
          setError('Your session has ended. Please sign in again.');
        } else {
          setError(
            e instanceof ApiError ? e.message : 'Could not load souvenir customizations.',
          );
        }
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const session = readSession();
    if (session) setUser(session.user);
    const controller = new AbortController();
    void load('', controller.signal);
    return () => controller.abort();
  }, [load]);

  const applyStatus = useCallback(
    async (id: string, next: string) => {
      setBusyId(id);
      setActionError(null);
      setActionMessage(null);
      try {
        const result = await advanceSouvenirStatus(id, next);
        setActionMessage(`Moved to ${result.status}.`);
        await load(statusFilter);
      } catch (e) {
        if (e instanceof AdminAuthError) {
          clearSession();
          setActionError('Your session has ended. Please sign in again.');
        } else {
          setActionError(e instanceof ApiError ? e.message : 'The status could not be changed.');
        }
      } finally {
        setBusyId(null);
      }
    },
    [load, statusFilter],
  );

  const grouped = useMemo(() => {
    // The list endpoint returns one row per selected option; group by
    // customization id so each order renders as a single card.
    const map = new Map<
      string,
      {
        id: string;
        status: string;
        ticketCode: string | null;
        holder: string | null;
        createdAt: string;
        updatedAt: string;
        selections: SouvenirCustomizationRow[];
      }
    >();
    for (const row of rows) {
      const existing = map.get(row.id);
      if (existing) {
        existing.selections.push(row);
        continue;
      }
      map.set(row.id, {
        id: row.id,
        status: row.status,
        ticketCode: row.ticket_code,
        holder: row.holder_name_snapshot,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        selections: [row],
      });
    }
    return [...map.values()];
  }, [rows]);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Souvenir customizations"
        description="Fulfilment state for every custom souvenir selection. Every move is audited by the backend."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {error ? (
          <Callout tone="danger" title="Could not load customizations">
            {error}
          </Callout>
        ) : null}
        {actionMessage ? (
          <Callout tone="success" title="Updated" role="status">
            {actionMessage}
          </Callout>
        ) : null}
        {actionError ? (
          <Callout tone="danger" title="Action failed" role="alert">
            {actionError}
          </Callout>
        ) : null}
        {user && !canWrite ? (
          <Callout tone="warning" title="Read-only">
            Advancing a status requires config:write; the backend will reject it.
          </Callout>
        ) : null}

        <Card>
          <CardHeader title="Filter" />
          <CardBody>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              {STATUS_FILTERS.map((filter) => {
                const active = statusFilter === filter.value;
                return (
                  <Button
                    key={filter.value || 'all'}
                    size="sm"
                    variant={active ? 'primary' : 'secondary'}
                    aria-pressed={active}
                    onClick={() => {
                      setStatusFilter(filter.value);
                      void load(filter.value);
                    }}
                  >
                    {filter.label}
                  </Button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Fulfilment queue"
            description={`${grouped.length} customization(s) across ${rows.length} option row(s).`}
          />
          <CardBody>
            {loading ? (
              <p className="text-sm text-ink-600" role="status">
                Loading customizations…
              </p>
            ) : grouped.length === 0 ? (
              <p className="text-sm text-ink-600">
                No souvenir customizations for this filter.
              </p>
            ) : (
              <ul className="space-y-4">
                {grouped.map((group) => {
                  const options = NEXT_STATUSES[group.status] ?? [];
                  return (
                    <li key={group.id} className="rounded-lg border border-ink-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono font-bold text-ink-900">
                            {group.ticketCode ?? 'Ticket unavailable'}
                          </p>
                          <p className="mt-1 text-sm text-ink-700">
                            {group.holder ?? '—'}
                          </p>
                          <p className="mt-1 text-xs text-ink-500">
                            Created {formatDateTime(group.createdAt)} · updated{' '}
                            {formatDateTime(group.updatedAt)}
                          </p>
                        </div>
                        <span className="rounded-full border border-ink-300 bg-ink-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-800">
                          {group.status}
                        </span>
                      </div>

                      <ul className="mt-3 space-y-1 text-sm">
                        {group.selections.map((sel, index) => (
                          <li key={`${sel.id}-${index}`} className="text-ink-700">
                            {optionLabel(sel.option_group_snapshot, 'Group')} ·{' '}
                            {optionLabel(sel.option_snapshot, 'Option')}
                            {sel.quantity ? ` × ${sel.quantity}` : ''}
                          </li>
                        ))}
                      </ul>

                      {canWrite && options.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {options.map((next) => (
                            <Button
                              key={next}
                              size="sm"
                              variant={next === 'CANCELLED' ? 'danger' : 'primary'}
                              disabled={busyId === group.id}
                              onClick={() => void applyStatus(group.id, next)}
                            >
                              {busyId === group.id ? 'Working…' : `Mark ${label(next)}`}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function optionLabel(snapshot: Record<string, unknown> | null, fallback: string): string {
  const name = snapshot?.name ?? snapshot?.code ?? snapshot?.title;
  return typeof name === 'string' && name.length > 0 ? name : fallback;
}

function label(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}