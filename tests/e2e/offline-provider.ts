import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

/** Test-only HTTP endpoint. Never imported by src/ and never a production fallback. */
export async function startOfflineProvider() {
  const state = { mode: 'normal' as 'normal' | 'hold' | 'fail', calls: 0, held: 0 };
  const waiting = new Set<() => void>();
  const responses = new Set<import('node:http').ServerResponse>();
  const server: Server = createServer(async (req, res) => {
    responses.add(res);
    res.on('close', () => responses.delete(res));
    const reply = (status: number, data: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, {
        'content-type': 'application/json',
        'x-request-id': `offline-http-${state.calls}`,
      });
      res.end(JSON.stringify(data));
    };
    if (req.headers.authorization !== 'Bearer OFFLINE_HTTP_FIXTURE_KEY') {
      reply(401, { error: { message: 'Offline fixture credential rejected.' } });
      return;
    }
    if (req.url === '/v1/models') {
      reply(200, { data: [{ id: 'offline-http-fixture' }] });
      return;
    }
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST') {
      reply(404, { error: { message: 'Unsupported fixture route.' } });
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const index = ++state.calls;
    if (state.mode === 'fail') {
      reply(401, { error: { message: 'Explicit offline fixture failure.' } });
      return;
    }
    if (state.mode === 'hold') {
      state.held++;
      await new Promise<void>((resolve) => waiting.add(resolve));
      state.held--;
    }
    const system = String(body.messages?.find((m: { role: string }) => m.role === 'system')?.content || '');
    let content = `OFFLINE_HTTP_FIXTURE_OUTPUT_${body.model}_${index}`;
    if (system.includes('final synthesis lead')) content = `OFFLINE_HTTP_FIXTURE_SYNTHESIS\n\n${content}`;
    reply(200, {
      id: `offline-http-${index}`,
      model: body.model,
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
    });
  });
  await new Promise<void>((resolve) => server.listen(3101, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    state,
    url: `http://127.0.0.1:${port}/v1`,
    release: () => {
      for (const resolve of waiting) resolve();
      waiting.clear();
    },
    close: async () => {
      for (const resolve of waiting) resolve();
      waiting.clear();
      for (const res of responses) res.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
