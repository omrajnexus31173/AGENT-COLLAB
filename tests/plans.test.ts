import { describe, expect, it } from 'vitest';
import { initialPlan, parseDelegatedPlan, validateDag } from '@/lib/server/plans';
import { buildContext } from '@/lib/server/context';
import { estimateTokens } from '@/lib/server/accounting';
import { MODES, type Agent } from '@/lib/types';
const agents: Agent[] = ['a', 'b', 'c'].map((id, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  name: `Agent ${i}`,
  role: i === 0 ? 'Developer' : 'Reviewer',
  color: '#a78bfa',
  avatar: 'atlas',
  system_prompt: 'Be precise.',
  connection_id: null,
  model: null,
  temperature: 0.4,
  max_output_tokens: 1024,
  enabled: true,
  configuration: {},
  created_at: new Date().toISOString(),
}));
describe('bounded dependency plans and context', () => {
  it.each(MODES)('creates an acyclic %s plan', (mode) => {
    const specs = initialPlan(agents, agents[1].id, mode, 24);
    validateDag(specs);
    expect(specs.some((s) => s.kind === 'synthesis')).toBe(true);
    expect(specs.length).toBeLessThanOrEqual(24);
  });
  it('rejects cycles, missing dependencies, and duplicate keys', () => {
    const base = {
      title: 'Task',
      instructions: 'Do useful work',
      kind: 'work' as const,
      agentId: agents[0].id,
    };
    expect(() =>
      validateDag([
        { ...base, key: 'a', dependsOn: ['b'] },
        { ...base, key: 'b', dependsOn: ['a'] },
      ]),
    ).toThrow(/circular/);
    expect(() => validateDag([{ ...base, key: 'a', dependsOn: ['missing'] }])).toThrow(/missing/);
    expect(() =>
      validateDag([
        { ...base, key: 'a', dependsOn: [] },
        { ...base, key: 'a', dependsOn: [] },
      ]),
    ).toThrow(/duplicate/);
  });
  it('requires enough steps for the selected squad', () =>
    expect(() => initialPlan(agents, agents[0].id, 'round_table', 4)).toThrow(/at least 7/));
  it('parses only actual bounded agent assignments', () => {
    const content = JSON.stringify({
      tasks: [
        {
          key: 'research',
          title: 'Research',
          instructions: 'Analyze the problem',
          agent_id: agents[0].id,
          depends_on: [],
        },
      ],
    });
    const specs = parseDelegatedPlan(content, agents, agents[1].id, agents[2].id, 6);
    expect(specs[0].recipientId).toBe(agents[1].id);
    expect(() => parseDelegatedPlan('not json', agents, agents[1].id, agents[2].id, 6)).toThrow(/valid JSON/);
    expect(() =>
      parseDelegatedPlan(
        content.replace(agents[0].id, '00000000-0000-4000-8000-000000000099'),
        agents,
        agents[1].id,
        agents[2].id,
        6,
      ),
    ).toThrow(/outside/);
  });
  it('delivers dependency outputs and human instructions with explicit truncation', () => {
    const context = buildContext({
      agent: agents[0],
      mode: 'round_table',
      title: 'Mission',
      brief: 'Build safely',
      task: { id: 'task-2', title: 'Review', instructions: 'Review actual work', kind: 'work' },
      dependencies: [
        { id: 'task-1', title: 'Produce', output: 'ACTUAL_FINDING '.repeat(2000), agent_id: agents[1].id },
      ],
      instructions: [{ content: 'Prioritize authorization', created_at: new Date().toISOString() }],
      squad: agents,
      maxSteps: 24,
    });
    expect(context.messages[1].content).toContain('ACTUAL_FINDING');
    expect(context.messages[1].content).toContain('task-1');
    expect(context.messages[1].content).toContain('Prioritize authorization');
    expect(context.truncated).toBe(true);
    expect(context.messages[0].content).toContain('no browsing');
    expect(estimateTokens('abc')).toBeGreaterThan(0);
  });
});
