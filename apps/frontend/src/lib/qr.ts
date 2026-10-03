import QRCode from 'qrcode';

/**
 * Server-rendered QR image.
 *
 * IA doc 18 §8: the QR token must NOT be exposed as ordinary text. So the token is
 * only ever encoded into the QR matrix here and the resulting PNG is referenced via
 * a data URL. The raw token is never rendered as text anywhere in the UI.
 *
 * Server-side so the token never travels to the browser as a readable string.
 */
export async function buildQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#12151d', light: '#ffffff' },
  });
}
