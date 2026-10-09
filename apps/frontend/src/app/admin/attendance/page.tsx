'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import {
  AdminAuthError,
  scanEntry,
  scanExit,
  searchCheckIn,
  type CheckInSearchRow,
  type ScanLookup,
  type ScanOutcome,
} from '@/lib/admin-api';
import { clearSession, readSession, type AdminUser } from '@/lib/admin-auth';
import { formatDateTime } from '@/lib/format';
import { QrCameraScanner } from '@/components/attendance/QrCameraScanner';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { AdminSessionBar } from '../AdminSessionBar';

type Mode = 'entry' | 'exit';
type Source = 'qr' | 'code';

interface ScanRecord {
  at: string;
  mode: Mode;
  source: Source;
  status: string;
  ticketCode: string | null;
  message: string;
  ok: boolean;
}

/**
 * Event-day attendance screen.
 *
 * Large touch targets (Button size xl/lg), high-contrast verdict banners and a
 * keyboard-usable manual field. Camera and manual paths share one scan handler:
 * a QR decode submits as `qrToken`, a typed/lookup code as `ticketCode`, so
 * exactly one backend field is ever sent. The backend decides every status; the
 * client only renders what came back.
 */

const HISTORY_LIMIT = 20;

export default function AttendancePage() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [mode, setMode] = useState<Mode>('entry');
  const [manualCode, setManualCode] = useState('');
  const [lookupResults, setLookupResults] = useState<CheckInSearchRow[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [latest, setLatest] = useState<ScanRecord | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>([]);

  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLookup = useRef('');

  useEffect(() => {
    const session = readSession();
    if (session) setUser(session.user);
  }, []);

  useEffect(() => {
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, []);

  const pushRecord = useCallback((record: ScanRecord) => {
    setLatest(record);
    setHistory((prev) => [record, ...prev].slice(0, HISTORY_LIMIT));
  }, []);

  const runScan = useCallback(
    async (lookup: ScanLookup, source: Source) => {
      setScanning(true);
      setScanError(null);
      try {
        const outcome: ScanOutcome =
          mode === 'entry' ? await scanEntry(lookup) : await scanExit(lookup);
        const { status, message, ok } = interpretOutcome(outcome);
        pushRecord({
          at: new Date().toISOString(),
          mode,
          source,
          status,
          ticketCode: outcome.ticketCode ?? codeOf(lookup),
          message,
          ok,
        });
        setManualCode('');
      } catch (e) {
        if (e instanceof AdminAuthError) {
          clearSession();
          setScanError('Your session has ended. Please sign in again.');
        } else {
          setScanError(
            e instanceof ApiError ? e.message : 'The scan could not be recorded. Try again.',
          );
        }
      } finally {
        setScanning(false);
      }
    },
    [mode, pushRecord],
  );

  const onQrDecode = useCallback(
    (decodedText: string) => {
      const token = decodedText.trim();
      if (!token || scanning) return;
      void runScan({ qrToken: token }, 'qr');
    },
    [runScan, scanning],
  );

  const onManualSubmit = useCallback(() => {
    const code = manualCode.trim();
    if (!code || scanning) return;
    void runScan({ ticketCode: code }, 'code');
  }, [manualCode, runScan, scanning]);

  const onLookupChange = useCallback((value: string) => {
    setManualCode(value);
    const term = value.trim();
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (term.length === 0) {
      lastLookup.current = '';
      setLookupResults([]);
      setLookupError(null);
      return;
    }
    lookupTimer.current = setTimeout(async () => {
      if (term === lastLookup.current) return;
      lastLookup.current = term;
      setLookupLoading(true);
      setLookupError(null);
      try {
        setLookupResults(await searchCheckIn(term));
      } catch (e) {
        if (e instanceof AdminAuthError) {
          clearSession();
          setLookupError('Your session has ended. Please sign in again.');
        } else {
          setLookupError(e instanceof ApiError ? e.message : 'Lookup failed.');
        }
        setLookupResults([]);
      } finally {
        setLookupLoading(false);
      }
    }, 350);
  }, []);

  const selectLookup = useCallback(
    (row: CheckInSearchRow) => {
      const code = (row.ticket_code ?? '').trim();
      if (!code) return;
      setManualCode(code);
      setLookupResults([]);
      void runScan({ ticketCode: code }, 'code');
    },
    [runScan],
  );

  const canScan = user?.permissions.includes('attendance:scan') ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Attendance"
        description="Gate scanning for the current event. Camera and manual code both record to the same backend."
      >
        {user ? <AdminSessionBar /> : null}
      </PageHeader>

      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        {!canScan && user ? (
          <Callout tone="warning" title="Read-only">
            Your role lacks attendance:scan, so scan calls will be rejected by the
            backend.
          </Callout>
        ) : null}

        {/* Entry / exit mode toggle — xl targets for gloves and daylight */}
        <Card>
          <CardHeader title="Direction" description="Entry admits, exit releases." />
          <CardBody>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Scan direction">
              <Button
                size="xl"
                variant={mode === 'entry' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'entry'}
                onClick={() => setMode('entry')}
              >
                ▼ ENTRY
              </Button>
              <Button
                size="xl"
                variant={mode === 'exit' ? 'primary' : 'secondary'}
                aria-pressed={mode === 'exit'}
                onClick={() => setMode('exit')}
              >
                ▲ EXIT
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Camera scanner */}
        <Card>
          <CardHeader
            title="Camera scan"
            description="QR decode happens on this device; only the decoded token is submitted."
          />
          <CardBody>
            <QrCameraScanner onDecode={onQrDecode} disabled={scanning || !canScan} active />
            {scanning ? (
              <p className="mt-2 text-base font-semibold text-ink-700" role="status">
                Recording {mode}…
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* Manual fallback — always usable, keyboard-first */}
        <Card>
          <CardHeader
            title="Manual ticket code"
            description="Type, paste or use a handheld scanner wedge. Same recording path as the camera."
          />
          <CardBody>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                onManualSubmit();
              }}
            >
              <label htmlFor="attendance-manual-code" className="text-base font-bold text-ink-900">
                Ticket code
              </label>
              <input
                id="attendance-manual-code"
                type="text"
                value={manualCode}
                onChange={(event) => onLookupChange(event.target.value)}
                placeholder="e.g. TKT-A1B2C3"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="min-h-[64px] w-full rounded-lg border-2 border-ink-400 px-4 py-3 font-mono text-xl text-ink-950 placeholder:text-ink-400"
              />
              <Button
                type="submit"
                size="xl"
                fullWidth
                disabled={scanning || manualCode.trim().length === 0 || !canScan}
              >
                {scanning ? 'Recording…' : `Record ${mode === 'entry' ? 'ENTRY' : 'EXIT'}`}
              </Button>
            </form>

            {lookupLoading ? (
              <p className="mt-3 text-sm text-ink-600" role="status">
                Looking up…
              </p>
            ) : null}
            {lookupError ? (
              <div className="mt-3">
                <Callout tone="danger" title="Lookup failed">
                  {lookupError}
                </Callout>
              </div>
            ) : null}
            {lookupResults.length > 0 ? (
              <ul className="mt-3 space-y-2" aria-label="Matching tickets">
                {lookupResults.map((row, index) => (
                  <li key={`${row.ticket_code ?? 'row'}-${index}`}>
                    <button
                      type="button"
                      onClick={() => selectLookup(row)}
                      disabled={scanning || !row.ticket_code}
                      className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-lg border-2 border-ink-300 bg-white px-4 py-2 text-left text-base hover:border-brand-600 disabled:opacity-50"
                    >
                      <span>
                        <span className="block font-mono font-bold text-ink-950">
                          {row.ticket_code ?? '(no code)'}
                        </span>
                        <span className="block text-sm text-ink-700">
                          {row.holder_name_snapshot ?? '—'}
                          {row.offer_name ? ` · ${row.offer_name}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold text-brand-800">
                        {row.is_inside ? 'INSIDE' : 'OUTSIDE'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>

        {scanError ? (
          <Callout tone="danger" title="Scan failed" role="alert">
            {scanError}
          </Callout>
        ) : null}

        {/* Verdict banner — text + icon, never colour-only */}
        {latest ? (
          <div
            role="status"
            aria-live="polite"
            className={[
              'rounded-xl border-4 px-5 py-6 text-center',
              latest.ok
                ? 'border-emerald-700 bg-emerald-50 text-emerald-950'
                : 'border-red-700 bg-red-50 text-red-950',
            ].join(' ')}
          >
            <p className="text-4xl font-black tracking-tight">
              {latest.ok ? '✓ ' : '✕ '}
              {latest.status}
            </p>
            <p className="mt-2 text-lg font-semibold">{latest.message}</p>
            {latest.ticketCode ? (
              <p className="mt-1 font-mono text-base">{latest.ticketCode}</p>
            ) : null}
            <p className="mt-1 text-sm">
              {latest.mode === 'entry' ? 'Entry' : 'Exit'} ·{' '}
              {latest.source === 'qr' ? 'camera' : 'manual code'}
            </p>
          </div>
        ) : null}

        {/* Recent scans on this device */}
        {history.length > 0 ? (
          <Card>
            <CardHeader
              title="This device, recent scans"
              description="Newest first, kept locally for this session."
            />
            <CardBody>
              <ul className="space-y-2">
                {history.map((record, index) => (
                  <li
                    key={`${record.at}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 py-2 text-base last:border-0"
                  >
                    <span className="font-bold text-ink-900">
                      {record.ok ? '✓ ' : '✕ '}
                      {record.status}
                    </span>
                    <span className="font-mono text-ink-700">
                      {record.ticketCode ?? '—'}
                    </span>
                    <span className="text-sm text-ink-600">
                      {record.mode === 'entry' ? 'entry' : 'exit'} ·{' '}
                      {formatDateTime(record.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/** Renders the backend-decided status verbatim; no client-side derivation. */
function interpretOutcome(outcome: ScanOutcome): {
  status: string;
  message: string;
  ok: boolean;
} {
  const status = String(outcome.status ?? 'UNKNOWN').toUpperCase().replace(/[\s-]+/g, '_');
  switch (status) {
    case 'CHECKED_IN':
      return {
        status: 'CHECKED IN',
        message: ticketLine(outcome, 'Admit. Have a blessed event!'),
        ok: true,
      };
    case 'CHECKED_OUT':
      return {
        status: 'CHECKED OUT',
        message: ticketLine(outcome, 'Exit recorded. Goodbye!'),
        ok: true,
      };
    case 'ALREADY_INSIDE':
      return {
        status: 'ALREADY INSIDE',
        message: ticketLine(outcome, 'This ticket is already inside. Do not admit twice.'),
        ok: false,
      };
    case 'ALREADY_OUTSIDE':
      return {
        status: 'ALREADY OUTSIDE',
        message: ticketLine(outcome, 'This ticket is not inside right now.'),
        ok: false,
      };
    case 'INVALID_TICKET':
      return {
        status: 'INVALID TICKET',
        message: 'No such ticket. Check the code and try again.',
        ok: false,
      };
    default:
      return { status, message: 'Recorded.', ok: false };
  }
}

function ticketLine(outcome: ScanOutcome, suffix: string): string {
  const holder = outcome.holderName ? `${outcome.holderName} — ` : '';
  const code = outcome.ticketCode ? `(${outcome.ticketCode}) ` : '';
  return `${holder}${code}${suffix}`;
}

function codeOf(lookup: ScanLookup): string | null {
  return 'ticketCode' in lookup ? (lookup.ticketCode ?? null) : null;
}
