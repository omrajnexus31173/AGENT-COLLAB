'use client';
import { useState } from 'react';
import {
  Aperture,
  ArrowRight,
  Box,
  CheckCircle2,
  CircuitBoard,
  Code2,
  Download,
  KeyRound,
  Link2,
  Plug,
  Plus,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Unplug,
  Zap,
} from 'lucide-react';
import type { ProviderConnection, ProviderKind, Protocol } from '@/lib/types';
import { DEFAULT_BASE_URLS, PROVIDER_LABELS, PROVIDERS } from '@/lib/types';
import { api, useResource } from '@/lib/client';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorNotice,
  PageHeading,
  Panel,
  Status,
  Toggle,
  useToast,
  relativeTime,
} from './ui';
const providerIcons = {
  openai: Aperture,
  gemini: Sparkles,
  anthropic: CircuitBoard,
  openrouter: Link2,
  ollama: Box,
  lmstudio: Terminal,
  compatible: Code2,
  custom: Plug,
};
const suggestions: Record<ProviderKind, string> = {
  openai: 'e.g. gpt-4.1-mini',
  gemini: 'e.g. gemini-2.5-flash',
  anthropic: 'e.g. claude-sonnet-4-5',
  openrouter: 'e.g. openai/gpt-4.1-mini',
  ollama: 'e.g. llama3.2',
  lmstudio: 'Your loaded model identifier',
  compatible: 'Provider’s model identifier',
  custom: 'Provider’s model identifier',
};
interface FormState {
  name: string;
  kind: ProviderKind;
  protocol: Protocol;
  base_url: string;
  default_model: string;
  api_key: string;
  selected_models: string[];
  enabled: boolean;
}
const blank = (kind: ProviderKind): FormState => ({
  name: PROVIDER_LABELS[kind],
  kind,
  protocol:
    kind === 'anthropic'
      ? 'anthropic'
      : kind === 'gemini'
        ? 'gemini'
        : kind === 'ollama'
          ? 'ollama'
          : 'openai',
  base_url: DEFAULT_BASE_URLS[kind],
  default_model: '',
  api_key: '',
  selected_models: [],
  enabled: true,
});
export function Connections({ initial }: { initial: ProviderConnection[] }) {
  const { data, loading, error, refresh } = useResource<{ connections: ProviderConnection[] }>(
    '/api/providers',
    { connections: initial },
  );
  const connections = data?.connections || initial;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blank('openai'));
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProviderConnection | null>(null);
  function start(kind: ProviderKind = 'openai', connection?: ProviderConnection) {
    setEditing(connection?.id || null);
    setForm(
      connection
        ? {
            name: connection.name,
            kind: connection.kind,
            protocol: connection.protocol,
            base_url: connection.base_url,
            default_model: connection.default_model,
            api_key: '',
            selected_models: connection.selected_models,
            enabled: connection.enabled,
          }
        : blank(kind),
    );
    setModels(connection?.selected_models || []);
    setFormError('');
    setOpen(true);
  }
  async function save(verify: boolean) {
    setBusy(true);
    setFormError('');
    try {
      const result = await api<{ connection: ProviderConnection }>(
        editing ? `/api/providers/${editing}` : '/api/providers',
        { method: editing ? 'PUT' : 'POST', body: { ...form, api_key: form.api_key || undefined } },
      );
      setEditing(result.connection.id);
      await refresh();
      if (verify) {
        const test = await api<{ verified: boolean; message: string }>(
          `/api/providers/${result.connection.id}/test`,
          { method: 'POST', body: {} },
        );
        await refresh();
        if (test.verified) {
          toast('Connection verified with a real model response.');
          setOpen(false);
        } else setFormError(test.message);
      } else {
        toast('Connection saved as unverified. Run a connection test before assigning agents.');
        setOpen(false);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save this connection.');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function test(connection: ProviderConnection) {
    setTesting(connection.id);
    try {
      const result = await api<{ verified: boolean; message: string }>(
        `/api/providers/${connection.id}/test`,
        { method: 'POST', body: {} },
      );
      toast(result.verified ? 'Provider verified.' : result.message, result.verified ? 'success' : 'error');
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Verification failed.', 'error');
    } finally {
      setTesting(null);
    }
  }
  async function discover() {
    if (!editing) return;
    setBusy(true);
    setFormError('');
    try {
      const result = await api<{ models: string[] }>(`/api/providers/${editing}/models`);
      setModels(result.models);
      if (!result.models.length)
        setFormError('The endpoint returned an empty model list. Enter a model ID manually.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not discover models.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BRING YOUR OWN INTELLIGENCE"
        title="Connection center"
        description="Connect the models you trust. Credentials stay encrypted on the server."
        action={
          <Button onClick={() => start()}>
            <Plus size={16} /> Add connection
          </Button>
        }
      />
      <div className="notice notice-info" style={{ marginBottom: 24 }}>
        <ShieldCheck size={17} />
        <div>
          A saved key is not a verified connection. Every provider must pass a real model request before it
          can power a mission. Verification requests may incur a small provider charge.
        </div>
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="connection-grid">
        {connections.map((connection) => {
          const Icon = providerIcons[connection.kind];
          return (
            <article className="connection-card" key={connection.id}>
              <div className="connection-card-top">
                <span className="provider-icon">
                  <Icon size={24} />
                </span>
                <Status status={connection.enabled ? connection.verification_status : 'neutral'}>
                  {connection.enabled ? connection.verification_status : 'Disabled'}
                </Status>
              </div>
              <h3>{connection.name}</h3>
              <div className="provider-kind">
                {PROVIDER_LABELS[connection.kind]} · {connection.protocol} protocol
              </div>
              <div className="connection-model" title={connection.default_model}>
                {connection.default_model}
              </div>
              <div className="connection-meta">
                <KeyRound size={12} />
                {connection.has_credential ? connection.key_hint : 'No API key · local endpoint'}
              </div>
              {connection.verified_at && (
                <div className="connection-meta">
                  <CheckCircle2 size={12} />
                  Tested {relativeTime(connection.verified_at)}
                </div>
              )}
              {connection.last_error && (
                <p className="connection-error" title={connection.last_error}>
                  {connection.last_error}
                </p>
              )}
              <div className="connection-actions">
                <Button
                  variant="secondary"
                  className="button-small"
                  loading={testing === connection.id}
                  disabled={!!testing}
                  onClick={() => void test(connection)}
                >
                  <Zap size={13} />
                  {testing === connection.id ? 'Testing…' : 'Test connection'}
                </Button>
                <Button
                  variant="ghost"
                  className="button-small"
                  onClick={() => start(connection.kind, connection)}
                >
                  Configure
                </Button>
                <button
                  className="icon-button"
                  aria-label={`Disconnect ${connection.name}`}
                  title="Disconnect"
                  onClick={() => setDeleting(connection)}
                >
                  <Unplug size={15} />
                </button>
              </div>
            </article>
          );
        })}
        <button className="add-connection-card" onClick={() => start()}>
          <span>
            <Plus size={23} />
          </span>
          <strong>Add a new intelligence</strong>
          <small>Cloud APIs, local models, or your own endpoint</small>
        </button>
      </div>
      {!connections.length && !loading && (
        <Panel style={{ marginTop: 24 }}>
          <EmptyState
            icon={<Plug size={27} />}
            title="Your universe is ready to connect."
            description="Start with a cloud provider or a local Ollama / LM Studio server. You can connect multiple providers and mix their models in one squad."
            action={
              <Button onClick={() => start()}>
                Connect your first provider <ArrowRight size={15} />
              </Button>
            }
          />
        </Panel>
      )}
      <div className="help-box" style={{ marginTop: 24 }}>
        <strong>Local models stay on your machine.</strong> Ollama and LM Studio run on the application
        server’s machine, not in your browser. A self-hosted deployment must reach them over the network.
        Local HTTP endpoints require the operator setting <code>ALLOW_LOCAL_PROVIDERS=true</code>;
        private-network access is blocked by default.
      </div>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={editing ? 'Configure connection' : 'Connect a provider'}
        wide
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Choose a provider pathway. Your key is encrypted at rest and is never returned to the browser.
          </p>
          <div className="provider-picker">
            {PROVIDERS.map((kind) => {
              const Icon = providerIcons[kind];
              return (
                <button
                  key={kind}
                  className={form.kind === kind ? 'active' : ''}
                  onClick={() => {
                    const next = blank(kind);
                    setForm({
                      ...next,
                      name: form.name === PROVIDER_LABELS[form.kind] ? next.name : form.name,
                    });
                    setModels([]);
                    setFormError('');
                  }}
                  disabled={!!editing}
                >
                  <Icon size={21} />
                  {PROVIDER_LABELS[kind]}
                </button>
              );
            })}
          </div>
          {formError && <ErrorNotice>{formError}</ErrorNotice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
            className="form-stack"
          >
            <div className="form-grid">
              <label className="field">
                Connection name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                Protocol
                <select
                  value={form.protocol}
                  disabled={!['compatible', 'custom'].includes(form.kind)}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value as Protocol })}
                >
                  <option value="openai">OpenAI Chat Completions</option>
                  <option value="anthropic">Anthropic Messages</option>
                  <option value="gemini">Gemini generateContent</option>
                  <option value="ollama">Ollama native chat</option>
                </select>
              </label>
              <label className="field span-2">
                API base URL
                <input
                  type="url"
                  required
                  value={form.base_url}
                  placeholder="https://your-provider.example/v1"
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                />
                <small>
                  {form.protocol === 'ollama'
                    ? 'Use the server origin; /api/chat is added automatically.'
                    : 'OpenAI-compatible URLs usually include /v1. Use the final API origin; cross-origin redirects are rejected.'}
                </small>
              </label>
              <label className="field span-2">
                API key{' '}
                {['ollama', 'lmstudio'].includes(form.kind) && <span className="muted">(optional)</span>}
                <input
                  type="password"
                  autoComplete="off"
                  maxLength={1024}
                  required={!editing && !['ollama', 'lmstudio', 'compatible', 'custom'].includes(form.kind)}
                  placeholder={
                    editing ? 'Saved key retained — enter only to replace' : 'Enter your provider API key'
                  }
                  value={form.api_key}
                  onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                />
              </label>
              <label className="field span-2">
                Default model
                <div className="model-picker">
                  <input
                    aria-label="Default model"
                    aria-describedby="default-model-help"
                    required
                    maxLength={160}
                    placeholder={suggestions[form.kind]}
                    value={form.default_model}
                    onChange={(e) => setForm({ ...form, default_model: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void discover()}
                    disabled={!editing || busy}
                    title={!editing ? 'Save the connection first' : 'Fetch the provider’s actual model list'}
                  >
                    <Download size={15} /> Discover
                  </Button>
                </div>
                <small id="default-model-help">
                  Model discovery does not verify generation access. Save and test the exact model you want to
                  use.
                </small>
                {models.length > 0 && (
                  <div className="model-list">
                    {models.map((model) => (
                      <button
                        type="button"
                        key={model}
                        onClick={() =>
                          setForm({
                            ...form,
                            default_model: model,
                            selected_models: [...new Set([...form.selected_models, model])],
                          })
                        }
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </label>
            </div>
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm({ ...form, enabled })}
              label="Enable this connection"
              description="Disabled connections cannot execute mission tasks."
            />
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="secondary" disabled={busy}>
                Save only
              </Button>
              <Button type="button" loading={busy} onClick={() => void save(true)}>
                <Zap size={15} /> Save & verify
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Disconnect provider?">
        <div className="dialog-body">
          <p className="dialog-description">
            Remove <strong>{deleting?.name}</strong> and its encrypted credential? Agents using it will become
            unassigned. Historical mission transcripts remain intact, but queued work that needs this
            connection will fail.
          </p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep connection
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                try {
                  await api(`/api/providers/${deleting.id}`, { method: 'DELETE', body: {} });
                  setDeleting(null);
                  await refresh();
                  toast('Provider disconnected.');
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Could not disconnect.', 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} /> Disconnect
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
