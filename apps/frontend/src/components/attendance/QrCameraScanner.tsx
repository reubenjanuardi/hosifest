'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { cn } from '@/components/ui/cn';

/**
 * Camera QR scanner.
 *
 * Wraps html5-qrcode, which decodes frames locally in the browser — no video
 * frame ever leaves the device and nothing is uploaded to the backend. Only the
 * decoded string is submitted (as `qrToken`).
 *
 * Design constraints for event day:
 * - Camera permission is requested only when the operator explicitly starts the
 *   scanner. Browsers require a user gesture, and an unattended auto-start would
 *   also leave the camera light on with no way to stop it.
 * - A decode fires the callback exactly once per cooldown window, so holding the
 *   phone over one ticket records one entry, not one per frame.
 * - Every failure (no camera, denied permission, insecure origin) degrades to the
 *   manual ticket-code path rather than blocking the queue.
 */
export function QrCameraScanner({
  onDecode,
  onRunningChange,
  disabled,
  active,
}: {
  onDecode: (decodedText: string) => void;
  /** Notified whenever the camera actually starts or stops, so the parent can
      gate further scans on it. */
  onRunningChange?: (running: boolean) => void;
  disabled?: boolean;
  /** When false the camera is stopped and its tracks released. */
  active: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerId = 'hosifest-attendance-qr';
  // Refs, not state: html5-qrcode instances are not serialisable and must not
  // drive re-renders.
  const scannerRef = useRef<{ stop: () => void; clear: () => void } | null>(null);
  const lastDecodeRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  /** Refuse to fire twice for the same code within this window. */
  const COOLDOWN_MS = 3000;

  const stop = useCallback(() => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      scanner.stop();
    } catch {
      // Already stopped; the camera track may already be gone.
    }
    try {
      scanner.clear();
    } catch {
      // Element already detached from the DOM.
    }
    setRunning(false);
    onRunningChange?.(false);
  }, [onRunningChange]);

  const start = useCallback(async () => {
    setError(null);
    // Dynamic import: the library touches window/navigator at module scope and
    // must never be evaluated during SSR.
    const { Html5Qrcode } = await import('html5-qrcode');
    const scanner = new Html5Qrcode(scannerId, { verbose: false });
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decodedText) => {
          const now = Date.now();
          const last = lastDecodeRef.current;
          if (decodedText && decodedText !== last.text && now - last.at > COOLDOWN_MS) {
            lastDecodeRef.current = { text: decodedText, at: now };
            onDecodeRef.current(decodedText);
          }
        },
        () => {
          // Per-frame decode misses are expected and must stay silent: showing an
          // error here would flash on every frame without a QR in view.
        },
      );
      setRunning(true);
      onRunningChange?.(true);
    } catch (caught) {
      scannerRef.current = null;
      setRunning(false);
      onRunningChange?.(false);
      const name = caught instanceof Error ? caught.name : '';
      if (name === 'NotAllowedError') {
        setError(
          'Camera permission was denied. Allow camera access in the browser, or use the manual ticket code below.',
        );
      } else if (name === 'NotFoundError') {
        setError(
          'No camera was found on this device. Use the manual ticket code below.',
        );
      } else {
        setError(
          'The camera could not start. A secure (HTTPS) connection is required. Use the manual ticket code below.',
        );
      }
    }
  }, [onRunningChange]);

  // Stop whenever the screen deactivates the scanner or unmounts, otherwise the
  // camera keeps streaming after navigation.
  useEffect(() => {
    if (!active && running) stop();
  }, [active, running, stop]);

  useEffect(() => stop, [stop]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="xl"
          variant={running ? 'secondary' : 'primary'}
          onClick={() => (running ? stop() : void start())}
          disabled={disabled}
          aria-pressed={running}
          className="sm:w-64"
        >
          {running ? '■ Stop camera' : '▶ Start camera scan'}
        </Button>
        <p className="text-sm font-semibold text-ink-700" aria-live="polite">
          {running
            ? 'Camera active — hold the ticket QR inside the frame.'
            : 'Camera is off. The manual code field below always works.'}
        </p>
      </div>

      {/*
        html5-qrcode injects its own <video> and controls into this element, so
        it must exist in the DOM before start() runs. Kept mounted (visually
        hidden while off) so the container id is always resolvable.
      */}
      <div
        id={scannerId}
        className={cn(
          'w-full overflow-hidden rounded-xl border-2 border-ink-300 bg-ink-950',
          running ? 'mx-auto max-w-md' : 'hidden',
        )}
      />

      {error ? (
        <Callout tone="warning" title="Camera unavailable" role="status">
          {error}
        </Callout>
      ) : null}
    </div>
  );
}