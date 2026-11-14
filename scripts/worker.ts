import { getPool, query } from '../src/lib/server/db';
import { startRunner, stopRunner } from '../src/lib/server/runner';

async function main() {
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required.');
  await query('SELECT 1');
  startRunner();
  // The runner's own timer is unref'ed so it cannot keep a web process alive.
  // A dedicated worker intentionally owns a referenced supervision timer.
  const keepAlive = setInterval(() => {}, 60000);
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(keepAlive);
    stopRunner();
    void getPool()
      .end()
      .then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log('Nexus durable worker started. Waiting for persisted missions.');
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Worker startup failed.');
  process.exitCode = 1;
});
