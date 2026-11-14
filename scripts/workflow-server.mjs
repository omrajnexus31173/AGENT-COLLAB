import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import pg from 'pg';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = new URL(
  process.env.WORKFLOW_DATABASE_URL ||
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://nexus:nexus@127.0.0.1:54329/nexus_browser_test',
);
if (!process.env.WORKFLOW_DATABASE_URL && !process.env.TEST_DATABASE_URL)
  url.pathname = '/nexus_browser_test';
const name = url.pathname.slice(1);
if (!/^[-a-z0-9_]+_test$/.test(name))
  throw new Error('Workflow tests require a dedicated database ending in _test.');
if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
  const admin = new pg.Client({
    host: url.hostname,
    port: Number(url.port || 54329),
    user: url.username,
    password: url.password,
    database: 'postgres',
  });
  await admin.connect();
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
    await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
}
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  APP_ORIGIN: 'http://127.0.0.1:3100',
  ALLOW_LOCAL_PROVIDERS: 'true',
  PROVIDER_ORIGIN_ALLOWLIST: '',
  TRUST_PROXY: 'false',
  NEXUS_DISABLE_WORKER: 'false',
  NEXT_TELEMETRY_DISABLED: '1',
};
for (const args of [
  ['--import', 'tsx', 'scripts/migrate.ts'],
  [
    '--import',
    'tsx',
    '-e',
    "import {query,getPool} from './src/lib/server/db.ts'; await query('TRUNCATE users,rate_limits,audit_logs RESTART IDENTITY CASCADE'); await getPool().end();",
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Exercise the actual standalone artifact, including its traced dependencies.
if (!existsSync('.next/standalone/server.js')) throw new Error('Run npm run build before the workflow test.');
await mkdir('.next/standalone/.next', { recursive: true });
await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
await cp('public', '.next/standalone/public', { recursive: true });
const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  env: { ...env, HOSTNAME: '127.0.0.1', PORT: '3100', NODE_ENV: 'production' },
  stdio: 'inherit',
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));
