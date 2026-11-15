import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isPublicAddress, validateEndpoint, safeRequest } from '@/lib/server/safe-http';
import { assertOrigin, clientAddress } from '@/lib/server/http';
import { signupSchema, missionSchema } from '@/lib/contracts';
afterEach(() => {
  delete process.env.ALLOW_LOCAL_PROVIDERS;
  delete process.env.PROVIDER_ORIGIN_ALLOWLIST;
  vi.unstubAllEnvs();
});
describe('production browser-origin and proxy boundaries', () => {
  const request = (origin?: string, host = 'nexus-agent-collab.vercel.app') =>
    new NextRequest(`https://${host}/api/auth/signup`, {
      method: 'POST',
      headers: { host, ...(origin === undefined ? {} : { origin }) },
    });
  it('fails closed when the canonical production origin is not configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', '');
    expect(() => assertOrigin(request('https://nexus-agent-collab.vercel.app'))).toThrowError(
      expect.objectContaining({ status: 403, code: 'ORIGIN_REJECTED' }),
    );
  });
  it('accepts only the exact configured canonical origin in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGIN', 'https://nexus-agent-collab.vercel.app');
    expect(() => assertOrigin(request('https://nexus-agent-collab.vercel.app'))).not.toThrow();
    for (const origin of [
      'https://attacker.example',
      'https://nexus-agent-collab.vercel.app.attacker.example',
      'http://nexus-agent-collab.vercel.app',
      'null',
    ])
      expect(() => assertOrigin(request(origin)), origin).toThrowError(
        expect.objectContaining({ status: 403, code: 'ORIGIN_REJECTED' }),
      );
    expect(() => assertOrigin(request(undefined, 'attacker.example'))).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
  it('does not trust a caller-supplied forwarded address unless the proxy is trusted', () => {
    const req = new NextRequest('https://nexus-agent-collab.vercel.app/api/auth/signup', {
      headers: { 'x-forwarded-for': '203.0.113.10, 198.51.100.2' },
    });
    vi.stubEnv('TRUST_PROXY', 'false');
    expect(clientAddress(req)).toBe('direct');
    vi.stubEnv('TRUST_PROXY', 'true');
    expect(clientAddress(req)).toBe('203.0.113.10');
  });
});
describe('SSRF and validation boundaries', () => {
  it('rejects private, loopback, metadata, reserved, and mapped addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '2001:db8::1',
      '2002:7f00:0001::',
    ])
      expect(isPublicAddress(ip), ip).toBe(false);
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('rejects URL credentials, query strings, fragments, and non-HTTP schemes', () => {
    for (const url of [
      'https://user:pass@example.com/v1',
      'https://example.com/v1?key=x',
      'https://example.com/#x',
      'file:///etc/passwd',
      'ftp://example.com',
    ])
      expect(() => validateEndpoint(url), url).toThrow();
  });
  it('requires explicit opt-in for HTTP and local providers', async () => {
    expect(() => validateEndpoint('http://127.0.0.1:11434')).toThrow(/Plain HTTP/);
    process.env.ALLOW_LOCAL_PROVIDERS = 'true';
    expect(validateEndpoint('http://127.0.0.1:11434').hostname).toBe('127.0.0.1');
    await expect(safeRequest('http://169.254.169.254/latest')).rejects.toThrow(/private or reserved/);
  });
  it('checks every DNS answer before connecting', async () => {
    await expect(
      safeRequest('https://rebind.example/v1', {
        resolver: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }),
    ).rejects.toThrow(/private or reserved/);
    await expect(safeRequest('https://empty.example/v1', { resolver: async () => [] })).rejects.toThrow(
      /private or reserved/,
    );
  });
  it('does not allow wildcard origin allowlists', async () => {
    process.env.PROVIDER_ORIGIN_ALLOWLIST = '*.example.com';
    await expect(
      safeRequest('https://internal.example/v1', {
        resolver: async () => [{ address: '10.0.0.1', family: 4 }],
      }),
    ).rejects.toThrow(/private or reserved/);
  });
  it('validates account and mission inputs', () => {
    expect(signupSchema.safeParse({ name: 'A', email: 'bad', password: 'short' }).success).toBe(false);
    const base = {
      title: 'Test',
      brief: 'A sufficiently long mission brief',
      mode: 'round_table',
      agent_ids: ['a', 'a'],
      synthesis_agent_id: 'a',
    };
    expect(missionSchema.safeParse(base).success).toBe(false);
  });
});
