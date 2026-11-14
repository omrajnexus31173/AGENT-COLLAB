export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXUS_DISABLE_WORKER !== 'true') {
    const { startRunner } = await import('./lib/server/runner');
    startRunner();
  }
}
