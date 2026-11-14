import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDatabase, prepareTestDatabase, resetDatabase, seedSquad } from './helpers/database';
import { fixtureTransport } from './helpers/transport';
import { createMission, commandMission } from '@/lib/server/mission-service';
import {
  claimMission,
  executeMission,
  notifyMission,
  recoverExpired,
  runNextMission,
} from '@/lib/server/runner';
import { missionDetail } from '@/lib/server/repository';
import { query, one } from '@/lib/server/db';
import { MODES, type MissionMode } from '@/lib/types';
import type { SafeResponse } from '@/lib/server/safe-http';

beforeAll(prepareTestDatabase);
beforeEach(resetDatabase);
afterAll(closeDatabase);
async function seed(mode: MissionMode = 'round_table', overrides: Record<string, unknown> = {}) {
  const squad = await seedSquad(2);
  const mission = await createMission(squad.user.id, {
    title: `Offline ${mode} protocol test`,
    brief: 'Produce a useful result and pass actual findings between two agents.',
    mode,
    agent_ids: squad.agents.map((a) => a.id),
    synthesis_agent_id: squad.agents[1].id,
    token_budget: 50000,
    max_steps: 24,
    max_retries: 0,
    timeout_ms: 30000,
    ...overrides,
  });
  return { ...squad, mission };
}
describe('database-backed orchestration with explicitly offline provider fixtures', () => {
  it.each(MODES)(
    'executes %s with real handoff context, durable events, usage, and persisted synthesis',
    async (mode) => {
      const s = await seed(mode);
      const { transport, calls } = fixtureTransport(s.agents);
      expect(await runNextMission(transport)).toBe(true);
      let d = await missionDetail(s.user.id, s.mission.id);
      expect(d.mission.status).toBe(mode === 'guided' ? 'awaiting_approval' : 'completed');
      if (mode === 'guided') {
        await commandMission(s.user.id, s.mission.id, { action: 'approve' });
        await runNextMission(transport);
      }
      if (mode === 'guided') d = await missionDetail(s.user.id, s.mission.id);
      expect(d.output?.content).toContain('OFFLINE_TEST_FIXTURE_SYNTHESIS');
      expect(d.output?.evidence.length).toBeGreaterThan(0);
      expect(d.tasks.every((t) => t.status === 'completed')).toBe(true);
      expect(d.mission.tokens_reserved).toBe(0);
      expect(d.usage.length).toBe(calls.length);
      expect(d.mission.tokens_used).toBe(d.usage.reduce((n, u) => n + u.total_tokens, 0));
      expect(d.events.some((e) => e.type === 'mission_completed')).toBe(true);
      expect(d.events.every((e, i) => i === 0 || BigInt(e.id) > BigInt(d.events[i - 1].id))).toBe(true);
      const exchange = calls.find((c) =>
        JSON.stringify(c.body.messages).includes('ACTUAL DEPENDENCY OUTPUTS'),
      );
      expect(exchange).toBeDefined();
      expect(JSON.stringify(exchange!.body.messages)).toContain('OFFLINE_TEST_FIXTURE_OUTPUT');
      expect(JSON.stringify(calls.map((call) => ({ url: call.url, body: call.body })))).not.toContain(
        'OFFLINE_TEST_FIXTURE_KEY_NOT_REAL',
      );
      expect(
        calls.every((call) => call.headers.authorization === 'Bearer OFFLINE_TEST_FIXTURE_KEY_NOT_REAL'),
      ).toBe(true);
      if (mode === 'autonomous') {
        expect(d.tasks.some((t) => t.kind === 'delegated')).toBe(true);
        expect(d.events.some((e) => e.type === 'plan_created')).toBe(true);
      }
    },
    30000,
  );
  it('pauses durably, discards an in-flight completion, then resumes without losing completed findings', async () => {
    let paused = false;
    const s = await seed();
    const { transport } = fixtureTransport(s.agents, async (call) => {
      const prompt = JSON.stringify(call.body.messages);
      if (prompt.includes('ACTUAL DEPENDENCY OUTPUTS') && !paused) {
        paused = true;
        await commandMission(s.user.id, s.mission.id, { action: 'pause' });
        notifyMission(s.mission.id, 'pause');
      }
    });
    await runNextMission(transport);
    let d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('paused');
    expect(d.output).toBeNull();
    expect(d.tasks.some((t) => t.status === 'completed')).toBe(true);
    expect(d.mission.tokens_reserved).toBe(0);
    const completed = d.tasks.filter((t) => t.status === 'completed').map((t) => t.id);
    await commandMission(s.user.id, s.mission.id, { action: 'resume' });
    const again = fixtureTransport(s.agents);
    await runNextMission(again.transport);
    d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('completed');
    expect(completed.every((id) => d.tasks.find((t) => t.id === id)?.status === 'completed')).toBe(true);
  }, 30000);
  it('cancels an in-flight mission without fabricating a final output', async () => {
    const s = await seed();
    const { transport } = fixtureTransport(s.agents, async () => {
      await commandMission(s.user.id, s.mission.id, { action: 'cancel' });
      notifyMission(s.mission.id, 'cancel');
    });
    await runNextMission(transport);
    const d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('cancelled');
    expect(d.output).toBeNull();
    expect(d.tasks.every((t) => t.status !== 'completed')).toBe(true);
    expect(d.mission.tokens_reserved).toBe(0);
  });
  it('bounds retries and never marks a failed task or mission complete', async () => {
    const s = await seed('round_table', { max_retries: 1 });
    const error: SafeResponse = {
      status: 503,
      body: Buffer.from(JSON.stringify({ error: { message: 'Offline fixture unavailable' } })),
      headers: {},
    };
    let calls = 0;
    await runNextMission({
      request: async () => {
        calls++;
        return error;
      },
    });
    const d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('failed');
    expect(d.output).toBeNull();
    expect(d.tasks.some((t) => t.status === 'failed')).toBe(true);
    expect(d.tasks.every((t) => t.attempts <= 2)).toBe(true);
    expect(calls).toBeLessThanOrEqual(6);
    expect(d.mission.tokens_reserved).toBe(0);
  }, 30000);
  it('enforces the token reserve before making a provider call', async () => {
    const s = await seed('round_table', { token_budget: 1000 });
    // Missions intentionally use their creation-time snapshot, not later agent
    // edits. Fix both snapshot fields so random template ordering cannot make
    // two independent opening reservations accidentally fit this tiny budget.
    await query(
      `UPDATE missions SET agent_snapshot=(SELECT jsonb_agg(jsonb_set(jsonb_set(a,'{max_output_tokens}','256'),'{system_prompt}','""')) FROM jsonb_array_elements(agent_snapshot) a) WHERE id=$1`,
      [s.mission.id],
    );
    const { transport, calls: recorded } = fixtureTransport(s.agents);
    await runNextMission(transport);
    const d = await missionDetail(s.user.id, s.mission.id);
    expect(recorded.length).toBe(1); // The first call fits; the next reservation must not be sent.
    expect(d.mission.status).toBe('failed');
    expect(d.mission.error).toMatch(/budget/);
    expect(d.output).toBeNull();
  });
  it('recovers expired leases as interrupted, requires explicit resume, and settles reservations once', async () => {
    const s = await seed();
    const task = s.mission.task_count
      ? await one<{ id: string }>('SELECT id FROM tasks WHERE mission_id=$1 ORDER BY position LIMIT 1', [
          s.mission.id,
        ])
      : null;
    await query(
      `UPDATE missions SET status='running',worker_id=$2,lease_until=now()-interval '1 minute',tokens_reserved=500 WHERE id=$1`,
      [s.mission.id, randomUUID()],
    );
    await query(`UPDATE tasks SET status='running',input_snapshot=$2 WHERE id=$1`, [
      task!.id,
      JSON.stringify({
        messages: [],
        reservation: 500,
        settled: false,
        connection_id: s.connectionId,
        context_hash: 'fixture',
      }),
    ]);
    await recoverExpired();
    let d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('interrupted');
    expect(d.mission.tokens_used).toBe(500);
    expect(d.mission.tokens_reserved).toBe(0);
    await recoverExpired();
    d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.tokens_used).toBe(500);
    await commandMission(s.user.id, s.mission.id, { action: 'resume' });
    const { transport } = fixtureTransport(s.agents);
    await runNextMission(transport);
    d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('completed');
  });
  it('supports a human approval gate, a persisted follow-up assignment, and linked continuation', async () => {
    const s = await seed('guided');
    const { transport } = fixtureTransport(s.agents);
    await runNextMission(transport);
    let d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('awaiting_approval');
    expect(d.output).toBeNull();
    await commandMission(s.user.id, s.mission.id, {
      action: 'instruct',
      instruction: 'Add an explicit authorization checklist.',
      agent_id: s.agents[0].id,
    });
    await runNextMission(transport);
    d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('awaiting_approval');
    expect(d.tasks.some((t) => t.title === 'Human-directed follow-up' && t.status === 'completed')).toBe(
      true,
    );
    await commandMission(s.user.id, s.mission.id, { action: 'approve' });
    await runNextMission(transport);
    d = await missionDetail(s.user.id, s.mission.id);
    expect(d.mission.status).toBe('completed');
    const continued = await createMission(
      s.user.id,
      {
        title: 'Continue the fixture mission',
        brief: 'Refine the previous result with additional constraints.',
        mode: 'guided',
        agent_ids: s.agents.map((a) => a.id),
        synthesis_agent_id: s.agents[1].id,
        token_budget: 50000,
        max_steps: 24,
        max_retries: 0,
        timeout_ms: 30000,
      },
      s.mission.id,
    );
    expect(continued.parent_mission_id).toBe(s.mission.id);
    expect(continued.brief).toContain('OFFLINE_TEST_FIXTURE_SYNTHESIS');
  }, 30000);
  it('rejects missions with unverified providers and preserves ownership boundaries', async () => {
    const s = await seed();
    await query(
      "UPDATE provider_connections SET verification_status='unverified',verified_at=NULL WHERE id=$1",
      [s.connectionId],
    );
    await expect(
      createMission(s.user.id, {
        title: 'Unverified',
        brief: 'This must not execute',
        mode: 'round_table',
        agent_ids: s.agents.map((a) => a.id),
        synthesis_agent_id: s.agents[0].id,
        token_budget: 10000,
        max_steps: 24,
        max_retries: 0,
        timeout_ms: 30000,
      }),
    ).rejects.toThrow(/Verify/);
    const other = await seedSquad(2);
    await expect(missionDetail(other.user.id, s.mission.id)).rejects.toThrow(/not found/);
  });
});

// Kept outside the describe block so the explicit fencing regression is easy
// to locate in runner output. It uses the same guarded test database lifecycle.
it('fences a stale same-process execution after lease recovery and explicit resume', async () => {
  const s = await seed();
  const stale = await claimMission();
  expect(stale).not.toBeNull();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const fresh = fixtureTransport(s.agents);
  const staleExecution = executeMission(stale!, {
    request: async (url, options) => {
      entered();
      await gate;
      return fresh.transport.request(url, options);
    },
  });
  await ready;
  await query("UPDATE missions SET lease_until=now()-interval '1 minute',worker_id=$2 WHERE id=$1", [
    s.mission.id,
    randomUUID(),
  ]);
  // Recovery uses SKIP LOCKED so competing workers do not block. A heartbeat
  // may hold the row briefly; the next recovery tick must pick up the lease.
  await expect
    .poll(async () => {
      await recoverExpired();
      return (await one<{ status: string }>('SELECT status FROM missions WHERE id=$1', [s.mission.id]))
        ?.status;
    })
    .toBe('interrupted');
  await commandMission(s.user.id, s.mission.id, { action: 'resume' });
  const resumed = await claimMission();
  expect(resumed!.worker_id).not.toBe(stale!.worker_id);
  await executeMission(resumed!, fixtureTransport(s.agents).transport);
  release();
  await staleExecution;
  const detail = await missionDetail(s.user.id, s.mission.id);
  expect(detail.mission.status).toBe('completed');
  expect(detail.mission.tokens_reserved).toBe(0);
  expect(detail.mission.tokens_used).toBe(detail.usage.reduce((sum, usage) => sum + usage.total_tokens, 0));
  expect(detail.tasks.every((task) => task.status === 'completed')).toBe(true);
  expect(detail.output?.content).toContain('OFFLINE_TEST_FIXTURE_SYNTHESIS');
});
