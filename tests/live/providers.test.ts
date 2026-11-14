import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabase, prepareTestDatabase, resetDatabase } from '../helpers/database';
import { signup } from '@/lib/server/auth';
import { listAgents } from '@/lib/server/repository';
import { saveProvider, verifyProvider } from '@/lib/server/provider-service';
import { createMission } from '@/lib/server/mission-service';
import { runNextMission } from '@/lib/server/runner';
import { missionDetail } from '@/lib/server/repository';
import { query } from '@/lib/server/db';
import { DEFAULT_BASE_URLS, type ProviderKind, type Protocol } from '@/lib/types';

// Opt-in only: these tests make real, billable provider requests. No fixture
// transport is imported here. Credentials are read from the operator's environment.
const enabled = process.env.NEXUS_RUN_LIVE_TESTS === 'true';
const required = [
  'NEXUS_LIVE_PROVIDER_A',
  'NEXUS_LIVE_KEY_A',
  'NEXUS_LIVE_MODEL_A',
  'NEXUS_LIVE_PROVIDER_B',
  'NEXUS_LIVE_KEY_B',
  'NEXUS_LIVE_MODEL_B',
] as const;
const missing = required.filter((key) => !process.env[key]);
function protocol(kind: ProviderKind): Protocol {
  if (kind === 'anthropic') return 'anthropic';
  if (kind === 'gemini') return 'gemini';
  if (kind === 'ollama') return 'ollama';
  return 'openai';
}
function settings(suffix: 'A' | 'B') {
  const kind = process.env[`NEXUS_LIVE_PROVIDER_${suffix}`] as ProviderKind;
  if (
    !['openai', 'gemini', 'anthropic', 'openrouter', 'ollama', 'lmstudio', 'compatible', 'custom'].includes(
      kind,
    )
  )
    throw new Error(`Unsupported NEXUS_LIVE_PROVIDER_${suffix}.`);
  return {
    name: `Live integration ${suffix}`,
    kind,
    protocol: protocol(kind),
    base_url: process.env[`NEXUS_LIVE_BASE_${suffix}`] || DEFAULT_BASE_URLS[kind],
    default_model: process.env[`NEXUS_LIVE_MODEL_${suffix}`]!,
    api_key: process.env[`NEXUS_LIVE_KEY_${suffix}`],
    selected_models: [],
    enabled: true,
  };
}

describe.skipIf(!enabled || missing.length > 0)(
  'opt-in live provider integration (real billable requests)',
  () => {
    beforeAll(async () => {
      await prepareTestDatabase();
      await resetDatabase();
    });
    afterAll(async () => {
      if (enabled && !missing.length) await closeDatabase();
    });
    it('verifies two real providers and completes a persisted cross-provider mission', async () => {
      const user = await signup(
        'Live Integration Operator',
        `live-${Date.now()}@example.test`,
        'Live-integration-test-password-2026',
      );
      const a = await saveProvider(user.id, settings('A'));
      const b = await saveProvider(user.id, settings('B'));
      const first = await verifyProvider(user.id, a.id);
      const second = await verifyProvider(user.id, b.id);
      expect(first.verified, first.message).toBe(true);
      expect(second.verified, second.message).toBe(true);
      const agents = (await listAgents(user.id)).slice(0, 2);
      for (const [index, agent] of agents.entries()) {
        const connection = index === 0 ? a : b;
        await query('UPDATE agents SET connection_id=$2,model=$3,max_output_tokens=512 WHERE id=$1', [
          agent.id,
          connection.id,
          connection.default_model,
        ]);
      }
      const mission = await createMission(user.id, {
        title: 'Live cross-provider integration test',
        brief:
          'Agent one: propose three concise checks for a secure login form. Agent two: review those actual checks and add one missing consideration. The lead must synthesize only the supplied findings into a short checklist. Do not claim to execute code or browse the web.',
        mode: 'round_table',
        agent_ids: agents.map((agent) => agent.id),
        synthesis_agent_id: agents[1].id,
        token_budget: 12000,
        max_steps: 12,
        max_retries: 0,
        timeout_ms: 90000,
      });
      expect(await runNextMission()).toBe(true);
      const detail = await missionDetail(user.id, mission.id);
      expect(detail.mission.status, detail.mission.error || 'Mission did not complete').toBe('completed');
      expect(detail.output?.content.trim().length).toBeGreaterThan(20);
      expect(detail.output?.content).not.toContain('OFFLINE_TEST_FIXTURE');
      expect(detail.tasks.every((task) => task.status === 'completed')).toBe(true);
      expect(detail.usage.length).toBeGreaterThanOrEqual(5); // two verification calls + at least three mission calls
      expect(new Set(detail.tasks.map((task) => task.response_model)).size).toBeGreaterThanOrEqual(1);
      expect(detail.mission.tokens_reserved).toBe(0);
    }, 600000);
  },
);
