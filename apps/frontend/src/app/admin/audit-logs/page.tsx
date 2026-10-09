'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  listAuditLogsDetailed,
  type AuditLogRow,
} from '@/lib/admin-api';
import { clearSession, readSession, type AdminUser } from '@/lib/admin-auth';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdminSessionBar } from '../AdminSessionBar';

/**
 * Audit log viewer.
 *
 * Read-only inspection of who did what. Filters are forwarded to the backend
 * (entityType / action / limit); there is no client-side derivation of which
 * rows to show beyond what the parameters returned. Raw QR tokens are never
 * logged by the backend — attendance attempts record only the ticket code
 * (attendance.routes.ts `logAttendanceAttempt`).
 */
export default function AuditLogsPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [limit, setLimit] = useState('100');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const parsedLimit = Math.min(500, Math.max(1, Number(limit) || 100));
      setRows(
        await listAuditLogsDetailed({
          entityType: entityType.trim() || undefined,
          action: action.trim() || undefined,
          limit: parsedLimit,
        }),
      );
    } catch (e) {
      if (e instanceof AdminAuthError) {
        clearSession();
        setError('Your session has ended. Please sign in again.');
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not load audit logs.');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, action, limit]);

  useEffect(() => {
    const session = readSession();
    if (session) setUser(session.user);
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        setRows(await listAuditLogsDetailed({ limit: 100 }, controller.signal));
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          if (e instanceof AdminAuthError) clearSession();
          setError(e instanceof ApiError ? e.message : 'Could not load audit logs.');
          setRows([]);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Audit logs"
        description="Immutable record of administrative actions — approvals, rejections, scans and configuration changes."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {error ? (
          <Callout tone="danger" title="Could not load audit logs">
            {error}
          </Callout>
        ) : null}

        <Card>
          <CardHeader title="Filters" description="Filters are applied by the backend." />
          <CardBody>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <Field
                label="Entity type"
                name="entityType"
                value={entityType}
                onChange={setEntityType}
                placeholder="e.g. order, ticket"
              />
              <Field
                label="Action"
                name="action"
                value={action}
                onChange={setAction}
                placeholder="e.g. PAYMENT_APPROVED"
              />
              <Field
                label="Limit"
                name="limit"
                type="number"
                value={limit}
                onChange={setLimit}
              />
              <Button type="submit" disabled={loading}>
                {loading ? 'Loading…' : 'Apply'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => {
                  setEntityType('');
                  setAction('');
                  setLimit('100');
                }}
              >
                Clear
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Events" description={`${rows.length} row(s) newest first.`} />
          <CardBody>
            {loading ? (
              <p className="text-sm text-ink-600" role="status">
                Loading audit logs…
              </p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-ink-600">
                No audit events match the current filters.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                      <th scope="col" className="py-2 pr-4">Time</th>
                      <th scope="col" className="py-2 pr-4">Action</th>
                      <th scope="col" className="py-2 pr-4">Entity</th>
                      <th scope="col" className="py-2 pr-4">Actor</th>
                      <th scope="col" className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const open = expanded[row.id] ?? false;
                      const detail = {
                        before: row.before_data,
                        after: row.after_data,
                        requestId: row.request_id,
                        ip: row.ip_address,
                      };
                      return (
                        <tr key={row.id} className="border-b border-ink-100 align-top last:border-0">
                          <td className="whitespace-nowrap py-2 pr-4 text-ink-600">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="py-2 pr-4 font-mono font-semibold text-ink-900">
                            {row.action}
                          </td>
                          <td className="py-2 pr-4 text-ink-700">
                            {row.entity_type ?? '—'}
                            {row.entity_id ? (
                              <span className="block font-mono text-xs text-ink-500">
                                {row.entity_id}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-4 font-mono text-xs text-ink-600">
                            {row.actor_user_id ?? 'system'}
                          </td>
                          <td className="py-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              aria-expanded={open}
                              onClick={() => toggle(row.id)}
                            >
                              {open ? 'Hide' : 'Show'}
                            </Button>
                            {open ? (
                              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-800">
                                {JSON.stringify(detail, null, 2)}
                              </pre>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
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
