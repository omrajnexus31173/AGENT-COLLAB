import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, safeError } from './errors';
import { digest } from './crypto';
import { query } from './db';

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function body<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new AppError(415, 'Send a JSON request body.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 65536) throw new AppError(413, 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new AppError(413, 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'The request body must be valid JSON.');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new AppError(
      422,
      parsed.error.issues.map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`).join(' '),
      'VALIDATION_ERROR',
    );
  return parsed.data;
}
export function assertOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null')
    throw new AppError(403, 'A same-origin browser request is required.', 'ORIGIN_REJECTED');
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new AppError(403, 'Invalid request origin.');
  }
  const canonical = process.env.APP_ORIGIN;
  const allowed =
    process.env.NODE_ENV === 'production'
      ? [canonical]
      : [
          canonical,
          `http://${request.headers.get('host')}`,
          `https://${request.headers.get('host')}`,
          ...(process.env.E2B_SANDBOX_ID ? [`https://3000-${process.env.E2B_SANDBOX_ID}.e2b.app`] : []),
        ];
  if (!allowed.filter(Boolean).includes(parsed.origin))
    throw new AppError(403, 'This origin is not allowed. Check APP_ORIGIN.', 'ORIGIN_REJECTED');
}
export function clientAddress(request: NextRequest) {
  return process.env.TRUST_PROXY === 'true'
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    : 'direct';
}
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits(key_hash,count,expires_at) VALUES($1,1,now()+($2 || ' seconds')::interval)
    ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+($2 || ' seconds')::interval ELSE rate_limits.expires_at END RETURNING count`,
    [digest(key), windowSeconds],
  );
  if (Math.random() < 0.01) await query('DELETE FROM rate_limits WHERE expires_at < now()');
  if (rows[0].count > limit)
    throw new AppError(429, 'Too many requests. Please wait before trying again.', 'RATE_LIMITED');
}
export function route(
  handler: (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (request: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const safe = safeError(error);
      return json({ error: safe.message, code: safe.code }, safe.status);
    }
  };
}
export const notFound = () => new AppError(404, 'This item was not found.', 'NOT_FOUND');
