import { afterEach, describe, expect, it } from 'vitest';
import { isPublicAddress, validateEndpoint, safeRequest } from '@/lib/server/safe-http';
import { signupSchema, missionSchema } from '@/lib/contracts';
afterEach(() => {
  delete process.env.ALLOW_LOCAL_PROVIDERS;
  delete process.env.PROVIDER_ORIGIN_ALLOWLIST;
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
