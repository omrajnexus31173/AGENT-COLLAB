import { beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  decryptCredential,
  digest,
  encryptCredential,
  equalSecret,
  hashPassword,
  verifyPassword,
} from '@/lib/server/crypto';
beforeAll(() => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});
describe('credential and password cryptography', () => {
  it('authenticates encrypted credentials and binds owner/context', () => {
    const value = 'secret-provider-key';
    const box = encryptCredential(value, 'user-a:connection-a');
    expect(JSON.stringify(box)).not.toContain(value);
    expect(
      decryptCredential(box.encrypted_key, box.credential_iv, box.credential_tag, 'user-a:connection-a'),
    ).toBe(value);
    expect(() =>
      decryptCredential(box.encrypted_key, box.credential_iv, box.credential_tag, 'user-b:connection-a'),
    ).toThrow();
  });
  it('detects ciphertext tampering', () => {
    const box = encryptCredential('secret', 'context');
    const bytes = Buffer.from(box.encrypted_key, 'base64');
    bytes[0] ^= 1;
    expect(() =>
      decryptCredential(bytes.toString('base64'), box.credential_iv, box.credential_tag, 'context'),
    ).toThrow();
  });
  it('uses unique IVs and rejects an invalid encryption key', () => {
    const a = encryptCredential('same', 'ctx'),
      b = encryptCredential('same', 'ctx');
    expect(a.credential_iv).not.toBe(b.credential_iv);
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'invalid';
    expect(() => encryptCredential('secret', 'ctx')).toThrow(/encryption/i);
    process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
  it('hashes passwords with unique salts and verifies without plaintext', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('scrypt$131072$8$1$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
    expect(await hashPassword('correct horse battery staple')).not.toBe(hash);
  });
  it('hashes session tokens deterministically and compares secrets safely', () => {
    expect(digest('token')).toHaveLength(64);
    expect(digest('token')).toBe(digest('token'));
    expect(equalSecret('abc', 'abc')).toBe(true);
    expect(equalSecret('abc', 'abcd')).toBe(false);
  });
});
