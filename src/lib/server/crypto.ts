import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { AppError } from './errors';
const scrypt = (
  password: string,
  salt: string,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number },
) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, length, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    ),
  );
const N = 131072,
  r = 8,
  p = 1;
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, n, rr, pp, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash || Number(n) !== N || Number(rr) !== r || Number(pp) !== p)
    return false;
  const derived = (await scrypt(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 })) as Buffer;
  return equalSecret(derived.toString('hex'), hash);
}
function encryptionKey() {
  const key = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32 || key.toString('base64') !== process.env.CREDENTIAL_ENCRYPTION_KEY)
    throw new AppError(
      503,
      'Credential encryption is not configured. Set CREDENTIAL_ENCRYPTION_KEY to 32 base64-encoded random bytes.',
      'ENCRYPTION_UNAVAILABLE',
    );
  return key;
}
export function encryptCredential(value: string, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    encrypted_key: encrypted.toString('base64'),
    credential_iv: iv.toString('base64'),
    credential_tag: cipher.getAuthTag().toString('base64'),
  };
}
export function decryptCredential(encrypted: string, iv: string, tag: string, context: string) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
