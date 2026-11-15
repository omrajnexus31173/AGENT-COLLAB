import { afterEach, describe, expect, it, vi } from 'vitest';
import ConnectionParameters from 'pg/lib/connection-parameters';
import { poolOptions } from '@/lib/server/db';

afterEach(() => vi.unstubAllEnvs());

describe('managed PostgreSQL TLS configuration', () => {
  it('preserves verified TLS and the supplied CA when the URL contains sslmode', () => {
    vi.stubEnv('DATABASE_CA_CERT', '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----');
    const options = poolOptions(
      'postgresql://user:password@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full',
    );
    expect(options.ssl).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
    });
    const parsed = new ConnectionParameters(options);
    expect(parsed.ssl).toEqual(options.ssl);
    expect(parsed.host).toBe('aws-1-us-east-1.pooler.supabase.com');
    expect(parsed.user).toBe('user');
    expect(parsed.database).toBe('postgres');
    expect(options.max).toBeLessThanOrEqual(5);
    expect(options.idleTimeoutMillis).toBeLessThanOrEqual(10000);
  });
  it('does not enable TLS for a plain local connection unless explicitly requested', () => {
    vi.stubEnv('DATABASE_SSL', 'false');
    expect(poolOptions('postgresql://nexus:local@127.0.0.1:54329/nexus').ssl).toBeUndefined();
    vi.stubEnv('DATABASE_SSL', 'true');
    expect(poolOptions('postgresql://nexus:local@127.0.0.1:54329/nexus').ssl).toEqual({
      rejectUnauthorized: true,
    });
  });
});
