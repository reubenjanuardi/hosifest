import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../core/errors.js';
import type { Env } from '../../config/env.js';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function isAllowedMime(mime: string, allowedCsv: string): boolean {
  const allowed = allowedCsv
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(mime.trim().toLowerCase());
}

/**
 * Payment proof storage (11-security-and-operations.md).
 *
 * Storage keys are ALWAYS generated server side from a random UUID, so a
 * client can never influence where a file lands or overwrite another
 * customer's proof. Uploaded bytes are stored outside the web root and the
 * stored key is what `payments.proof_file_key` references.
 */
export class StorageService {
  private readonly s3: S3Client | null;

  constructor(private readonly env: Env) {
    if (env.STORAGE_DRIVER === 's3') {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: env.STORAGE_ENDPOINT,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? '',
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? '',
        },
        forcePathStyle: true,
      });
    } else {
      this.s3 = null;
    }
  }

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

  /** Store bytes under `key`. Returns the key (never a public URL). */
  async put(key: string, content: Buffer, mimeType?: string): Promise<string> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.env.STORAGE_BUCKET,
          Key: key,
          Body: content,
          ContentType: mimeType,
        }),
      );
      return key;
    }
    const target = resolve(join(this.root, key));
    // Path traversal guard: the resolved path must stay under the root.
    if (!target.startsWith(this.root)) {
      throw new AppError('STORAGE_ERROR', 'Invalid storage key.', 400);
    }
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, content, { mode: 0o640 });
    return key;
  }

  /** Remove a stored object. Missing keys are ignored. */
  async remove(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.env.STORAGE_BUCKET, Key: key }),
      );
      return;
    }
    const target = resolve(join(this.root, key));
    if (!target.startsWith(this.root)) {
      throw new AppError('STORAGE_ERROR', 'Invalid storage key.', 400);
    }
    try {
      await unlink(target);
    } catch {
      // Already gone — nothing to do.
    }
  }

  /**
   * Short-lived read URL for admin review of a proof file.
   * S3 driver: presigned GET. Local driver: app-served path.
   */
  async presignedGetUrl(key: string, expiresInSeconds = 900): Promise<string> {
    if (this.s3) {
      return getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.env.STORAGE_BUCKET, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    }
    return `${this.env.STORAGE_BASE_URL}/${key}`;
  }
}