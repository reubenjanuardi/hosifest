import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ env });

  // Periodic sweep for expired orders. The lazy check in the payment-proof
  // path still runs, so correctness does not depend on this timer.
  const sweep = setInterval(() => {
    void app.hosifest.expiry.sweepExpiredOrders().catch((error: unknown) => {
      app.log.warn({ err: error }, 'expiry sweep failed');
    });
  }, 60_000);
  sweep.unref();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    clearInterval(sweep);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info({ port: env.PORT }, 'hosifest backend listening');
}

main().catch((error: unknown) => {
  // Startup failures must be loud but must not print secrets.
  console.error('Failed to start hosifest backend:', error instanceof Error ? error.message : error);
  process.exit(1);
});