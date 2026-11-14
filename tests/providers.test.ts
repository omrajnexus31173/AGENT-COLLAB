import { describe, expect, it } from 'vitest';
import {
  buildChatRequest,
  chat,
  headers,
  listModels,
  parseChatResponse,
  type ProviderConfig,
} from '@/lib/server/providers';
import type { SafeResponse } from '@/lib/server/safe-http';
const config: ProviderConfig = {
  kind: 'openai',
  protocol: 'openai',
  base_url: 'https://api.openai.com/v1',
  default_model: 'test-model',
  api_key: 'OFFLINE_FIXTURE_KEY',
};
const response = (data: unknown, status = 200): SafeResponse => ({
  status,
  body: Buffer.from(JSON.stringify(data)),
  headers: {},
});
describe('real provider protocol adapters (offline fixtures)', () => {
  it('builds OpenAI-compatible requests without putting keys in URLs or payloads', () => {
    const request = buildChatRequest(config, [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'mission' },
    ]);
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.url).not.toContain(config.api_key!);
    expect(JSON.stringify(request.payload)).not.toContain(config.api_key!);
    expect(request.payload.max_tokens).toBe(1024);
    expect(headers(config).authorization).toBe('Bearer OFFLINE_FIXTURE_KEY');
  });
  it('uses max_completion_tokens for reasoning-capable OpenAI model families', () => {
    const request = buildChatRequest({ ...config, default_model: 'gpt-5-mini' }, []);
    expect(request.payload.max_completion_tokens).toBe(1024);
    expect(request.payload).not.toHaveProperty('temperature');
  });
  it('builds Anthropic system/messages and authentication headers', () => {
    const c = {
      ...config,
      kind: 'anthropic' as const,
      protocol: 'anthropic' as const,
      base_url: 'https://api.anthropic.com/v1',
    };
    const request = buildChatRequest(
      c,
      [
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'hello' },
      ],
      { temperature: 1.8 },
    );
    expect(request.url).toContain('/messages');
    expect(request.payload.system).toBe('rules');
    expect(request.payload.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(request.payload.temperature).toBe(1);
    expect(headers(c)['anthropic-version']).toBe('2023-06-01');
    const parsed = parseChatResponse(
      c,
      response({
        id: 'msg_1',
        model: 'claude-test',
        content: [{ type: 'text', text: 'actual fixture' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 7 },
      }),
      'claude-test',
    );
    expect(parsed.content).toBe('actual fixture');
    expect(parsed.totalTokens).toBe(19);
  });
  it('builds Gemini contents and parses usage', () => {
    const c = {
      ...config,
      kind: 'gemini' as const,
      protocol: 'gemini' as const,
      base_url: 'https://generativelanguage.googleapis.com/v1beta',
    };
    const request = buildChatRequest(c, [
      { role: 'system', content: 'rules' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'previous' },
    ]);
    expect(request.url).toContain('/models/test-model:generateContent');
    expect(request.payload.systemInstruction).toBeDefined();
    expect(headers(c)['x-goog-api-key']).toBe(config.api_key);
    const parsed = parseChatResponse(
      c,
      response({
        modelVersion: 'gemini-test',
        candidates: [{ content: { parts: [{ text: 'fixture' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      }),
      'test-model',
    );
    expect(parsed.totalTokens).toBe(15);
  });
  it('builds Ollama native chat and parses native counts', () => {
    process.env.ALLOW_LOCAL_PROVIDERS = 'true';
    try {
      const c = {
        ...config,
        kind: 'ollama' as const,
        protocol: 'ollama' as const,
        base_url: 'http://127.0.0.1:11434',
        api_key: null,
      };
      const request = buildChatRequest(c, [{ role: 'user', content: 'hello' }]);
      expect(request.url).toBe('http://127.0.0.1:11434/api/chat');
      expect(request.payload.stream).toBe(false);
      const parsed = parseChatResponse(
        c,
        response({
          model: 'local-test',
          message: { content: 'local fixture' },
          done: true,
          prompt_eval_count: 8,
          eval_count: 4,
        }),
        'local-test',
      );
      expect(parsed.totalTokens).toBe(12);
    } finally {
      delete process.env.ALLOW_LOCAL_PROVIDERS;
    }
  });
  it('rejects empty, truncated, unsafe, malformed, and unauthorized responses', () => {
    expect(() =>
      parseChatResponse(config, response({ choices: [{ message: { content: '' } }] }), 'm'),
    ).toThrow(/no usable text/);
    expect(() =>
      parseChatResponse(
        config,
        response({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }),
        'm',
      ),
    ).toThrow(/truncated/);
    expect(() =>
      parseChatResponse(config, response({ error: { message: 'bad key OFFLINE_FIXTURE_KEY' } }, 401), 'm'),
    ).toThrow(/rejected/);
    try {
      parseChatResponse(config, response({ error: { message: 'bad key OFFLINE_FIXTURE_KEY' } }, 401), 'm');
    } catch (e) {
      expect((e as Error).message).not.toContain(config.api_key!);
    }
    expect(() =>
      parseChatResponse(config, { status: 200, body: Buffer.from('<html></html>'), headers: {} }, 'm'),
    ).toThrow(/JSON/);
  });
  it('marks missing usage as unknown rather than inventing provider counts', () => {
    const parsed = parseChatResponse(
      config,
      response({ choices: [{ message: { content: 'fixture' }, finish_reason: 'stop' }] }),
      'm',
    );
    expect(parsed.totalTokens).toBeNull();
    expect(parsed.inputTokens).toBeNull();
  });
  it('discovers model lists without claiming verification', async () => {
    const result = await listModels(config, {
      request: async () => response({ data: [{ id: 'model-b' }, { id: 'model-a' }] }),
    });
    expect(result).toEqual(['model-a', 'model-b']);
  });
  it('passes abort signals and refuses cloud providers without credentials', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    await chat(
      config,
      [{ role: 'user', content: 'hi' }],
      { signal: controller.signal },
      {
        request: async (_url, options) => {
          received = options.signal;
          return response({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
        },
      },
    );
    expect(received).toBe(controller.signal);
    await expect(chat({ ...config, api_key: null }, [])).rejects.toThrow(/requires an API key/);
  });
});
