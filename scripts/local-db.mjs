import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = new URL(process.env.DATABASE_URL || 'postgresql://nexus:nexus@127.0.0.1:54329/nexus');
if (!['127.0.0.1', 'localhost'].includes(url.hostname))
  throw new Error('The embedded database is loopback-only. Use managed PostgreSQL for deployment.');
const platforms = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
const packageName = `@embedded-postgres/${platforms[process.platform]}-${process.arch}`;
const binaries = await import(packageName);
const databaseDir = resolve('.data/postgres');
mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
const env = { ...process.env, LC_ALL: 'C', LANG: 'C' };
if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
  const passwordFile = join(tmpdir(), `nexus-init-${randomBytes(8).toString('hex')}`);
  writeFileSync(passwordFile, decodeURIComponent(url.password), { mode: 0o600 });
  try {
    const result = spawnSync(
      binaries.initdb,
      [
        '--pgdata=' + databaseDir,
        '--auth=scram-sha-256',
        '--username=' + decodeURIComponent(url.username),
        '--pwfile=' + passwordFile,
        '--locale=C',
        '--encoding=UTF8',
      ],
      { env, encoding: 'utf8' },
    );
    if (result.status !== 0)
      throw new Error(
        `Database initialization failed: ${result.stderr || result.error?.message || 'unknown error'}`,
      );
  } finally {
    unlinkSync(passwordFile);
  }
}
chmodSync(binaries.postgres, 0o755);
const child = spawn(
  binaries.postgres,
  [
    '-D',
    databaseDir,
    '-p',
    String(url.port || 54329),
    '-c',
    'listen_addresses=127.0.0.1',
    '-c',
    'max_connections=60',
  ],
  { env, stdio: ['ignore', 'ignore', 'pipe'] },
);
let ready = false;
child.stderr.on('data', (chunk) => {
  const text = String(chunk);
  if (/FATAL|ERROR/.test(text)) console.error(text.replace(/password[^\s]*/gi, '[redacted]').trim());
  if (text.includes('database system is ready to accept connections') && !ready) {
    ready = true;
    void initialize();
  }
});
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code) => {
  if (!stopping) {
    console.error(`PostgreSQL exited (${code}).`);
    process.exit(1);
  }
});
async function initialize() {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: Number(url.port || 54329),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: 'postgres',
  });
  try {
    await client.connect();
    const name = url.pathname.slice(1);
    if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid local database name.');
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!found.rowCount) await client.query(`CREATE DATABASE "${name}"`);
    console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}. Persistent data: .data/postgres.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Database initialization failed.');
    child.kill('SIGTERM');
  } finally {
    await client.end().catch(() => {});
  }
}
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
  timer.unref();
  child.once('exit', () => process.exit(0));
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
setInterval(() => {}, 60000);
