import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const globalDb = globalThis as unknown as { nexusPool?: Pool };
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. See .env.example.');
  if (!globalDb.nexusPool) {
    const connectionString = process.env.DATABASE_URL;
    const ssl =
      process.env.DATABASE_SSL === 'true' || /sslmode=(require|verify-full|verify-ca)/.test(connectionString)
        ? {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA_CERT
              ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n') }
              : {}),
          }
        : undefined;
    globalDb.nexusPool = new Pool({
      connectionString,
      max: 12,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      ssl,
      application_name: 'nexus-arcade',
    });
    globalDb.nexusPool.on('error', () => console.error('[database] An idle connection was interrupted.'));
  }
  return globalDb.nexusPool;
}
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}
export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  return (await query<T>(text, values))[0] ?? null;
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function audit(
  userId: string | null,
  action: string,
  resourceId: string | null = null,
  details: Record<string, unknown> = {},
) {
  await query('INSERT INTO audit_logs(user_id,action,resource_id,details) VALUES($1,$2,$3,$4)', [
    userId,
    action,
    resourceId,
    JSON.stringify(details),
  ]);
}
