import pg from 'pg';
// BIGINT (int8) arrives as a string by default. All monetary values in this
// system are IDR integers well inside Number.MAX_SAFE_INTEGER, so parse them.
pg.types.setTypeParser(20, (value) => Number.parseInt(value, 10));
export const { Pool } = pg;
const silentLogger = {
    warn: () => undefined,
    error: () => undefined,
    info: () => undefined,
    debug: () => undefined,
};
export function createDatabase(options) {
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
            return pool.query(text, params);
        },
        async transaction(fn) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn(client);
                await client.query('COMMIT');
                return result;
            }
            catch (error) {
                try {
                    await client.query('ROLLBACK');
                }
                catch {
                    /* rollback failures must not mask the original error */
                }
                throw error;
            }
            finally {
                client.release();
            }
        },
        async healthCheck() {
            try {
                await pool.query('SELECT 1');
                return true;
            }
            catch {
                return false;
            }
        },
        async close() {
            await pool.end();
        },
    };
}
