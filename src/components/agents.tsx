'use client';
import { useState } from 'react';
import { Bot, Check, Cpu, Download, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Agent, AgentRole, ProviderConnection } from '@/lib/types';
import { ROLES } from '@/lib/types';
import { api, useResource } from '@/lib/client';
import { Button, Dialog, EmptyState, ErrorNotice, PageHeading, Status, Toggle, useToast } from './ui';
const colors = ['#a78bfa', '#60a5fa', '#22d3ee', '#c4b5fd', '#34d399', '#fbbf24'];
const avatars = ['atlas', 'aegis', 'forge', 'spectre'];
const empty: Omit<Agent, 'id' | 'created_at'> = {
  name: '',
  role: 'Researcher',
  color: '#a78bfa',
  avatar: 'atlas',
  system_prompt: '',
  connection_id: null,
  model: '',
  temperature: 0.4,
  max_output_tokens: 2048,
  enabled: true,
  configuration: {},
};
export function Agents({
  initial,
  connections: initialConnections,
}: {
  initial: Agent[];
  connections: ProviderConnection[];
}) {
  const { data, error, refresh } = useResource<{ agents: Agent[] }>('/api/agents', { agents: initial });
  const agents = data?.agents || initial;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const connection = initialConnections.find((c) => c.id === form.connection_id);
  const visible = agents.filter(
    (a) =>
      (filter === 'all' || (filter === 'configured' ? !!a.connection_id : !a.connection_id)) &&
      `${a.name} ${a.role}`.toLowerCase().includes(search.toLowerCase()),
  );
  function edit(agent?: Agent) {
    setEditing(agent?.id || null);
    setForm(agent ? { ...agent, model: agent.model || '' } : { ...empty });
    setFormError('');
    setModels([]);
    setOpen(true);
  }
  async function save() {
    setBusy(true);
    setFormError('');
    try {
      // The read model includes database metadata; the write contract is strict.
      const { id: _id, created_at: _created_at, ...input } = form as Agent;
      await api(editing ? `/api/agents/${editing}` : '/api/agents', {
        method: editing ? 'PUT' : 'POST',
        body: { ...input, model: input.model || null },
      });
      await refresh();
      setOpen(false);
      toast(editing ? 'Agent configuration updated.' : 'A new mind joined your roster.');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save this agent.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="INDEPENDENT MINDS. DISTINCT STRENGTHS."
        title="Your agent roster"
        description="Give every intelligence an identity, a specialty, and a model of its own."
        action={
          <Button onClick={() => edit()}>
            <Plus size={16} /> Create agent
          </Button>
        }
      />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="filter-bar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search agents"
            placeholder="Find an agent or specialty…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-tabs">
          {[
            ['all', 'All agents'],
            ['configured', 'Assigned'],
            ['unassigned', 'Unassigned'],
          ].map(([key, label]) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="agent-grid">
        {visible.map((agent) => {
          const provider = initialConnections.find((c) => c.id === agent.connection_id);
          const ready =
            provider?.enabled && provider.verification_status === 'verified' && agent.model && agent.enabled;
          return (
            <article className="agent-card" key={agent.id}>
              <div className="agent-card-art">
                <img
                  src={`/images/${agent.avatar}.webp`}
                  alt={`${agent.name} character identity`}
                  width="160"
                  height="200"
                />
                <div className="eyebrow" style={{ color: agent.color }}>
                  {agent.role}
                </div>
                <span className="agent-id">NX / {agent.id.slice(0, 6).toUpperCase()}</span>
              </div>
              <div className="agent-card-content">
                <h3>
                  {agent.name}
                  <button
                    className="icon-button"
                    onClick={() => edit(agent)}
                    aria-label={`Configure ${agent.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                </h3>
                <p>{agent.system_prompt || 'A custom specialist ready for your next mission.'}</p>
                <div className="agent-assignment">
                  <Cpu size={14} />
                  <span>
                    {provider ? `${provider.name} / ${agent.model || 'No model'}` : 'No provider assigned'}
                  </span>
                </div>
                <div className="agent-card-footer">
                  <Status status={ready ? 'verified' : 'neutral'}>
                    {!agent.enabled ? 'Disabled' : ready ? 'Ready to deploy' : 'Needs setup'}
                  </Status>
                  <button
                    className="text-link"
                    style={{ background: 'transparent', padding: 0 }}
                    onClick={() => edit(agent)}
                  >
                    Configure <SlidersHorizontal size={12} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!visible.length && (
        <EmptyState
          icon={<Bot size={28} />}
          title="No agents in this view."
          description="Try another filter or create a custom specialist for your squad."
          action={
            <Button onClick={() => edit()} variant="secondary">
              Create an agent
            </Button>
          }
        />
      )}
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={editing ? 'Configure your specialist' : 'Create a new mind'}
        wide
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Agent identities are yours to shape. Model outputs come from the provider you assign—not a
            simulated character.
          </p>
          {formError && <ErrorNotice>{formError}</ErrorNotice>}
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="form-grid">
              <label className="field">
                Agent name
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  value={form.name}
                  placeholder="e.g. Nova"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="field">
                Specialist role
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as AgentRole })}
                >
                  {ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <div className="field span-2">
                Character identity
                <div className="avatar-picker">
                  {avatars.map((avatar) => (
                    <button
                      type="button"
                      key={avatar}
                      className={form.avatar === avatar ? 'selected' : ''}
                      onClick={() => setForm({ ...form, avatar })}
                      aria-label={`Choose ${avatar} identity`}
                      aria-pressed={form.avatar === avatar}
                    >
                      <img src={`/images/${avatar}.webp`} alt={avatar} width="60" height="65" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="field span-2">
                Signal color
                <div className="color-picker">
                  {colors.map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      className={form.color === color ? 'selected' : ''}
                      onClick={() => setForm({ ...form, color })}
                      aria-label={`Choose ${color}`}
                      aria-pressed={form.color === color}
                    />
                  ))}
                </div>
              </div>
              <label className="field span-2">
                Role instructions
                <textarea
                  maxLength={6000}
                  value={form.system_prompt}
                  placeholder="Describe how this agent should think, what it should prioritize, and what good work looks like."
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                />
                <small>These instructions are sent to the model. Never include API keys or secrets.</small>
              </label>
              <label className="field">
                Provider connection
                <select
                  value={form.connection_id || ''}
                  onChange={(e) => {
                    const c = initialConnections.find((p) => p.id === e.target.value);
                    setForm({
                      ...form,
                      connection_id: e.target.value || null,
                      model: c?.default_model || '',
                    });
                    setModels(c?.selected_models || []);
                  }}
                >
                  <option value="">Unassigned — configure later</option>
                  {initialConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.verification_status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Model identifier
                <input
                  list="agent-models"
                  maxLength={160}
                  required={!!form.connection_id}
                  value={form.model || ''}
                  placeholder="Select or enter a model ID"
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
                <datalist id="agent-models">
                  {[...new Set([...(connection ? [connection.default_model] : []), ...models])]
                    .filter(Boolean)
                    .map((model) => (
                      <option key={model} value={model} />
                    ))}
                </datalist>
              </label>
              {connection && (
                <div className="span-2 notice notice-info">
                  <span>
                    <strong>
                      {connection.verification_status === 'verified'
                        ? 'Verified provider'
                        : 'Unverified provider'}
                      .
                    </strong>{' '}
                    {connection.verification_status === 'verified'
                      ? `Generation tested with ${connection.verified_model}. Your selected model still needs access.`
                      : 'Verify this connection in the Connection Center before launching a mission.'}{' '}
                    <button
                      type="button"
                      className="text-link"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const result = await api<{ models: string[] }>(
                            `/api/providers/${connection.id}/models`,
                          );
                          setModels(result.models);
                          toast(`Discovered ${result.models.length} model identifiers.`);
                        } catch (e) {
                          setFormError(e instanceof Error ? e.message : 'Model discovery failed.');
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Discover models <Download size={12} />
                    </button>
                  </span>
                </div>
              )}
              <label className="field">
                Temperature
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  required
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                />
                <small>Lower is more focused; higher is more exploratory.</small>
              </label>
              <label className="field">
                Output-token limit
                <select
                  value={form.max_output_tokens}
                  onChange={(e) => setForm({ ...form, max_output_tokens: Number(e.target.value) })}
                >
                  {[256, 512, 1024, 1536, 2048, 3072, 4096, 6144, 8192].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()} tokens
                    </option>
                  ))}
                </select>
              </label>
              <label className="field span-2">
                Specialty label (optional)
                <input
                  maxLength={200}
                  value={String(form.configuration.specialty || '')}
                  placeholder="e.g. Distributed systems and API design"
                  onChange={(e) =>
                    setForm({ ...form, configuration: { ...form.configuration, specialty: e.target.value } })
                  }
                />
              </label>
            </div>
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm({ ...form, enabled })}
              label="Available for new missions"
              description="Existing missions keep their original agent snapshot."
            />
            <div className="form-actions">
              {editing && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setOpen(false);
                    setDeleting(agents.find((a) => a.id === editing) || null);
                  }}
                >
                  <Trash2 size={14} /> Delete
                </Button>
              )}
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                <Check size={15} />
                {editing ? 'Save agent' : 'Create agent'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} title="Remove this agent?">
        <div className="dialog-body">
          <p className="dialog-description">
            Remove {deleting?.name} from your roster? Historical missions retain their agent snapshot and
            transcript. This cannot be undone.
          </p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep agent
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!deleting) return;
                setBusy(true);
                try {
                  await api(`/api/agents/${deleting.id}`, { method: 'DELETE', body: {} });
                  setDeleting(null);
                  await refresh();
                  toast('Agent removed from your roster.');
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Could not remove agent.', 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove agent
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
