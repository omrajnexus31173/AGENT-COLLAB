import type { Protocol, ProviderKind } from '@/lib/types';
import { AppError } from './errors';
import { safeRequest, validateEndpoint, type SafeResponse } from './safe-http';

export interface ProviderConfig {
  id?: string;
  kind: ProviderKind;
  protocol: Protocol;
  base_url: string;
  default_model: string;
  api_key?: string | null;
}
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface ChatResult {
  content: string;
  model: string;
  requestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
}
export interface Transport {
  request: (
    url: string,
    options: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ) => Promise<SafeResponse>;
}
export const defaultTransport: Transport = { request: safeRequest };
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export function endpoint(config: ProviderConfig, path: string) {
  const base = validateEndpoint(config.base_url);
  if (config.protocol === 'ollama' && base.pathname !== '/' && base.pathname !== '')
    throw new AppError(422, 'For Ollama, use the server origin without /api or /v1.', 'UNSAFE_ENDPOINT');
  return `${base.toString().replace(/\/$/, '')}${path}`;
}
export function headers(config: ProviderConfig): Record<string, string> {
  const key = config.api_key || '';
  if (config.protocol === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (config.protocol === 'gemini') return { 'x-goog-api-key': key };
  const result: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  if (config.kind === 'openrouter') {
    result['HTTP-Referer'] = process.env.APP_ORIGIN || 'https://nexus-arcade.local';
    result['X-Title'] = 'Nexus Arcade';
  }
  return result;
}
export function buildChatRequest(config: ProviderConfig, messages: ChatMessage[], options: ChatOptions = {}) {
  const model = options.model || config.default_model;
  const maxTokens = options.maxTokens || 1024;
  const temperature = options.temperature ?? 0.4;
  let path: string;
  let payload: Record<string, unknown>;
  if (config.protocol === 'anthropic') {
    path = '/messages';
    payload = {
      model,
      max_tokens: maxTokens,
      temperature: Math.min(temperature, 1),
      system: messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n'),
      messages: messages.filter((m) => m.role !== 'system'),
      stream: false,
    };
  } else if (config.protocol === 'gemini') {
    path = `/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`;
    const system = messages.filter((m) => m.role === 'system');
    payload = {
      contents: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      ...(system.length
        ? { systemInstruction: { parts: [{ text: system.map((m) => m.content).join('\n\n') }] } }
        : {}),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
  } else if (config.protocol === 'ollama') {
    path = '/api/chat';
    payload = { model, messages, stream: false, options: { temperature, num_predict: maxTokens } };
  } else {
    path = '/chat/completions';
    const reasoning = config.kind === 'openai' && /^(gpt-5|o[134])/.test(model);
    payload = {
      model,
      messages,
      stream: false,
      ...(reasoning
        ? {
            max_completion_tokens: maxTokens,
            ...(model.startsWith('gpt-5') ? { reasoning_effort: 'low' as const } : {}),
          }
        : { max_tokens: maxTokens, temperature }),
    };
  }
  return { url: endpoint(config, path), payload };
}
function providerError(config: ProviderConfig, response: SafeResponse): AppError {
  let detail = '';
  try {
    const value = JSON.parse(response.body.toString('utf8'));
    const raw = value?.error?.message || value?.error || value?.message;
    if (typeof raw === 'string') detail = raw;
  } catch {
    /* Never expose arbitrary upstream HTML. */
  }
  if (config.api_key) detail = detail.split(config.api_key).join('[redacted]');
  detail = detail.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 240);
  const status = response.status;
  const message =
    status === 401 || status === 403
      ? 'The provider rejected the credentials or model permissions.'
      : status === 404
        ? 'The model or API endpoint was not found.'
        : status === 429
          ? 'The provider rate limit or quota was reached.'
          : `The provider returned HTTP ${status}.`;
  return new AppError(
    502,
    `${message}${detail ? ` ${detail}` : ''}`,
    'PROVIDER_ERROR',
    status === 408 || status === 429 || status >= 500,
  );
}
function parseJson(response: SafeResponse): Record<string, unknown> {
  try {
    const value = JSON.parse(response.body.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AppError(
      502,
      'The endpoint did not return a compatible JSON object. Check the protocol and base URL.',
      'PROTOCOL_ERROR',
    );
  }
}
export function parseChatResponse(
  config: ProviderConfig,
  response: SafeResponse,
  requestedModel: string,
): ChatResult {
  if (response.status < 200 || response.status >= 300) throw providerError(config, response);
  const data = parseJson(response);
  let content = '',
    inputTokens: number | null = null,
    outputTokens: number | null = null,
    totalTokens: number | null = null,
    finishReason: string | null = null;
  let model = requestedModel,
    requestId = typeof data.id === 'string' ? data.id.slice(0, 200) : null;
  const headerId = response.headers['x-request-id'];
  if (typeof headerId === 'string') requestId = headerId.slice(0, 200);
  if (config.protocol === 'anthropic') {
    content = Array.isArray(data.content)
      ? data.content
          .filter(
            (p): p is { type: 'text'; text: string } => p?.type === 'text' && typeof p.text === 'string',
          )
          .map((p) => p.text)
          .join('\n')
      : '';
    const usage = data.usage as Record<string, unknown> | undefined;
    inputTokens = count(usage?.input_tokens);
    outputTokens = count(usage?.output_tokens);
    totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
    model = text(data.model) || model;
    finishReason = text(data.stop_reason) || null;
  } else if (config.protocol === 'gemini') {
    const candidate = Array.isArray(data.candidates) ? data.candidates[0] : null;
    const parts = candidate?.content?.parts;
    content = Array.isArray(parts)
      ? parts
          .filter((p: { text?: unknown; thought?: boolean }) => typeof p.text === 'string' && !p.thought)
          .map((p: { text: string }) => p.text)
          .join('\n')
      : '';
    const usage = data.usageMetadata as Record<string, unknown> | undefined;
    inputTokens = count(usage?.promptTokenCount);
    outputTokens = count(usage?.candidatesTokenCount);
    totalTokens = count(usage?.totalTokenCount);
    if (totalTokens === null && inputTokens !== null && outputTokens !== null)
      totalTokens = inputTokens + outputTokens;
    model = text(data.modelVersion) || model;
    finishReason = text(candidate?.finishReason) || null;
  } else if (config.protocol === 'ollama') {
    const message = data.message as Record<string, unknown> | undefined;
    content = text(message?.content);
    inputTokens = count(data.prompt_eval_count);
    outputTokens = count(data.eval_count);
    totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
    model = text(data.model) || model;
    finishReason = text(data.done_reason) || (data.done ? 'stop' : null);
  } else {
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    const usage = data.usage as Record<string, unknown> | undefined;
    content = text(choice?.message?.content);
    inputTokens = count(usage?.prompt_tokens);
    outputTokens = count(usage?.completion_tokens);
    totalTokens = count(usage?.total_tokens);
    if (totalTokens === null && inputTokens !== null && outputTokens !== null)
      totalTokens = inputTokens + outputTokens;
    model = text(data.model) || model;
    finishReason = text(choice?.finish_reason) || null;
  }
  if (!content.trim())
    throw new AppError(
      502,
      'The provider returned no usable text. Check model access and the output-token limit.',
      'EMPTY_RESPONSE',
    );
  if (['length', 'max_tokens', 'MAX_TOKENS'].includes(finishReason || ''))
    throw new AppError(
      502,
      'The model output was truncated. Increase this agent’s output-token limit before retrying.',
      'OUTPUT_TRUNCATED',
    );
  if (finishReason === 'content_filter' || finishReason === 'SAFETY')
    throw new AppError(502, 'The provider blocked this response under its safety policy.', 'CONTENT_BLOCKED');
  return {
    content: content.trim(),
    model: model.slice(0, 160),
    requestId,
    inputTokens,
    outputTokens,
    totalTokens,
    finishReason,
  };
}
export async function chat(
  config: ProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
  transport = defaultTransport,
): Promise<ChatResult> {
  if (
    (['openai', 'anthropic', 'gemini', 'openrouter'] as ProviderKind[]).includes(config.kind) &&
    !config.api_key
  )
    throw new AppError(422, 'This provider requires an API key.', 'MISSING_CREDENTIAL');
  const request = buildChatRequest(config, messages, options);
  const response = await transport.request(request.url, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(request.payload),
    timeoutMs: options.timeoutMs || 90000,
    signal: options.signal,
  });
  return parseChatResponse(config, response, options.model || config.default_model);
}
export async function listModels(config: ProviderConfig, transport = defaultTransport): Promise<string[]> {
  const path =
    config.protocol === 'anthropic'
      ? '/models?limit=100'
      : config.protocol === 'gemini'
        ? '/models?pageSize=100'
        : config.protocol === 'ollama'
          ? '/api/tags'
          : '/models';
  const response = await transport.request(endpoint(config, path), {
    headers: headers(config),
    timeoutMs: 20000,
  });
  if (response.status < 200 || response.status >= 300) throw providerError(config, response);
  const data = parseJson(response);
  const entries = config.protocol === 'ollama' ? data.models : data.data || data.models;
  if (!Array.isArray(entries))
    throw new AppError(
      502,
      'This endpoint does not expose a compatible model list. Enter a model ID manually.',
      'PROTOCOL_ERROR',
    );
  return entries
    .slice(0, 100)
    .map((entry: Record<string, unknown>) => {
      const name = config.protocol === 'ollama' ? text(entry.name) : text(entry.id) || text(entry.name);
      return name.replace(/^models\//, '');
    })
    .filter(Boolean)
    .sort();
}
