import { z } from 'zod';

/**
 * Business constants ONLY. Every price, quota, phase date, catalog entry,
 * congregation, purchase limit and discount code lives in the database.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('12h'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Storage driver selection. local writes to a path that MUST be backed by a
  // durable volume in production, otherwise payment proofs are lost on restart.
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./var/storage'),
  // Design-doc names (19-docker-architecture.md section 5). Required when the
  // S3-compatible driver is used so the deploy layer can configure the bucket.
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  // Public origin the API is reached through (behind the Cloudflare Tunnel).
  PUBLIC_API_URL: z.string().url().optional(),
  // Payment provider configuration. MVP is manual proof verification
  // (BR-PAY-01/BR-PAY-02); the value is parsed as JSON configuration.
  PAYMENT_CONFIGURATION: z.string().default('{"mode":"manual","methods":["qris","bank_transfer"]}'),
  STORAGE_BASE_URL: z.string().default('/uploads'),
  STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  STORAGE_ALLOWED_MIME: z
    .string()
    .default('image/jpeg,image/png,image/webp,application/pdf'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_ORDER_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PROOF_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_TICKET_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_ATTENDANCE_MAX: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}

export const config = {
  /** Payment proof must be submitted within this window (BR-PAY-03). */
  PAYMENT_PROOF_WINDOW_MINUTES: 30,
} as const;

