'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  scanEntry,
  scanExit,
  searchCheckIn,
  type CheckInSearchRow,
  type ScanOutcome,
} from '@/lib/admin-api';
import { describeAttendanceStatus, describeTicketStatus } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/components/ui/cn';
import { QrCameraScanner } from './QrCameraScanner';

type Mode = 'entry' | 'exit';

/** Full-bleed feedback colours keyed to the result tone. */
const RESULT_PANEL: Record<string, string> = {
  success: 'border-emerald-600 bg-emerald-50 text-emerald-950',
  progress: 'border-brand-700 bg-brand-50 text-brand-950',
  warning: 'border-amber-500 bg-amber-50 text-amber-950',
  danger: 'border-red-600 bg-red-50 text-red-950',
  neutral: 'border-ink-400 bg-ink-50 text-ink-900',
};

/** Feedback shown for one scan, whether it succeeded or was rejected. */
interface Feedback {
  status: string;
  ticketCode?: string | null;
  holderName?: string | null;
  /** Server message shown under the banner when it adds detail. */
  note?: string | null;
}

/** Maps backend error codes to the staff-facing vocabulary. */
const ERROR_CODE_TO_STATUS: Record<string, string> = {
  ALREADY_INSIDE: 'ALREADY_INSIDE',
  ALREADY_OUTSIDE: 'ALREADY_OUTSIDE',
  INVALID_TICKET: 'INVALID_TICKET',
  TICKET_NOT_VALID: 'INVALID_TICKET',
  CONGREGATION_REQUIRED: 'CONGREGATION_REQUIRED',
};

/**
 * The scan vocabulary the staff surface must speak (IA doc 18 §10):
 * CHECKED IN / CHECKED OUT / ALREADY INSIDE / ALREADY OUTSIDE / INVALID TICKET.
 *
 * ENTRY MODE / EXIT MODE toggle, large touch targets, immediate unambiguous
 * feedback (CHECKED IN / CHECKED OUT / ALREADY INSIDE / ALREADY OUTSIDE /
 * INVALID TICKET), and a manual ticket-code fallback for when the scanner fails.
 *
 * All attendance state transitions are decided by the backend. This screen only
 * displays what it returns.
 */
export function AttendanceScanner() {
  const [mode, setMode] = useState<Mode>('entry');
  const [manualCode, setManualCode] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CheckInSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (input: { ticketCode?: string; qrToken?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const outcome: ScanOutcome =
          mode === 'entry'
            ? await scanEntry('ticketCode' in input && input.ticketCode
                ? { ticketCode: input.ticketCode }
                : { qrToken: (input as { qrToken: string }).qrToken })
            : await scanExit('ticketCode' in input && input.ticketCode
                ? { ticketCode: input.ticketCode }
                : { qrToken: (input as { qrToken: string }).qrToken });

        setFeedback({
          status: outcome.status,
          ticketCode: outcome.ticketCode,
          holderName: outcome.holderName,
          note: null,
        });
        setManualCode('');
      } catch (caught) {
        const mapped =
          caught instanceof ApiError
            ? ERROR_CODE_TO_STATUS[caught.code]
            : undefined;

        if (mapped) {
          // A rejection is a real, expected result — show it in the feedback
          // banner rather than as an error, and keep the queue moving.
          const details = (caught as ApiError).details;
          setFeedback({
            status: mapped,
            ticketCode:
              typeof details?.ticketCode === 'string' ? details.ticketCode : null,
            holderName: null,
            note: caught instanceof Error ? caught.message : null,
          });
        } else {
          setFeedback(null);
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'The scan could not be processed. Check your connection.',
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [mode],
  );

  /**
   * Hardware scanners type the decoded code and then send Enter. Capturing that
   * pattern lets the same screen work with or without a camera.
   */
  useEffect(() => {
    let buffer = '';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typingInField =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      if (typingInField) return;

      if (event.key === 'Enter') {
        const code = buffer.trim();
        buffer = '';
        if (code.length > 0) {
          event.preventDefault();
          void submit({ ticketCode: code });
        }
        return;
      }

      // Ignore modifier/navigation keys; accumulate the printable rest.
      if (event.key.length === 1) buffer += event.key;
      // Fast typists lose the first characters between frames, so drop the
      // buffer after an idle gap and start clean on the next scan.
      if (buffer.length > 0) {
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          buffer = '';
        }, RESET_MS);
      }
    };

    let resetTimer = 0;
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(resetTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [submit]);

  /** Idle gap that ends a hardware-scanner burst. */
  const RESET_MS = 120;

  const search = async () => {
    if (manualCode.trim().length < 3) {
      setError('Enter at least 3 characters of the ticket code.');
      return;
    }
    setSearching(true);
    setError(null);
    setSearchResults([]);
    try {
      const found = await searchCheckIn(manualCode.trim());
      setSearchResults(found);
      if (found.length === 0) {
        setError('No ticket matched that code.');
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Ticket lookup is unavailable.',
      );
    } finally {
      setSearching(false);
    }
  };

  const status = feedback ? describeAttendanceStatus(feedback.status) : null;

  return (
    <div className="space-y-6">
      {/* Mode toggle — the two largest targets on the screen. */}
      <div
        role="group"
        aria-label="Attendance mode"
        className="grid grid-cols-2 gap-3"
      >
        <Button
          size="xl"
          variant={mode === 'entry' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'entry'}
          onClick={() => {
            setMode('entry');
            setFeedback(null);
          }}
          className={cn(
            'text-xl tracking-wide',
            mode === 'entry' && 'ring-4 ring-brand-300',
          )}
        >
          {mode === 'entry' ? '▶ ' : ''}ENTRY MODE
        </Button>
        <Button
          size="xl"
          variant={mode === 'exit' ? 'primary' : 'secondary'}
          aria-pressed={mode === 'exit'}
          onClick={() => {
            setMode('exit');
            setFeedback(null);
          }}
          className={cn(
            'text-xl tracking-wide',
            mode === 'exit' && 'ring-4 ring-brand-300',
          )}
        >
          {mode === 'exit' ? '▶ ' : ''}EXIT MODE
        </Button>
      </div>

      <p className="text-center text-sm font-semibold uppercase tracking-wide text-ink-600">
        Currently scanning: {mode === 'entry' ? 'ENTRY' : 'EXIT'}
      </p>

      {/* Immediate, unambiguous feedback */}
      <div aria-live="assertive" aria-atomic="true">
        {status && feedback ? (
          <div
            className={cn(
              'animate-pulse-ring rounded-2xl border-4 p-8 text-center',
              RESULT_PANEL[status.tone] ?? RESULT_PANEL.neutral,
            )}
          >
            <p className="text-5xl font-black tracking-tight sm:text-6xl">
              <span aria-hidden="true">{status.icon} </span>
              {status.label}
            </p>
            <p className="mt-3 text-base font-semibold sm:text-lg">
              {status.description}
            </p>
            {feedback.holderName ? (
              <p className="mt-4 text-2xl font-bold">{feedback.holderName}</p>
            ) : null}
            <dl className="mx-auto mt-4 max-w-sm space-y-1 text-sm">
              {feedback.ticketCode ? (
                <div className="flex justify-between gap-3">
                  <dt>Ticket</dt>
                  <dd className="font-mono font-bold">{feedback.ticketCode}</dd>
                </div>
              ) : null}
            </dl>
            {feedback.note ? (
              <p className="mt-3 text-sm opacity-80">{feedback.note}</p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-ink-300 bg-white p-8 text-center text-ink-500">
            Waiting for a scan…
          </div>
        )}
      </div>

      {error ? (
        <Callout tone="danger" title="Scan error" role="alert">
          {error}
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title="Scanner"
          description="Start the camera and hold the ticket QR inside the frame, or type the ticket code and press Enter."
        />
        <CardBody className="space-y-4">
          <QrCameraScanner
            active={cameraOn}
            disabled={busy}
            onDecode={(decodedText) => {
              // A decoded QR is an opaque token, never a ticket code: send it as
              // qrToken so the backend resolves it by hash.
              void submit({ qrToken: decodedText });
            }}
            onRunningChange={setCameraOn}
          />

          <div>
            <label
              htmlFor="manual-code"
              className="mb-1.5 block text-sm font-semibold text-ink-800"
            >
              Ticket code (manual fallback)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="manual-code"
                ref={manualInputRef}
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submit({ ticketCode: manualCode.trim() });
                  }
                }}
                placeholder="HOS-XXXX"
                className="min-h-[64px] w-full rounded-lg border-2 border-ink-300 px-4 py-3 text-2xl font-mono font-bold tracking-wider"
              />
              <Button
                size="xl"
                onClick={() => void submit({ ticketCode: manualCode.trim() })}
                disabled={busy || manualCode.trim().length === 0}
                className="sm:w-56"
              >
                {busy ? 'Working…' : `Record ${mode.toUpperCase()}`}
              </Button>
            </div>
          </div>

          <details className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink-800">
              Look up a ticket without recording attendance
            </summary>
            <div className="mt-3 space-y-3">
              <Button
                variant="secondary"
                onClick={() => void search()}
                disabled={searching || manualCode.trim().length < 3}
              >
                {searching ? 'Searching…' : 'Search ticket'}
              </Button>
              {searchResults.length > 0 ? (
                <ul className="space-y-2">
                  {searchResults.map((found) => (
                    <li
                      key={found.ticket_code ?? String(found.holder_name_snapshot)}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-4 py-3"
                    >
                      <span>
                        <span className="block font-mono font-bold">
                          {found.ticket_code ?? '—'}
                        </span>
                        <span className="block text-sm text-ink-700">
                          {found.holder_name_snapshot ?? 'Unknown holder'}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {found.offer_name ? (
                          <span className="text-xs text-ink-600">
                            {found.offer_name}
                          </span>
                        ) : null}
                        <StatusBadge
                          status={describeTicketStatus(found.status)}
                          size="sm"
                        />
                        {found.is_inside ? (
                          <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-900">
                            Currently inside
                          </span>
                        ) : (
                          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-700">
                            Currently outside
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>

          <div className="rounded-lg border border-ink-200 bg-white px-4 py-3">
            <p className="text-sm font-bold text-ink-900">Possible results</p>
            <ul className="mt-2 grid gap-1 text-sm text-ink-700 sm:grid-cols-2">
              {[
                { label: 'CHECKED IN', hint: 'entry recorded' },
                { label: 'CHECKED OUT', hint: 'exit recorded' },
                { label: 'ALREADY INSIDE', hint: 'no new session' },
                { label: 'ALREADY OUTSIDE', hint: 'no exit recorded' },
                { label: 'INVALID TICKET', hint: 'rejected' },
              ].map((item) => (
                <li key={item.label}>
                  <strong>{item.label}</strong> — {item.hint}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
