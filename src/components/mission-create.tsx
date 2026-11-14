'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Info, LockKeyhole, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import type { Agent, MissionMode, ProviderConnection } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { api } from '@/lib/client';
import { Button, ErrorNotice, PageHeading, Panel, useToast } from './ui';
import { ModeIcon } from './mission-ui';
const descriptions: Record<MissionMode, string> = {
  round_table: 'Independent analysis → shared findings → synthesis',
  debate: 'Positions → rebuttals → evidence-based verdict',
  autonomous: 'Model-generated plan → delegated task graph',
  expert_review: 'Produce → independent reviews → revise',
  guided: 'Collaborate with a human approval gate',
};
const templates = [
  {
    label: 'Software build',
    title: 'Design and review a production-ready API',
    brief:
      'Design a secure, production-oriented REST API for a small team task manager. Research the requirements, propose the architecture and data model, draft a TypeScript implementation, then review it for security, correctness, and test coverage. Clearly distinguish proposed code from code that has actually been executed or tested.',
  },
  {
    label: 'Decision analysis',
    title: 'Choose the right architecture for our next product',
    brief:
      'Help us choose between a modular monolith and microservices for a new B2B product with a team of five engineers. Analyze operational complexity, scalability, cost, security, and development speed. Challenge assumptions and deliver an evidence-based recommendation with explicit uncertainties.',
  },
  {
    label: 'Research sprint',
    title: 'Map the landscape of local AI collaboration',
    brief:
      'Analyze the trade-offs of running a multi-agent collaboration platform with local models versus cloud providers. Cover privacy, model quality, hardware requirements, latency, cost, and operational reliability. Do not claim to have browsed current sources; identify what needs external verification.',
  },
];
export function MissionCreate({
  agents,
  connections,
  defaultMode,
  defaultBudget,
}: {
  agents: Agent[];
  connections: ProviderConnection[];
  defaultMode: MissionMode;
  defaultBudget: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const ready = agents.filter(
    (a) =>
      a.enabled &&
      a.connection_id &&
      a.model &&
      connections.some((c) => c.id === a.connection_id && c.enabled && c.verification_status === 'verified'),
  );
  const initialSelected = (ready.length >= 2 ? ready : agents).slice(0, 3).map((a) => a.id);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [mode, setMode] = useState<MissionMode>(defaultMode);
  const [selected, setSelected] = useState(initialSelected);
  const [lead, setLead] = useState(
    initialSelected.includes(
      agents.find((a) => a.role === 'Judge' && initialSelected.includes(a.id))?.id || '',
    )
      ? agents.find((a) => a.role === 'Judge' && initialSelected.includes(a.id))!.id
      : initialSelected.at(-1) || '',
  );
  const [budget, setBudget] = useState(defaultBudget);
  const [maxSteps, setMaxSteps] = useState(24);
  const [retries, setRetries] = useState(2);
  const [timeout, setTimeout] = useState(90000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const squad = agents.filter((a) => selected.includes(a.id));
  const unready = squad.filter((a) => !ready.some((r) => r.id === a.id));
  const minimum =
    mode === 'autonomous' ? 3 : mode === 'expert_review' ? selected.length + 2 : selected.length * 2 + 1;
  const valid =
    selected.length >= 2 &&
    selected.length <= 6 &&
    title.trim().length >= 3 &&
    brief.trim().length >= 10 &&
    !unready.length &&
    selected.includes(lead) &&
    maxSteps >= minimum;
  function toggle(id: string) {
    if (selected.includes(id)) {
      const next = selected.filter((x) => x !== id);
      setSelected(next);
      if (lead === id) setLead(next.at(-1) || '');
    } else if (selected.length < 6) {
      setSelected([...selected, id]);
      if (!lead) setLead(id);
    }
  }
  async function launch() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ mission: { id: string } }>('/api/missions', {
        method: 'POST',
        body: {
          title,
          brief,
          mode,
          agent_ids: selected,
          synthesis_agent_id: lead,
          token_budget: budget,
          max_steps: maxSteps,
          max_retries: retries,
          timeout_ms: timeout,
        },
      });
      toast('Mission persisted. The orchestrator is taking over.');
      router.push(`/missions/${result.mission.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not launch the mission.');
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ASSEMBLE. ASSIGN. ACTIVATE."
        title="Launch a mission"
        description="Give your squad a goal. The orchestrator handles the handoffs."
      />
      {error && (
        <div style={{ marginBottom: 20 }}>
          <ErrorNotice>{error}</ErrorNotice>
        </div>
      )}
      <div className="mission-create-grid">
        <form
          id="launch-mission"
          onSubmit={(e) => {
            e.preventDefault();
            void launch();
          }}
        >
          <Panel>
            <section className="mission-form-section">
              <div className="form-section-title">
                <span>01</span>
                <div>
                  <h2>Define the objective</h2>
                  <p>Clarity here makes every handoff stronger.</p>
                </div>
              </div>
              <div className="form-stack">
                <label className="field">
                  Mission name
                  <input
                    required
                    minLength={3}
                    maxLength={140}
                    placeholder="Give this mission a clear name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  The brief
                  <textarea
                    required
                    minLength={10}
                    maxLength={20000}
                    rows={6}
                    placeholder="What should your squad accomplish? Include the goal, constraints, and what a useful final result looks like."
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                  <small>
                    {brief.length.toLocaleString()} / 20,000 characters · Sent only to the providers you
                    assign.
                  </small>
                </label>
                <div>
                  <span className="field" style={{ marginBottom: 8 }}>
                    Need a starting point?
                  </span>
                  <div className="model-list">
                    {templates.map((template) => (
                      <button
                        type="button"
                        key={template.label}
                        onClick={() => {
                          setTitle(template.title);
                          setBrief(template.brief);
                        }}
                      >
                        <Sparkles size={11} /> {template.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            <section className="mission-form-section">
              <div className="form-section-title">
                <span>02</span>
                <div>
                  <h2>Choose how minds collaborate</h2>
                  <p>Every mode runs through the real orchestration engine.</p>
                </div>
              </div>
              <div className="mode-select-grid">
                {(Object.keys(MODE_LABELS) as MissionMode[]).map((key) => (
                  <button
                    type="button"
                    key={key}
                    className={`mode-option ${mode === key ? 'selected' : ''}`}
                    onClick={() => setMode(key)}
                    aria-pressed={mode === key}
                  >
                    <ModeIcon mode={key} size={20} />
                    <span>
                      <strong>{MODE_LABELS[key]}</strong>
                      <small>{descriptions[key]}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="mission-form-section">
              <div className="form-section-title">
                <span>03</span>
                <div>
                  <h2>Assemble your squad</h2>
                  <p>Choose 2–6 specialists. Each needs a verified provider and model.</p>
                </div>
              </div>
              {!agents.length ? (
                <div className="notice notice-info">
                  <Info size={16} />
                  Create agents in your roster first.
                </div>
              ) : (
                <div className="squad-selection">
                  {agents.map((agent) => {
                    const provider = connections.find((c) => c.id === agent.connection_id);
                    return (
                      <button
                        type="button"
                        key={agent.id}
                        className={`squad-option ${selected.includes(agent.id) ? 'selected' : ''}`}
                        onClick={() => toggle(agent.id)}
                        disabled={!agent.enabled || (!selected.includes(agent.id) && selected.length >= 6)}
                        aria-pressed={selected.includes(agent.id)}
                      >
                        <img src={`/images/${agent.avatar}.webp`} alt="" width="33" height="38" />
                        <span>
                          <strong>{agent.name}</strong>
                          <small>
                            {agent.role} ·{' '}
                            {provider?.verification_status === 'verified' ? agent.model : 'Needs setup'}
                          </small>
                        </span>
                        <span className="selection-check">
                          {selected.includes(agent.id) && <Check size={11} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <label className="field" style={{ marginTop: 19 }}>
                Final synthesis lead
                <select required value={lead} onChange={(e) => setLead(e.target.value)}>
                  <option value="" disabled>
                    Choose a lead from your squad
                  </option>
                  {squad.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.role}
                    </option>
                  ))}
                </select>
                <small>
                  The lead receives completed dependency outputs and produces the final persisted deliverable.
                </small>
              </label>
            </section>
            <section className="mission-form-section">
              <div className="form-section-title">
                <span>04</span>
                <div>
                  <h2>Set the mission boundaries</h2>
                  <p>Real work stays bounded, observable, and interruptible.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  Token budget
                  <input
                    type="number"
                    required
                    min={1000}
                    max={100000}
                    step={1000}
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                  <small>Hard budget reserve. Missing provider usage is estimated and labeled.</small>
                </label>
                <label className="field">
                  Maximum tasks
                  <input
                    type="number"
                    required
                    min={minimum}
                    max={32}
                    value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                  />
                  <small>
                    This workflow starts with {minimum} tasks
                    {mode === 'autonomous' ? ' and can add up to 6 delegated tasks' : ''}.
                  </small>
                </label>
              </div>
              <details className="advanced-settings">
                <summary>Retry and timeout policy</summary>
                <div className="form-grid">
                  <label className="field">
                    Retries per task
                    <select value={retries} onChange={(e) => setRetries(Number(e.target.value))}>
                      {[0, 1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Request timeout
                    <select value={timeout} onChange={(e) => setTimeout(Number(e.target.value))}>
                      {[30000, 60000, 90000, 120000, 180000].map((n) => (
                        <option key={n} value={n}>
                          {n / 1000} seconds
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </section>
          </Panel>
        </form>
        <div className="stack">
          <Panel className="mission-summary">
            <h3>Mission readiness</h3>
            <div className="summary-row">
              <span>Collaboration</span>
              <strong>{MODE_LABELS[mode]}</strong>
            </div>
            <div className="summary-row">
              <span>Squad size</span>
              <strong>{selected.length} independent agents</strong>
            </div>
            <div className="summary-row">
              <span>Initial model calls</span>
              <strong>At least {minimum}</strong>
            </div>
            <div className="summary-row">
              <span>Budget reserve</span>
              <strong>{budget.toLocaleString()} tokens</strong>
            </div>
            <div className="summary-row">
              <span>Execution</span>
              <strong>Persistent · up to 3 parallel calls</strong>
            </div>
            <div className="summary-squad">
              {squad.map((agent) => (
                <img
                  key={agent.id}
                  src={`/images/${agent.avatar}.webp`}
                  alt={agent.name}
                  width="35"
                  height="39"
                />
              ))}
            </div>
            <p>
              Your mission is saved before execution starts. Pause, resume, cancel, and inspect every recorded
              handoff from mission control.
            </p>
            {unready.length > 0 && (
              <div className="notice notice-error">
                <Info size={15} />
                <div>
                  {unready.map((a) => a.name).join(', ')} need an enabled, verified connection and model.{' '}
                  <Link className="text-link" href="/connections">
                    Set up providers
                  </Link>{' '}
                  or{' '}
                  <Link className="text-link" href="/agents">
                    assign models
                  </Link>
                  .
                </div>
              </div>
            )}
            {selected.length < 2 && (
              <div className="notice notice-info">
                <Info size={15} />
                Select at least two agents to collaborate.
              </div>
            )}
            {maxSteps < minimum && (
              <div className="notice notice-error">
                <Info size={15} />
                Increase the task limit to at least {minimum}.
              </div>
            )}
            <Button
              type="submit"
              form="launch-mission"
              className="full-width"
              loading={busy}
              disabled={!valid}
            >
              <Rocket size={16} /> Launch mission <ArrowRight size={15} />
            </Button>
            <p style={{ fontSize: 9, marginTop: 12, textAlign: 'center' }}>
              Provider requests may incur charges on your accounts.
            </p>
          </Panel>
          <div className="help-box">
            <strong>
              <ShieldCheck size={14} /> No simulated collaboration.
            </strong>
            <br />
            Only actual provider responses become findings. QA and review are model-based analysis; this
            platform does not execute code or browse the web. Final evidence records model calls, not
            independent correctness verification.
          </div>
          {mode === 'guided' && (
            <div className="help-box">
              <strong>
                <LockKeyhole size={14} /> You control the final gate.
              </strong>
              <br />
              The squad pauses before synthesis. Review the findings, add instructions or a follow-up task,
              then approve the final deliverable.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
