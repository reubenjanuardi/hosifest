'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  recordAttendance,
  searchTicketForAttendance,
  type AttendanceResult,
  type CheckInSearchResult,
} from '@/lib/api';
import { describeAttendanceStatus, describeTicketStatus } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/components/ui/cn';

type Mode = 'entry' | 'exit';

/** Full-bleed feedback colours keyed to the result tone. */
const RESULT_PANEL: Record<string, string> = {
  success: 'border-emerald-600 bg-emerald-50 text-emerald-950',
  progress: 'border-brand-700 bg-brand-50 text-brand-950',
  warning: 'border-amber-500 bg-amber-50 text-amber-950',
  danger: 'border-red-600 bg-red-50 text-red-950',
  neutral: 'border-ink-400 bg-ink-50 text-ink-900',
};

/**
 * Attendance scanning screen (IA doc 18 §10).
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
  const [scannerBuffer, setScannerBuffer] = useState('');
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CheckInSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (input: { ticketCode?: string; qrToken?: string }) => {
      setBusy(true);
      setError(null);
      try {
        const outcome = await recordAttendance(mode, input);
        setResult(outcome);
        setManualCode('');
        setScannerBuffer('');
      } catch (caught) {
        setResult(null);
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'The scan could not be processed. Check your connection.',
        );
      } finally {
        setBusy(false);
      }
    },
    [mode],
  );

  /**
   * Hardware scanners type the decoded QR and then send Enter. Capturing that
   * pattern lets the same screen work with or without a camera.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') {
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
          setScannerBuffer((current) => current + event.key);
        }
        return;
      }
      if (scannerBuffer.trim().length > 0) {
        event.preventDefault();
        void submit({ ticketCode: scannerBuffer.trim() });
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scannerBuffer, submit]);

  const search = async () => {
    if (manualCode.trim().length < 3) {
      setError('Enter at least 3 characters of the ticket code.');
      return;
    }
    setSearching(true);
    setError(null);
    setSearchResults([]);
    try {
      const found = await searchTicketForAttendance(manualCode.trim());
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

  const status = result ? describeAttendanceStatus(result.status) : null;

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
            setResult(null);
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
            setResult(null);
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
        {status && result ? (
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
            {result.holderNameSnapshot ? (
              <p className="mt-4 text-2xl font-bold">{result.holderNameSnapshot}</p>
            ) : null}
            <dl className="mx-auto mt-4 max-w-sm space-y-1 text-sm">
              {result.ticketCode ? (
                <div className="flex justify-between gap-3">
                  <dt>Ticket</dt>
                  <dd className="font-mono font-bold">{result.ticketCode}</dd>
                </div>
              ) : null}
              {result.ticketTypeName ? (
                <div className="flex justify-between gap-3">
                  <dt>Type</dt>
                  <dd className="font-bold">{result.ticketTypeName}</dd>
                </div>
              ) : null}
            </dl>
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
          description="Point the scanner at the ticket QR, or type the ticket code and press Enter."
        />
        <CardBody className="space-y-4">
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
              <Button variant="secondary" onClick={() => void search()} disabled={searching}>
                {searching ? 'Searching…' : 'Search ticket'}
              </Button>
              {searchResults.length > 0 ? (
                <ul className="space-y-2">
                  {searchResults.map((found) => (
                    <li
                      key={found.ticketCode}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-4 py-3"
                    >
                      <span>
                        <span className="block font-mono font-bold">
                          {found.ticketCode}
                        </span>
                        <span className="block text-sm text-ink-700">
                          {found.holderNameSnapshot ?? 'Unknown holder'}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge
                          status={describeTicketStatus(found.status)}
                          size="sm"
                        />
                        {found.currentlyInside ? (
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
