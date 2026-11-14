import type { Transport } from '@/lib/server/providers';
import type { SafeResponse } from '@/lib/server/safe-http';
export interface FixtureCall {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  signal?: AbortSignal;
}
/** Offline protocol fixture. This is never imported by application code or used as a live provider. */
export function fixtureTransport(
  agents: { id: string; name: string }[],
  hook?: (call: FixtureCall, index: number) => Promise<void>,
) {
  const calls: FixtureCall[] = [];
  const transport: Transport = {
    request: async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      const call = { url, body, headers: options.headers || {}, signal: options.signal };
      const index = calls.length;
      calls.push(call);
      if (hook) await hook(call, index);
      const model = String(body.model);
      let content = `OFFLINE_TEST_FIXTURE_OUTPUT_${model}_${index}`;
      const messages = body.messages as { role: string; content: string }[];
      const system = messages?.find((m) => m.role === 'system')?.content || '';
      if (system.includes('Return ONLY a JSON object'))
        content = JSON.stringify({
          tasks: [
            {
              key: 'delegate_research',
              title: 'Fixture research delegation',
              instructions: 'Analyze the supplied mission and return a fixture finding.',
              agent_id: agents[0].id,
              depends_on: [],
            },
            {
              key: 'delegate_review',
              title: 'Fixture dependent review',
              instructions: 'Review the actual research finding supplied by the orchestrator.',
              agent_id: agents[1].id,
              depends_on: ['delegate_research'],
            },
          ],
        });
      if (system.includes('final synthesis lead')) content = `OFFLINE_TEST_FIXTURE_SYNTHESIS\n\n${content}`;
      const response: SafeResponse = {
        status: 200,
        body: Buffer.from(
          JSON.stringify({
            id: `fixture-request-${index}`,
            model,
            choices: [{ message: { content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        ),
        headers: { 'x-request-id': `fixture-header-${index}` },
      };
      return response;
    },
  };
  return { transport, calls };
}
