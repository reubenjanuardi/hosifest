import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';

// BIGINT (int8) arrives as a string by default. All monetary values in this
// system are IDR integers well inside Number.MAX_SAFE_INTEGER, so parse them.
pg.types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

export const { Pool } = pg;
export type { PoolClient, QueryResult, QueryResultRow } from 'pg';

export type LoggerLike = Pick<FastifyBaseLogger, 'warn' | 'error' | 'info' | 'debug'>;

const silentLogger: LoggerLike = {
  warn: () => undefined,
  error: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

export interface Database {
  pool: pg.Pool;
  /** Structured logger for non-request diagnostics (schema drift, degraded paths). */
  log: LoggerLike;
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<pg.QueryResult<T>>;
  /** Runs `fn` inside a transaction, committing on success, rolling back on throw. */
  transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

export interface CreateDatabaseOptions {
  /**
   * Connection string. A bare DSN is fine; individual fields override it,
   * which is how the integration suite targets a Unix socket on Windows
   * (no TCP listener, no DNS entry).
   */
  connectionString: string;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  statementTimeoutMillis?: number;
  applicationName?: string;
  log?: LoggerLike;
}

export function createDatabase(options: CreateDatabaseOptions): Database {
  const pool = new Pool({
    connectionString: options.connectionString,
    ...(options.host !== undefined ? { host: options.host } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.user !== undefined ? { user: options.user } : {}),
    ...(options.database !== undefined ? { database: options.database } : {}),
    max: options.max ?? 20,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
    application_name: options.applicationName ?? 'hosifest-backend',
    statement_timeout: options.statementTimeoutMillis ?? 15_000,
  });

  // A pool-level error must never crash the process.
  pool.on('error', () => {
    /* idle client errors are recovered by the pool */
  });

  return {
    pool,
    log: options.log ?? silentLogger,

    query(text, params) {
      return pool.query(text, params as unknown[]);
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* rollback failures must not mask the original error */
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async healthCheck() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },

    async close() {
      await pool.end();
    },
  };
}