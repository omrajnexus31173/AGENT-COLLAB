import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { providerSchema } from '@/lib/contracts';
import { query, one, audit } from './db';
import { decryptCredential, encryptCredential } from './crypto';
import { AppError } from './errors';
import { getProvider } from './repository';
import { chat, listModels, defaultTransport, type ProviderConfig, type Transport } from './providers';
import { validateEndpoint } from './safe-http';
import { notFound } from './http';

type ProviderInput = z.infer<typeof providerSchema>;
interface SecretRow {
  id: string;
  user_id: string;
  kind: ProviderConfig['kind'];
  protocol: ProviderConfig['protocol'];
  base_url: string;
  default_model: string;
  encrypted_key: string | null;
  credential_iv: string | null;
  credential_tag: string | null;
  updated_at: string;
}
export async function saveProvider(userId: string, input: ProviderInput, id?: string) {
  validateEndpoint(input.base_url);
  if (['openai', 'anthropic', 'gemini', 'openrouter'].includes(input.kind) && !input.api_key && !id)
    throw new AppError(422, 'Enter an API key for this provider.');
  const connectionId = id || randomUUID();
  const encrypted: Partial<ReturnType<typeof encryptCredential>> = input.api_key
    ? encryptCredential(input.api_key, `${userId}:${connectionId}`)
    : {};
  const hint = input.api_key
    ? input.api_key.length > 8
      ? `••••${input.api_key.slice(-4)}`
      : '••••••••'
    : null;
  if (id) {
    const result = await query(
      `UPDATE provider_connections SET name=$3,kind=$4,protocol=$5,base_url=$6,default_model=$7,selected_models=$8,enabled=$9,
      encrypted_key=coalesce($10,encrypted_key),credential_iv=coalesce($11,credential_iv),credential_tag=coalesce($12,credential_tag),key_hint=coalesce($13,key_hint),
      verification_status='unverified',verified_at=NULL,verified_model=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id`,
      [
        id,
        userId,
        input.name,
        input.kind,
        input.protocol,
        input.base_url,
        input.default_model,
        JSON.stringify(input.selected_models),
        input.enabled,
        encrypted.encrypted_key || null,
        encrypted.credential_iv || null,
        encrypted.credential_tag || null,
        hint,
      ],
    );
    if (!result.length) throw notFound();
  } else {
    await query(
      `INSERT INTO provider_connections(id,user_id,name,kind,protocol,base_url,default_model,selected_models,enabled,encrypted_key,credential_iv,credential_tag,key_hint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        connectionId,
        userId,
        input.name,
        input.kind,
        input.protocol,
        input.base_url,
        input.default_model,
        JSON.stringify(input.selected_models),
        input.enabled,
        encrypted.encrypted_key || null,
        encrypted.credential_iv || null,
        encrypted.credential_tag || null,
        hint,
      ],
    );
  }
  await audit(userId, id ? 'provider.updated' : 'provider.created', connectionId, { kind: input.kind });
  return getProvider(userId, connectionId);
}
export async function providerConfig(
  userId: string,
  id: string,
): Promise<ProviderConfig & { updated_at: string }> {
  const row = await one<SecretRow>(
    'SELECT id,user_id,kind,protocol,base_url,default_model,encrypted_key,credential_iv,credential_tag,updated_at::text AS updated_at FROM provider_connections WHERE id=$1 AND user_id=$2',
    [id, userId],
  );
  if (!row) throw notFound();
  const api_key =
    row.encrypted_key && row.credential_iv && row.credential_tag
      ? decryptCredential(row.encrypted_key, row.credential_iv, row.credential_tag, `${userId}:${id}`)
      : null;
  return {
    id: row.id,
    kind: row.kind,
    protocol: row.protocol,
    base_url: row.base_url,
    default_model: row.default_model,
    api_key,
    updated_at: row.updated_at,
  };
}
export async function verifyProvider(userId: string, id: string, transport: Transport = defaultTransport) {
  const config = await providerConfig(userId, id);
  const started = Date.now();
  try {
    const result = await chat(
      config,
      [
        {
          role: 'user',
          content: 'Reply with a short connection-test acknowledgment. This is an authentication test.',
        },
      ],
      { maxTokens: 256, temperature: 0, timeoutMs: 30000 },
      transport,
    );
    const changed = await query(
      `UPDATE provider_connections SET verification_status='verified',verified_at=now(),verified_model=$3,last_error=NULL,updated_at=now() WHERE id=$1 AND user_id=$2 AND updated_at=$4::timestamptz RETURNING id`,
      [id, userId, result.model, config.updated_at],
    );
    await query(
      `INSERT INTO usage_records(user_id,connection_id,purpose,input_tokens,output_tokens,total_tokens,estimated,duration_ms,response_model,provider_request_id)
      VALUES($1,$2,'verification',$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId,
        id,
        result.inputTokens,
        result.outputTokens,
        result.totalTokens ?? Math.ceil(result.content.length / 3) + 20,
        result.totalTokens === null,
        Date.now() - started,
        result.model,
        result.requestId,
      ],
    );
    await audit(userId, 'provider.verified', id, { model: result.model });
    const connection = await getProvider(userId, id);
    return {
      connection,
      verified: changed.length > 0 && connection.verification_status === 'verified',
      message: changed.length
        ? 'Authenticated with a real model response.'
        : 'Configuration changed during the test. Test the current configuration again.',
    };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : 'The provider could not be verified. Check the configuration and try again.';
    await query(
      `UPDATE provider_connections SET verification_status='error',verified_at=NULL,verified_model=NULL,last_error=$3,updated_at=now() WHERE id=$1 AND user_id=$2 AND updated_at=$4::timestamptz`,
      [id, userId, message.slice(0, 500), config.updated_at],
    );
    await audit(userId, 'provider.verification_failed', id);
    return { connection: await getProvider(userId, id), verified: false, message };
  }
}
export async function discoverProviderModels(userId: string, id: string) {
  const config = await providerConfig(userId, id);
  return { models: await listModels(config), verification_changed: false };
}
export async function disconnectProvider(userId: string, id: string) {
  const result = await query('DELETE FROM provider_connections WHERE id=$1 AND user_id=$2 RETURNING id', [
    id,
    userId,
  ]);
  if (!result.length) throw notFound();
  await audit(userId, 'provider.disconnected', id);
  return { disconnected: true };
}
