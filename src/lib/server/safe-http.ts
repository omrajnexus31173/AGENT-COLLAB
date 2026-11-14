import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import { AppError } from './errors';

export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (isIP(ip) !== 6) return false;
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    return isIP(mapped) === 4 && isPublicAddress(mapped);
  }
  return /^2[0-9a-f]{3}:/.test(ip) && !/^(2001:(db8|0?0?0?0):|2002:|2001:10:|2001:20:)/.test(ip);
}
export const isLoopback = (address: string) => /^(127\.|::1$|::ffff:127\.)/i.test(address);
const isMetadata = (address: string) => /^(169\.254\.|fe80:|::ffff:169\.254\.)/i.test(address);
export function validateEndpoint(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(422, 'Enter a valid endpoint URL.', 'UNSAFE_ENDPOINT');
  }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol))
    throw new AppError(
      422,
      'Use an HTTP(S) origin and base path without credentials, query parameters, or fragments.',
      'UNSAFE_ENDPOINT',
    );
  if (url.protocol === 'http:' && process.env.ALLOW_LOCAL_PROVIDERS !== 'true')
    throw new AppError(
      422,
      'Plain HTTP is disabled. Use HTTPS, or explicitly enable local providers on a trusted development machine.',
      'UNSAFE_ENDPOINT',
    );
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (url.protocol === 'https:' && ![443, 8443].includes(port))
    throw new AppError(422, 'HTTPS endpoints may use port 443 or 8443.', 'UNSAFE_ENDPOINT');
  if (port < 1 || port > 65535) throw new AppError(422, 'Invalid endpoint port.', 'UNSAFE_ENDPOINT');
  return url;
}
export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
export interface SafeResponse {
  status: number;
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
}
interface SafeOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  resolver?: Resolver;
  maxBytes?: number;
}
export async function safeRequest(
  raw: string,
  options: SafeOptions = {},
  redirects = 0,
): Promise<SafeResponse> {
  const url = validateEndpoint(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = (process.env.PROVIDER_ORIGIN_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(url.origin);
  const local = process.env.ALLOW_LOCAL_PROVIDERS === 'true';
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await (options.resolver || ((host) => lookup(host, { all: true, verbatim: true })))(hostname);
  if (
    !addresses.length ||
    addresses.some(
      (a) =>
        isMetadata(a.address) ||
        (!isPublicAddress(a.address) &&
          !(local && (isLoopback(a.address) || isPublicAddress(a.address))) &&
          !allowed),
    )
  )
    throw new AppError(
      422,
      'This endpoint resolves to a private or reserved network. Use a public HTTPS API; local providers require ALLOW_LOCAL_PROVIDERS=true on a trusted machine.',
      'UNSAFE_ENDPOINT',
    );
  const address = addresses[0];
  const timeout = Math.min(options.timeoutMs || 90000, 180000);
  return new Promise<SafeResponse>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new AppError(499, 'Request cancelled.', 'CANCELLED'));
      return;
    }
    const host = address.family === 6 ? `[${address.address}]` : address.address;
    const target = new URL(url.toString());
    target.hostname = host;
    const headers = {
      ...options.headers,
      host: url.host,
      accept: 'application/json',
      ...(options.body
        ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(options.body)) }
        : {}),
    };
    let settled = false;
    const timerHolder: { id?: ReturnType<typeof setTimeout> } = {};
    const cleanup = () => {
      clearTimeout(timerHolder.id);
      options.signal?.removeEventListener('abort', abort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      request.destroy();
      reject(error);
    };
    const abort = () => fail(new AppError(499, 'Request cancelled.', 'CANCELLED'));
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      target,
      {
        method: options.method || 'GET',
        headers,
        ...(url.protocol === 'https:'
          ? {
              servername: hostname,
              checkServerIdentity: (_host, cert) => checkServerIdentity(hostname, cert),
              rejectUnauthorized: true,
            }
          : {}),
      },
      (response) => {
        const status = response.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          settled = true;
          cleanup();
          const next = new URL(response.headers.location, url);
          if (next.origin !== url.origin || redirects >= 2) {
            reject(
              new AppError(
                502,
                'The provider redirected to another endpoint. Configure the final API base URL directly.',
                'PROTOCOL_ERROR',
              ),
            );
            return;
          }
          safeRequest(next.toString(), options, redirects + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > (options.maxBytes || 2 * 1024 * 1024)) {
            response.destroy();
            fail(
              new AppError(
                502,
                'The provider response exceeded the 2 MB safety limit.',
                'RESPONSE_TOO_LARGE',
              ),
            );
          } else chunks.push(chunk);
        });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ status, body: Buffer.concat(chunks), headers: response.headers });
        });
        response.on('error', () =>
          fail(new AppError(502, 'The provider response was interrupted.', 'NETWORK_ERROR', true)),
        );
      },
    );
    timerHolder.id = setTimeout(
      () =>
        fail(
          new AppError(
            504,
            `The provider did not respond within ${Math.round(timeout / 1000)} seconds.`,
            'PROVIDER_TIMEOUT',
            true,
          ),
        ),
      timeout,
    );
    request.on('error', (error) =>
      fail(
        (error as Error).name === 'AbortError' || options.signal?.aborted
          ? new AppError(499, 'Request cancelled.', 'CANCELLED')
          : new AppError(
              502,
              'Could not reach the provider. Check its endpoint, TLS certificate, and network access.',
              'NETWORK_ERROR',
              true,
            ),
      ),
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.body) request.write(options.body);
    request.end();
  });
}
