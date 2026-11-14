import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { User, SessionInfo } from '@/lib/types';
import { query, one, transaction } from './db';
import { digest, equalSecret, hashPassword, token, verifyPassword } from './crypto';
import { AppError } from './errors';
import { assertOrigin } from './http';

export const SESSION_COOKIE = 'nexus.session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
interface SessionRow {
  session_id: string;
  user_id: string;
  csrf_token: string;
  expires_at: string;
  email: string;
  name: string;
  avatar_color: string;
  created_at: string;
}
export function cookieSecure(request?: NextRequest) {
  return (
    process.env.NODE_ENV === 'production' ||
    request?.headers.get('x-forwarded-proto') === 'https' ||
    (process.env.APP_ORIGIN || '').startsWith('https:')
  );
}
export async function sessionResponse(
  userId: string,
  request: NextRequest,
  data: Record<string, unknown> = {},
  status = 200,
) {
  const raw = token();
  const csrfToken = token();
  await query(
    "INSERT INTO sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+($4 || ' seconds')::interval)",
    [userId, digest(raw), csrfToken, SESSION_SECONDS],
  );
  const response = NextResponse.json(
    { ...data, csrfToken },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return response;
}
async function sessionFromToken(raw?: string): Promise<SessionRow | null> {
  if (!raw || raw.length > 100) return null;
  return one<SessionRow>(
    `SELECT s.id session_id,s.user_id,s.csrf_token,s.expires_at,u.email,u.name,u.avatar_color,u.created_at
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(raw)],
  );
}
export async function currentUser(): Promise<User | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  const row = await sessionFromToken(raw);
  return row
    ? {
        id: row.user_id,
        email: row.email,
        name: row.name,
        avatar_color: row.avatar_color,
        created_at: row.created_at,
      }
    : null;
}
export async function sessionInfo(request: NextRequest): Promise<SessionInfo> {
  const row = await sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!row) return { user: null, csrfToken: null, expiresAt: null };
  return {
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      avatar_color: row.avatar_color,
      created_at: row.created_at,
    },
    csrfToken: row.csrf_token,
    expiresAt: row.expires_at,
  };
}
export async function authorize(
  request: NextRequest,
  mutation = false,
): Promise<{ user: User; session: SessionInfo }> {
  if (mutation) assertOrigin(request);
  const session = await sessionInfo(request);
  if (!session.user)
    throw new AppError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');
  if (mutation && !equalSecret(request.headers.get('x-csrf-token') || '', session.csrfToken || ''))
    throw new AppError(403, 'Your security token expired. Refresh and try again.', 'CSRF_REJECTED');
  return { user: session.user, session };
}
let dummyHash: Promise<string> | undefined;
export async function login(email: string, password: string) {
  const user = await one<User & { password_hash: string }>(
    'SELECT id,email,name,avatar_color,created_at,password_hash FROM users WHERE email=$1',
    [email],
  );
  dummyHash ??= hashPassword(token());
  const valid = await verifyPassword(password, user?.password_hash || (await dummyHash));
  if (!user || !valid) throw new AppError(401, 'The email or password is incorrect.', 'INVALID_CREDENTIALS');
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_color: user.avatar_color,
    created_at: user.created_at,
  };
}
export const AGENT_TEMPLATES = [
  {
    name: 'Atlas',
    role: 'Researcher',
    color: '#a78bfa',
    avatar: 'atlas',
    system_prompt:
      'Separate established facts from assumptions. Identify missing information and cite sources only if actually available.',
  },
  {
    name: 'Aegis',
    role: 'Architect',
    color: '#60a5fa',
    avatar: 'aegis',
    system_prompt:
      'Design maintainable systems. Explain trade-offs, interfaces, failure modes, and a concrete implementation plan.',
  },
  {
    name: 'Forge',
    role: 'Developer',
    color: '#22d3ee',
    avatar: 'forge',
    system_prompt:
      'Produce precise, practical implementation work. Never claim to have executed code or tests without execution evidence.',
  },
  {
    name: 'Spectre',
    role: 'Reviewer',
    color: '#c4b5fd',
    avatar: 'spectre',
    system_prompt:
      'Challenge assumptions and inspect the actual work supplied. Identify actionable defects with severity and evidence.',
  },
  {
    name: 'Sentinel',
    role: 'QA Engineer',
    color: '#34d399',
    avatar: 'aegis',
    system_prompt:
      'Perform static quality review and propose reproducible tests. Distinguish suggested tests from tests actually executed.',
  },
  {
    name: 'Oracle',
    role: 'Judge',
    color: '#fbbf24',
    avatar: 'spectre',
    system_prompt:
      'Synthesize the actual findings. Resolve disagreements using evidence, preserve uncertainty, and never invent verification.',
  },
];
export async function signup(name: string, email: string, password: string) {
  const passwordHash = await hashPassword(password);
  const userId = randomUUID();
  await transaction(async (client) => {
    await client.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)', [
      userId,
      name,
      email,
      passwordHash,
    ]);
    await client.query('INSERT INTO user_preferences(user_id) VALUES($1)', [userId]);
    for (const agent of AGENT_TEMPLATES)
      await client.query(
        'INSERT INTO agents(user_id,name,role,color,avatar,system_prompt) VALUES($1,$2,$3,$4,$5,$6)',
        [userId, agent.name, agent.role, agent.color, agent.avatar, agent.system_prompt],
      );
  });
  return { id: userId, name, email, avatar_color: '#a78bfa' };
}
export async function revokeSession(request: NextRequest, response: NextResponse) {
  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  if (raw) await query('DELETE FROM sessions WHERE token_hash=$1', [digest(raw)]);
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: cookieSecure(request),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
