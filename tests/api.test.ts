import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDatabase, prepareTestDatabase, resetDatabase, seedSquad } from './helpers/database';
import { POST as signupRoute } from '@/app/api/auth/signup/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as sessionRoute } from '@/app/api/auth/session/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as dashboardRoute } from '@/app/api/dashboard/route';
import { POST as providerRoute } from '@/app/api/providers/route';
import { GET as providerGetRoute } from '@/app/api/providers/[id]/route';
import { GET as agentsRoute } from '@/app/api/agents/route';
import { PUT as agentUpdateRoute, DELETE as agentDeleteRoute } from '@/app/api/agents/[id]/route';
import { GET as missionGetRoute } from '@/app/api/missions/[id]/route';
import { GET as exportRoute } from '@/app/api/missions/[id]/export/route';
import { GET as eventsRoute } from '@/app/api/missions/[id]/events/route';
import { sessionResponse } from '@/lib/server/auth';
import { createMission } from '@/lib/server/mission-service';
import { query } from '@/lib/server/db';
beforeAll(prepareTestDatabase);
beforeEach(resetDatabase);
afterAll(closeDatabase);
function request(
  path: string,
  method = 'GET',
  data?: unknown,
  cookie?: string,
  csrf?: string,
  origin = 'http://localhost:3000',
) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      host: 'localhost:3000',
      origin,
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}
const context = { params: Promise.resolve({}) };
async function account(email = 'api-test@example.test') {
  const response = await signupRoute(
    request(
      '/api/auth/signup',
      'POST',
      { name: 'API Tester', email, password: 'A-secure-test-password' },
      undefined,
      undefined,
    ),
    context,
  );
  expect(response.status).toBe(201);
  const cookieHeader = response.headers.getSetCookie()[0];
  expect(cookieHeader).toContain('HttpOnly');
  expect(cookieHeader).toContain('SameSite=lax');
  expect(cookieHeader).toContain('Path=/');
  const cookie = cookieHeader.split(';')[0];
  const data = await response.json();
  return { response, cookie, csrf: data.csrfToken as string, user: data.user };
}
describe('authenticated API contracts', () => {
  it('establishes a real cookie session on signup and preserves it across requests', async () => {
    const a = await account();
    const session = await sessionRoute(request('/api/auth/session', 'GET', undefined, a.cookie), context);
    expect(session.status).toBe(200);
    expect((await session.json()).user.id).toBe(a.user.id);
    const dashboard = await dashboardRoute(request('/api/dashboard', 'GET', undefined, a.cookie), context);
    expect(dashboard.status).toBe(200);
    expect((await dashboard.json()).stats.agents).toBe(6);
  });
  it('logs in with the same cookie mechanism and logs out server-side', async () => {
    const a = await account();
    await logoutRoute(request('/api/auth/logout', 'POST', {}, a.cookie), context);
    const old = await dashboardRoute(request('/api/dashboard', 'GET', undefined, a.cookie), context);
    expect(old.status).toBe(401);
    const login = await loginRoute(
      request('/api/auth/login', 'POST', {
        email: 'api-test@example.test',
        password: 'A-secure-test-password',
      }),
      context,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    expect((await dashboardRoute(request('/api/dashboard', 'GET', undefined, cookie), context)).status).toBe(
      200,
    );
  });
  it('rejects missing sessions, missing CSRF, cross-origin mutations, and expired sessions', async () => {
    expect((await dashboardRoute(request('/api/dashboard'), context)).status).toBe(401);
    const a = await account();
    const payload = {
      name: 'Custom',
      kind: 'compatible',
      protocol: 'openai',
      base_url: 'https://api.example.com/v1',
      default_model: 'model',
      api_key: 'OFFLINE_API_TEST_KEY',
    };
    expect((await providerRoute(request('/api/providers', 'POST', payload, a.cookie), context)).status).toBe(
      403,
    );
    expect(
      (
        await providerRoute(
          request('/api/providers', 'POST', payload, a.cookie, a.csrf, 'https://attacker.example'),
          context,
        )
      ).status,
    ).toBe(403);
    await query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [a.user.id]);
    expect(
      (await dashboardRoute(request('/api/dashboard', 'GET', undefined, a.cookie), context)).status,
    ).toBe(401);
  });
  it('enforces owner-scoped provider access and never returns credentials', async () => {
    const a = await account();
    const response = await providerRoute(
      request(
        '/api/providers',
        'POST',
        {
          name: 'Custom',
          kind: 'compatible',
          protocol: 'openai',
          base_url: 'https://api.example.com/v1',
          default_model: 'model',
          api_key: 'OFFLINE_API_TEST_KEY',
        },
        a.cookie,
        a.csrf,
      ),
      context,
    );
    expect(response.status).toBe(201);
    const { connection } = await response.json();
    expect(connection.verification_status).toBe('unverified');
    const b = await account('other@example.test');
    const denied = await providerGetRoute(
      request(`/api/providers/${connection.id}`, 'GET', undefined, b.cookie),
      { params: Promise.resolve({ id: connection.id }) },
    );
    expect(denied.status).toBe(404);
    const allowed = await providerGetRoute(
      request(`/api/providers/${connection.id}`, 'GET', undefined, a.cookie),
      { params: Promise.resolve({ id: connection.id }) },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).not.toContain('OFFLINE_API_TEST_KEY');
  });
  it('updates and deletes an owned agent using the browser write contract', async () => {
    const a = await account();
    const roster = await agentsRoute(request('/api/agents', 'GET', undefined, a.cookie), context);
    const { agents } = await roster.json();
    const { id, created_at: _createdAt, ...input } = agents[0];
    const update = await agentUpdateRoute(
      request(`/api/agents/${id}`, 'PUT', { ...input, name: 'Updated Atlas', model: null }, a.cookie, a.csrf),
      { params: Promise.resolve({ id }) },
    );
    expect(update.status).toBe(200);
    const stored = await query<{ name: string }>('SELECT name FROM agents WHERE id=$1', [id]);
    expect(stored[0].name).toBe('Updated Atlas');
    const other = await account('agent-other@example.test');
    const denied = await agentUpdateRoute(
      request(`/api/agents/${id}`, 'PUT', { ...input, name: 'Stolen' }, other.cookie, other.csrf),
      { params: Promise.resolve({ id }) },
    );
    expect(denied.status).toBe(404);
    const deleted = await agentDeleteRoute(request(`/api/agents/${id}`, 'DELETE', {}, a.cookie, a.csrf), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(200);
    expect(await query('SELECT id FROM agents WHERE id=$1', [id])).toHaveLength(0);
  });
  it('loads and exports mission details through owner-scoped HTTP routes', async () => {
    const s = await seedSquad(2);
    const mission = await createMission(s.user.id, {
      title: 'Export route regression',
      brief: 'Verify detail and export routes without invoking any provider.',
      mode: 'round_table',
      agent_ids: s.agents.map((a) => a.id),
      synthesis_agent_id: s.agents[0].id,
      token_budget: 10000,
      max_steps: 24,
      max_retries: 0,
      timeout_ms: 30000,
    });
    const auth = await sessionResponse(s.user.id, request('/api/auth/session'), {});
    const cookie = auth.headers.getSetCookie()[0].split(';')[0];
    const ctx = { params: Promise.resolve({ id: mission.id }) };
    const detail = await missionGetRoute(
      request(`/api/missions/${mission.id}`, 'GET', undefined, cookie),
      ctx,
    );
    expect(detail.status).toBe(200);
    expect((await detail.json()).mission.id).toBe(mission.id);
    const exported = await exportRoute(
      request(`/api/missions/${mission.id}/export?format=md`, 'GET', undefined, cookie),
      ctx,
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-disposition')).toContain('.md');
    expect(await exported.text()).toContain('No final output was produced.');
  });
  it('streams authenticated, ordered events and replays from a cursor', async () => {
    const s = await seedSquad(2);
    const mission = await createMission(s.user.id, {
      title: 'SSE fixture',
      brief: 'Test the persisted event stream without a provider.',
      mode: 'round_table',
      agent_ids: s.agents.map((a) => a.id),
      synthesis_agent_id: s.agents[0].id,
      token_budget: 10000,
      max_steps: 24,
      max_retries: 0,
      timeout_ms: 30000,
    });
    const auth = await sessionResponse(s.user.id, request('/api/auth/session'), {});
    const cookie = auth.headers.getSetCookie()[0].split(';')[0];
    const controller = new AbortController();
    const req = request(`/api/missions/${mission.id}/events?after=0`, 'GET', undefined, cookie);
    Object.defineProperty(req, 'signal', { value: controller.signal });
    const response = await eventsRoute(req, { params: Promise.resolve({ id: mission.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(': connected');
    const inserted = await query<{ id: string }>(
      `INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'test_event',$2) RETURNING id`,
      [mission.id, JSON.stringify({ fixture: true })],
    );
    let text = '';
    for (let attempt = 0; attempt < 10 && !text.includes(`id: ${inserted[0].id}`); attempt++) {
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SSE event timeout')), 4000)),
      ]);
      text += new TextDecoder().decode(next.value);
    }
    expect(text).toContain(`id: ${inserted[0].id}`);
    expect(text).toContain('test_event');
    await reader.cancel();
    controller.abort();
    const unauthorized = await eventsRoute(request(`/api/missions/${mission.id}/events`), {
      params: Promise.resolve({ id: mission.id }),
    });
    expect(unauthorized.status).toBe(401);
  }, 10000);
});
