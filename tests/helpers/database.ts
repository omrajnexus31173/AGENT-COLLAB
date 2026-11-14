import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { getPool, query } from '@/lib/server/db';
import { signup } from '@/lib/server/auth';
import { listAgents } from '@/lib/server/repository';
import { encryptCredential } from '@/lib/server/crypto';

export async function prepareTestDatabase() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = new URL(
    process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://nexus:nexus@127.0.0.1:54329/nexus_test',
  );
  if (!process.env.TEST_DATABASE_URL) url.pathname = '/nexus_test';
  if (!/^[-a-z0-9_]+_test$/.test(url.pathname.slice(1)))
    throw new Error('Refusing to run destructive tests on a database whose name does not end in _test.');
  process.env.DATABASE_URL = url.toString();
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.NEXUS_DISABLE_WORKER = 'true';
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
    const admin = new pg.Client({
      host: url.hostname,
      port: Number(url.port || 54329),
      user: url.username,
      password: url.password,
      database: 'postgres',
    });
    await admin.connect();
    const name = url.pathname.slice(1);
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
    if (!found.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
    await admin.end();
  }
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], {
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`Test migration failed: ${result.stderr}`);
}
export async function resetDatabase() {
  await query('TRUNCATE users,rate_limits,audit_logs RESTART IDENTITY CASCADE');
}
export async function closeDatabase() {
  await getPool().end();
}
export async function seedSquad(count = 2) {
  const user = await signup(
    'Test Commander',
    `fixture-${randomBytes(6).toString('hex')}@example.test`,
    'A-secure-test-password-2026',
  );
  const id = randomBytes(16)
    .toString('hex')
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  const encrypted = encryptCredential('OFFLINE_TEST_FIXTURE_KEY_NOT_REAL', `${user.id}:${id}`);
  await query(
    `INSERT INTO provider_connections(id,user_id,name,kind,protocol,base_url,default_model,encrypted_key,credential_iv,credential_tag,verification_status,verified_at,verified_model) VALUES($1,$2,'Offline protocol fixture','openai','openai','https://api.openai.com/v1','fixture-model-a',$3,$4,$5,'verified',now(),'fixture-model-a')`,
    [id, user.id, encrypted.encrypted_key, encrypted.credential_iv, encrypted.credential_tag],
  );
  const agents = (await listAgents(user.id)).slice(0, count);
  for (const [i, agent] of agents.entries())
    await query('UPDATE agents SET connection_id=$2,model=$3,max_output_tokens=256 WHERE id=$1', [
      agent.id,
      id,
      `fixture-model-${i}`,
    ]);
  return { user, agents: (await listAgents(user.id)).slice(0, count), connectionId: id };
}
