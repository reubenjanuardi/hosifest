'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  approvePayment,
  getPaymentProofUrl,
  listOrdersForReview,
  rejectPayment,
  type ReviewQueueRow,
} from '@/lib/admin-api';
import { clearSession, readSession, type AdminUser } from '@/lib/admin-auth';
import { describeOrderStatus, formatDateTime, formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AdminSessionBar } from '../AdminSessionBar';

type LastAction =
  | { orderId: string; kind: 'approved'; transitioned: boolean; tickets: string[] }
  | { orderId: string; kind: 'rejected'; transitioned: boolean };

export default function PaymentReviewPage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Proof preview state (short-lived presigned URL, never cached).
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  // Action state: per-order pending flag + reject reason box.
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const canReview = user?.permissions.includes('payment:review') ?? false;

  const load = useCallback(async () => {
    const session = readSession();
    if (!session) {
      setError('Not signed in.');
      setLoading(false);
      return;
    }
    setUser(session.user);
    setLoading(true);
    setError(null);
    try {
      const queue = await listOrdersForReview();
      setRows(queue);
    } catch (e) {
      if (e instanceof AdminAuthError) {
        clearSession();
        setError('Your session has ended. Redirecting to sign-in…');
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not load the review queue.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openProof = useCallback(async (row: ReviewQueueRow) => {
    if (!row.payment_id) return;
    setProofOrderId(row.id);
    setProofUrl(null);
    setProofError(null);
    setProofLoading(true);
    try {
      const result = await getPaymentProofUrl(row.payment_id);
      setProofUrl(result.url);
    } catch (e) {
      setProofError(
        e instanceof ApiError ? e.message : 'Could not open the payment proof.',
      );
    } finally {
      setProofLoading(false);
    }
  }, []);

  const closeProof = useCallback(() => {
    setProofOrderId(null);
    setProofUrl(null);
    setProofError(null);
  }, []);

  async function handleApprove(orderId: string) {
    setActingId(orderId);
    setActionError(null);
    setLastAction(null);
    try {
      const result = await approvePayment(orderId);
      setLastAction({
        orderId: result.orderId,
        kind: 'approved',
        transitioned: result.transitioned,
        tickets: result.issuedTicketCodes ?? [],
      });
      // Refresh so processed rows leave the queue.
      await load();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : 'Approval failed. Please try again.',
      );
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(orderId: string) {
    if (rejectReason.trim().length < 3) {
      setActionError('Give a reason of at least 3 characters so the customer knows what to fix.');
      return;
    }
    setActingId(orderId);
    setActionError(null);
    setLastAction(null);
    try {
      const result = await rejectPayment(orderId, rejectReason.trim());
      setLastAction({
        orderId: result.orderId,
        kind: 'rejected',
        transitioned: result.transitioned,
      });
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : 'Rejection failed. Please try again.',
      );
    } finally {
      setActingId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Payment review"
        description="Finance verifies transfer proofs here. Approving issues tickets; rejecting returns the order so the customer can re-upload."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        {loading ? (
          <Card>
            <CardBody>
              <p className="text-sm text-ink-600" role="status">
                Loading review queue…
              </p>
            </CardBody>
          </Card>
        ) : error ? (
          <Callout tone="danger" title="Could not load review queue">
            {error}
          </Callout>
        ) : (
          <>
            {lastAction && (
              <Callout
                tone="success"
                title={
                  lastAction.kind === 'approved'
                    ? lastAction.transitioned
                      ? 'Payment approved — tickets issued'
                      : 'Already processed (repeat approval)'
                    : 'Payment rejected'
                }
              >
                {lastAction.kind === 'approved' ? (
                  <>
                    {!lastAction.transitioned &&
                      'This order was already approved earlier; no new tickets were issued. '}
                    {lastAction.tickets.length > 0 && (
                      <>Tickets: {lastAction.tickets.join(', ')}.</>
                    )}
                  </>
                ) : (
                  'The customer can submit a new proof.'
                )}
              </Callout>
            )}

            {actionError && (
              <Callout tone="danger" title="Action failed">
                {actionError}
              </Callout>
            )}

            {!canReview && (
              <Callout tone="warning" title="Read-only">
                Your role lacks payment:review, so approve/reject calls will be rejected by
                the backend.
              </Callout>
            )}

            <Card>
              <CardHeader
                title="Awaiting decision"
                description={`${rows.length} order(s) in WAITING_PAYMENT or PAYMENT_REVIEW.`}
              />
              <CardBody>
                {rows.length === 0 ? (
                  <p className="text-sm text-ink-600">
                    The queue is empty — no orders need a payment decision right now.
                  </p>
                ) : (
                  <ul className="space-y-4">
                    {rows.map((row) => {
                      const status = describeOrderStatus(row.status);
                      const busy = actingId === row.id;
                      return (
                        <li
                          key={row.id}
                          className="rounded-lg border border-ink-200 p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-ink-900">
                                {row.order_number}
                                <span className="ml-2 font-normal text-ink-600">
                                  {row.customer_name}
                                </span>
                              </p>
                              <p className="mt-1 text-sm text-ink-600">
                                {formatMoney(row.total_amount)} ·{' '}
                                {row.payment_method ?? 'no payment yet'}
                                {row.external_reference
                                  ? ` · ref ${row.external_reference}`
                                  : ''}
                              </p>
                              <p className="mt-1 text-xs text-ink-500">
                                Placed {formatDateTime(row.created_at)}
                                {row.submitted_at &&
                                  ` · proof submitted ${formatDateTime(row.submitted_at)}`}
                                {row.expires_at &&
                                  ` · window ends ${formatDateTime(row.expires_at)}`}
                              </p>
                            </div>
                            <StatusBadge status={status} size="sm" />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {row.payment_id && row.proof_file_key ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => openProof(row)}
                              >
                                View proof
                              </Button>
                            ) : (
                              <span className="text-xs text-ink-500">
                                No proof uploaded yet.
                              </span>
                            )}
                            {canReview && row.status === 'PAYMENT_REVIEW' && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => handleApprove(row.id)}
                                >
                                  {busy ? 'Working…' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy}
                                  onClick={() =>
                                    setRejectTarget(
                                      rejectTarget === row.id ? null : row.id,
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>

                          {/* Proof preview for this row */}
                          {proofOrderId === row.id && (
                            <div className="mt-3 rounded-lg bg-ink-50 p-3">
                              {proofLoading && (
                                <p className="text-sm text-ink-600" role="status">
                                  Opening proof…
                                </p>
                              )}
                              {proofError && (
                                <Callout tone="danger" title="Proof unavailable">
                                  {proofError}
                                </Callout>
                              )}
                              {proofUrl && (
                                <a
                                  href={proofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm font-semibold text-brand-800 underline underline-offset-4"
                                >
                                  Open proof in a new tab
                                </a>
                              )}
                              <div className="mt-2">
                                <Button size="sm" variant="ghost" onClick={closeProof}>
                                  Close
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Reject reason box for this row */}
                          {rejectTarget === row.id && (
                            <div className="mt-3 space-y-2 rounded-lg bg-ink-50 p-3">
                              <Field
                                label="Rejection reason"
                                name={`reject-reason-${row.id}`}
                                value={rejectReason}
                                onChange={setRejectReason}
                                placeholder="e.g. transfer amount does not match the order total"
                                hint="Sent back to the customer. Minimum 3 characters."
                                required
                                maxLength={1000}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy}
                                  onClick={() => handleReject(row.id)}
                                >
                                  {busy ? 'Working…' : 'Confirm reject'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setRejectTarget(null);
                                    setRejectReason('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
