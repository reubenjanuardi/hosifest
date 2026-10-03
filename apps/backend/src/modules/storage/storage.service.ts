import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AppError } from '../../core/errors.js';
import type { Env } from '../../config/env.js';
import { isAllowedMime } from '../order/order.routes.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Payment proof storage (11-security-and-operations.md).
 *
 * Storage keys are ALWAYS generated server side from a random UUID, so a
 * client can never influence where a file lands or overwrite another
 * customer's proof. Uploaded bytes are stored outside the web root and the
 * stored key is what `payments.proof_file_key` references.
 */
export class StorageService {
  constructor(private readonly env: Env) {}

  private get root(): string {
    return resolve(this.env.STORAGE_LOCAL_ROOT);
  }

  /** Randomised, non-guessable object key scoped to a payment context. */
  buildProofKey(mimeType: string, context: string): string {
    const extension = EXTENSIONS[mimeType.toLowerCase()] ?? 'bin';
    return `payment-proof/${context}/${randomUUID()}.${extension}`;
  }

  validate(mimeType: string | undefined, sizeBytes: number | undefined): void {
    if (!mimeType) {
      throw new AppError('UNSUPPORTED_FILE_TYPE', 'Payment proof file type is required.', 422);
    }
    if (!isAllowedMime(mimeType, this.env.STORAGE_ALLOWED_MIME)) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        'Payment proof file type is not allowed.',
        422,
        { allowed: this.env.STORAGE_ALLOWED_MIME },
      );
    }
    if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Payment proof file is empty.', 422);
    }
    if (sizeBytes > this.env.STORAGE_MAX_UPLOAD_BYTES) {
      throw new AppError(
        'FILE_TOO_LARGE',
        'Payment proof file exceeds the maximum allowed size.',
        413,
        { maxBytes: this.env.STORAGE_MAX_UPLOAD_BYTES },
      );
    }
  }

  /** Local-disk driver. S3 driver is left to the deploy layer (CI-03). */
  async put(key: string, content: Buffer): Promise<string> {
    const target = resolve(join(this.root, key));
    // Path traversal guard: the resolved path must stay under the root.
    if (!target.startsWith(this.root)) {
      throw new AppError('STORAGE_ERROR', 'Invalid storage key.', 400);
    }
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content, { mode: 0o640 });
    return key;
  }
}