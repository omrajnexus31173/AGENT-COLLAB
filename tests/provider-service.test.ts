import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, prepareTestDatabase, resetDatabase } from './helpers/database';
import { signup } from '@/lib/server/auth';
import {
  saveProvider,
  verifyProvider,
  disconnectProvider,
  providerConfig,
} from '@/lib/server/provider-service';
import { getProvider, listAgents } from '@/lib/server/repository';
import { one, query } from '@/lib/server/db';
import { fixtureTransport } from './helpers/transport';
beforeAll(prepareTestDatabase);
beforeEach(resetDatabase);
afterAll(closeDatabase);
const input = {
  name: 'Test OpenAI',
  kind: 'openai' as const,
  protocol: 'openai' as const,
  base_url: 'https://api.openai.com/v1',
  default_model: 'fixture-model',
  api_key: 'OFFLINE_SERVICE_TEST_KEY',
  selected_models: [],
  enabled: true,
};
describe('honest connection lifecycle', () => {
  it('saves unverified, encrypts at rest, verifies only after a response, and never projects secrets', async () => {
    const user = await signup('Tester', 'provider-test@example.test', 'A-secure-test-password');
    const saved = await saveProvider(user.id, input);
    expect(saved.verification_status).toBe('unverified');
    expect(saved.verified_at).toBeNull();
    expect(JSON.stringify(saved)).not.toContain('OFFLINE_SERVICE_TEST_KEY');
    expect(JSON.stringify(saved)).not.toContain('encrypted_key');
    const raw = await one<{ encrypted_key: string }>(
      'SELECT encrypted_key FROM provider_connections WHERE id=$1',
      [saved.id],
    );
    expect(raw!.encrypted_key).not.toContain('OFFLINE_SERVICE_TEST_KEY');
    const { transport } = fixtureTransport([]);
    const verified = await verifyProvider(user.id, saved.id, transport);
    expect(verified.verified).toBe(true);
    expect(verified.connection.verification_status).toBe('verified');
    expect(verified.connection.verified_model).toBe('fixture-model');
    const usage = await one('SELECT * FROM usage_records WHERE connection_id=$1', [saved.id]);
    expect(usage?.purpose).toBe('verification');
  });
  it('records verification failure without exposing the key or claiming success', async () => {
    const user = await signup('Tester', 'provider-fail@example.test', 'A-secure-test-password');
    const saved = await saveProvider(user.id, input);
    const result = await verifyProvider(user.id, saved.id, {
      request: async () => ({
        status: 401,
        body: Buffer.from(JSON.stringify({ error: { message: 'Invalid key OFFLINE_SERVICE_TEST_KEY' } })),
        headers: {},
      }),
    });
    expect(result.verified).toBe(false);
    expect(result.connection.verification_status).toBe('error');
    expect(result.connection.last_error).not.toContain('OFFLINE_SERVICE_TEST_KEY');
    expect(result.connection.verified_at).toBeNull();
  });
  it('invalidates old verification when configuration changes and unassigns agents on disconnect', async () => {
    const user = await signup('Tester', 'provider-update@example.test', 'A-secure-test-password');
    const saved = await saveProvider(user.id, input);
    const { transport } = fixtureTransport([]);
    await verifyProvider(user.id, saved.id, transport);
    const agent = (await listAgents(user.id))[0];
    await query('UPDATE agents SET connection_id=$2,model=$3 WHERE id=$1', [
      agent.id,
      saved.id,
      input.default_model,
    ]);
    const updated = await saveProvider(user.id, { ...input, default_model: 'changed-model' }, saved.id);
    expect(updated.verification_status).toBe('unverified');
    expect((await providerConfig(user.id, saved.id)).api_key).toBe('OFFLINE_SERVICE_TEST_KEY');
    await disconnectProvider(user.id, saved.id);
    expect((await listAgents(user.id)).find((a) => a.id === agent.id)?.connection_id).toBeNull();
    await expect(getProvider(user.id, saved.id)).rejects.toThrow(/not found/);
  });
});
