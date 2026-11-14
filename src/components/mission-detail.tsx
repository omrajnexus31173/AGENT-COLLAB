'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Command,
  FileJson,
  FileText,
  Fingerprint,
  GitBranch,
  History,
  Layers3,
  MessageSquareMore,
  Network,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
} from 'lucide-react';
import type { MissionDetail as Detail } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { api, downloadMission, useMission } from '@/lib/client';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorNotice,
  PageHeading,
  Panel,
  Status,
  useToast,
  relativeTime,
} from './ui';
import { ActivityList, Markdown, MissionNetwork, ModeIcon } from './mission-ui';
export function MissionDetail({ initial }: { initial: Detail }) {
  const { detail, error: loadError, connection, reload } = useMission(initial.mission.id, initial);
  const d = detail || initial;
  const m = d.mission;
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState('network');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [instructOpen, setInstructOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [instructionAgent, setInstructionAgent] = useState('');
  const [continueOpen, setContinueOpen] = useState(false);
  const [continuation, setContinuation] = useState('');
  const [messageFilter, setMessageFilter] = useState('all');
  const active = ['queued', 'running'].includes(m.status);
  const finished = ['completed', 'failed', 'cancelled'].includes(m.status);
  const agentName = (id: string | null) =>
    m.agent_snapshot.find((a) => a.id === id)?.name || (id ? 'Former agent' : 'Orchestrator');
  async function command(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      await api(`/api/missions/${m.id}/command`, { method: 'POST', body: { action, ...extra } });
      await reload();
      toast(
        action === 'pause'
          ? 'Mission paused. In-flight calls were aborted.'
          : action === 'resume'
            ? 'Mission queued for recovery. Completed work is preserved.'
            : action === 'approve'
              ? 'Approved. The synthesis lead can now proceed.'
              : action === 'cancel'
                ? 'Mission cancelled.'
                : action === 'instruct'
                  ? 'Instruction persisted for your squad.'
                  : 'Assignment updated.',
      );
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The command failed.', 'error');
      await reload();
      return false;
    } finally {
      setBusy('');
    }
  }
  const tabs = [
    { id: 'network', label: 'Network', icon: Network },
    { id: 'tasks', label: 'Tasks', icon: GitBranch, count: d.tasks.length },
    { id: 'transcript', label: 'Transcript', icon: MessageSquareMore, count: d.messages.length },
    { id: 'output', label: 'Final output', icon: Layers3 },
    { id: 'events', label: 'Event log', icon: History },
  ];
  return (
    <>
      <PageHeading
        eyebrow={`MISSION / ${m.id.slice(0, 8).toUpperCase()}`}
        title={m.title}
        description="A persistent record of independent minds working toward one result."
        action={
          <span className={`connection-live ${connection}`}>
            <Radio size={13} />
            {connection === 'live'
              ? 'Event stream live'
              : connection === 'reconnecting'
                ? 'Reconnecting…'
                : connection === 'connecting'
                  ? 'Connecting…'
                  : 'Stream offline'}
          </span>
        }
      />
      <div className="mission-heading-meta" style={{ marginTop: -15, marginBottom: 23 }}>
        <Status status={m.status} />
        <span className="inline-label">
          <ModeIcon mode={m.mode} size={13} />
          {MODE_LABELS[m.mode]}
        </span>
        <span>{m.agent_snapshot.length} agents</span>
        <span>Created {relativeTime(m.created_at)}</span>
        {m.parent_mission_id && (
          <Link href={`/missions/${m.parent_mission_id}`} className="text-link" style={{ fontSize: 10 }}>
            Continued from previous mission <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
      {loadError && (
        <ErrorNotice>
          {loadError}{' '}
          <button className="text-link" onClick={() => void reload()}>
            Refresh persisted state
          </button>
        </ErrorNotice>
      )}
      {m.error && (
        <div style={{ marginBottom: 20 }}>
          <ErrorNotice>{m.error}</ErrorNotice>
        </div>
      )}
      {m.status === 'awaiting_approval' && (
        <div className="approval-banner">
          <Fingerprint size={23} />
          <div>
            <strong>Your squad is ready for your decision.</strong>
            <p>
              Inspect the findings, add guidance, or approve the final synthesis. Nothing proceeds until you
              approve.
            </p>
          </div>
          <Button
            className="button-small"
            onClick={() => void command('approve')}
            loading={busy === 'approve'}
          >
            <Check size={14} /> Approve synthesis
          </Button>
        </div>
      )}
      {m.status === 'completed' && (
        <div className="notice notice-success" style={{ marginBottom: 20 }}>
          <CheckCircle2 size={17} />
          <div>
            The final deliverable and execution evidence are persisted.{' '}
            <button
              className="text-link"
              style={{ background: 'transparent', padding: 0 }}
              onClick={() => setTab('output')}
            >
              Read the result <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
      <div className="mission-toolbar">
        <div className="mission-toolbar-actions">
          {active ? (
            <Button
              variant="secondary"
              className="button-small"
              onClick={() => void command('pause')}
              loading={busy === 'pause'}
            >
              <Pause size={13} /> Pause
            </Button>
          ) : ['paused', 'interrupted'].includes(m.status) ? (
            <Button
              variant="secondary"
              className="button-small"
              onClick={() => void command('resume')}
              loading={busy === 'resume'}
            >
              <Play size={13} /> Resume mission
            </Button>
          ) : null}
          {!finished && (
            <>
              <Button
                variant="secondary"
                className="button-small"
                onClick={() => {
                  setInstruction('');
                  setInstructionAgent('');
                  setInstructOpen(true);
                }}
              >
                <Send size={13} /> Add guidance
              </Button>
              <Button variant="ghost" className="button-small" onClick={() => setCancelOpen(true)}>
                <Square size={12} /> Cancel
              </Button>
            </>
          )}
          {m.status === 'completed' && (
            <Button
              variant="secondary"
              className="button-small"
              onClick={() => {
                setContinuation('');
                setContinueOpen(true);
              }}
            >
              <RotateCcw size={13} /> Continue mission
            </Button>
          )}
          <Button variant="ghost" className="button-small" onClick={() => downloadMission(m.id, 'md')}>
            <FileText size={13} /> Markdown
          </Button>
          <Button variant="ghost" className="button-small" onClick={() => downloadMission(m.id, 'json')}>
            <FileJson size={13} /> JSON
          </Button>
        </div>
        <div className="mission-stats">
          <div>
            Tasks completed
            <strong>
              {d.tasks.filter((t) => t.status === 'completed').length} / {d.tasks.length}
            </strong>
          </div>
          <div>
            Budget used
            <strong>
              {m.tokens_used.toLocaleString()} / {m.token_budget.toLocaleString()}
            </strong>
          </div>
          <div>
            Agent messages<strong>{d.messages.filter((x) => x.role === 'assistant').length}</strong>
          </div>
        </div>
      </div>
      <div className="mission-workspace-grid">
        <Panel>
          <div className="mission-tabs" role="tablist" aria-label="Mission views">
            {tabs.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'active' : ''}
                onClick={() => setTab(item.id)}
              >
                <item.icon size={14} />
                {item.label}
                {item.count !== undefined && <span className="count">{item.count}</span>}
                {item.id === 'output' && d.output && <span className="tiny-square" />}
              </button>
            ))}
          </div>
          <div className="mission-tab-content" role="tabpanel">
            {tab === 'network' && (
              <>
                <MissionNetwork detail={d} />
                <div className="help-box" style={{ marginTop: 20 }}>
                  <strong>Backend events, not decorative activity.</strong> Executing nodes and moving
                  dependency paths appear only while a persisted task is running.{' '}
                  {m.status === 'paused'
                    ? 'This mission is paused.'
                    : m.status === 'queued'
                      ? 'This mission is waiting for a worker.'
                      : finished
                        ? 'This mission has ended; its final network state is preserved.'
                        : ''}
                </div>
              </>
            )}
            {tab === 'tasks' && (
              <div className="task-list">
                {d.tasks.map((task, i) => (
                  <div className="task-item" key={task.id}>
                    <button
                      className="task-summary"
                      onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                      aria-expanded={expanded === task.id}
                    >
                      <span className="task-index">{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        <strong>{task.title}</strong>
                        <small>
                          {agentName(task.agent_id)} · Attempt {task.attempts}
                          {task.recipient_agent_id
                            ? ` · Finding addressed to ${agentName(task.recipient_agent_id)}`
                            : ''}
                        </small>
                      </div>
                      <Status status={task.status} />
                      <ChevronDown size={14} />
                    </button>
                    {expanded === task.id && (
                      <div className="task-detail">
                        <p>{task.instructions}</p>
                        <code>Task {task.id}</code>
                        {d.dependencies.filter((dep) => dep.task_id === task.id).length > 0 && (
                          <p style={{ marginTop: 9 }}>
                            Depends on:{' '}
                            {d.dependencies
                              .filter((dep) => dep.task_id === task.id)
                              .map(
                                (dep) =>
                                  d.tasks.find((t) => t.id === dep.depends_on)?.title || dep.depends_on,
                              )
                              .join(' → ')}
                          </p>
                        )}
                        {task.last_error && <ErrorNotice>{task.last_error}</ErrorNotice>}
                        {task.status === 'pending' && !finished && (
                          <label className="field" style={{ marginTop: 13 }}>
                            Reassign this pending task
                            <select
                              value={task.agent_id}
                              disabled={!!busy}
                              onChange={(e) =>
                                void command('reassign', { task_id: task.id, agent_id: e.target.value })
                              }
                            >
                              {m.agent_snapshot.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} · {a.role}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {task.output && (
                          <div className="task-output">
                            <Markdown>{task.output}</Markdown>
                          </div>
                        )}
                        {task.response_model && (
                          <p style={{ marginTop: 9 }}>
                            Model: {task.response_model}
                            {task.provider_request_id
                              ? ` · Request: ${task.provider_request_id}`
                              : ' · Provider request ID not supplied'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {tab === 'transcript' && (
              <>
                <div className="filter-tabs" style={{ marginBottom: 22 }}>
                  <button
                    className={messageFilter === 'all' ? 'active' : ''}
                    onClick={() => setMessageFilter('all')}
                  >
                    All messages
                  </button>
                  {m.agent_snapshot.map((a) => (
                    <button
                      key={a.id}
                      className={messageFilter === a.id ? 'active' : ''}
                      onClick={() => setMessageFilter(a.id)}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
                <div className="transcript">
                  {d.messages
                    .filter(
                      (msg) =>
                        messageFilter === 'all' ||
                        msg.from_agent_id === messageFilter ||
                        msg.to_agent_id === messageFilter,
                    )
                    .map((msg) => {
                      const agent = m.agent_snapshot.find((a) => a.id === msg.from_agent_id);
                      return (
                        <article className={`message ${msg.role}`} key={msg.id}>
                          {agent ? (
                            <img
                              className="message-avatar"
                              src={`/images/${agent.avatar}.webp`}
                              alt=""
                              width="30"
                              height="34"
                            />
                          ) : (
                            <span className="message-avatar icon">
                              {msg.role === 'user' ? <Fingerprint size={16} /> : <Command size={16} />}
                            </span>
                          )}
                          <div className="message-body">
                            <div className="message-header">
                              <strong>{agent?.name || (msg.role === 'user' ? 'You' : 'Orchestrator')}</strong>
                              <span>{msg.kind}</span>
                              <time dateTime={msg.created_at}>
                                {new Date(msg.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                            </div>
                            <div className="message-content">
                              <Markdown>{msg.content}</Markdown>
                            </div>
                            {msg.to_agent_id && (
                              <div className="message-recipient">
                                <ArrowRight size={11} />
                                Addressed to {agentName(msg.to_agent_id)}
                              </div>
                            )}
                            {msg.task_id && (
                              <div className="message-recipient">
                                <GitBranch size={10} />
                                Task {msg.task_id.slice(0, 8)}
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                </div>
              </>
            )}
            {tab === 'output' &&
              (d.output ? (
                <>
                  <div className="output-heading">
                    <ShieldCheck size={17} />
                    Persisted synthesis · {d.output.model}
                  </div>
                  <Markdown>{d.output.content}</Markdown>
                  <details className="evidence-list">
                    <summary>Inspect recorded evidence ({d.output.evidence.length} completed tasks)</summary>
                    {d.output.evidence.map((e) => (
                      <div className="evidence-row" key={e.task_id}>
                        <strong>{e.title}</strong>
                        <small>
                          {e.agent} · {e.model || 'Model not reported'}
                        </small>
                        <small>Task: {e.task_id}</small>
                        <small>
                          Message: {e.message_id || 'Not recorded'} · Provider request:{' '}
                          {e.provider_request_id || 'Not supplied'}
                        </small>
                      </div>
                    ))}
                  </details>
                </>
              ) : (
                <EmptyState
                  icon={<Layers3 size={27} />}
                  title={
                    m.status === 'failed'
                      ? 'No final output was produced.'
                      : m.status === 'cancelled'
                        ? 'This mission was cancelled.'
                        : 'The collective result is still taking shape.'
                  }
                  description={
                    m.status === 'failed'
                      ? 'Completed findings remain available in the transcript. The mission was not marked successful.'
                      : 'A final output appears only after the synthesis model responds and the orchestrator commits it to the database.'
                  }
                  action={
                    !finished ? (
                      <Button variant="secondary" onClick={() => setTab('transcript')}>
                        Inspect actual findings <ArrowRight size={14} />
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            {tab === 'events' && (
              <>
                <div className="notice notice-info" style={{ marginBottom: 17 }}>
                  <History size={16} />
                  Durable, ordered event IDs. Reconnects replay missed events; the interface deduplicates by
                  ID.
                </div>
                {d.events
                  .slice()
                  .reverse()
                  .map((event) => (
                    <div className="event-row" key={event.id}>
                      <Activity size={14} />
                      <div>
                        <strong>{event.type.replaceAll('_', ' ')}</strong>
                        <small>
                          #{event.id} ·{' '}
                          {String(
                            event.payload.title ||
                              event.payload.error ||
                              event.payload.reason ||
                              'Persisted mission event',
                          )}
                        </small>
                      </div>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </time>
                    </div>
                  ))}
                {!d.events.length && <p className="muted">No events recorded yet.</p>}
              </>
            )}
          </div>
        </Panel>
        <div className="stack">
          <Panel>
            <section className="mission-side-section">
              <h3>
                <Command size={14} />
                The mission brief
              </h3>
              <div className="mission-brief">{m.brief}</div>
            </section>
            <section className="mission-side-section">
              <h3>
                <Bot size={14} />
                Assigned minds
              </h3>
              {m.agent_snapshot.map((agent) => {
                const tasks = d.tasks.filter((t) => t.agent_id === agent.id);
                const state = tasks.some((t) => t.status === 'running')
                  ? 'running'
                  : tasks.some((t) => t.status === 'failed')
                    ? 'failed'
                    : tasks.length && tasks.every((t) => t.status === 'completed')
                      ? 'completed'
                      : 'pending';
                return (
                  <div className="squad-mini" key={agent.id}>
                    <img src={`/images/${agent.avatar}.webp`} alt="" width="30" height="34" />
                    <div>
                      <strong>
                        {agent.name}
                        {m.synthesis_agent_id === agent.id ? ' · Lead' : ''}
                      </strong>
                      <small>
                        {agent.role} · {agent.model}
                      </small>
                    </div>
                    <Status status={state} />
                  </div>
                );
              })}
            </section>
            <section className="mission-side-section">
              <h3>
                <Activity size={14} />
                Budget & execution
              </h3>
              <div className="budget-label">
                <span>Reserved + consumed</span>
                <strong>{Math.round(((m.tokens_used + m.tokens_reserved) / m.token_budget) * 100)}%</strong>
              </div>
              <div className="progress-track">
                <span
                  style={{
                    width: `${Math.min(100, ((m.tokens_used + m.tokens_reserved) / m.token_budget) * 100)}%`,
                  }}
                />
              </div>
              <div className="summary-row">
                <span>Consumed budget</span>
                <strong>{m.tokens_used.toLocaleString()}</strong>
              </div>
              <div className="summary-row">
                <span>Active reservations</span>
                <strong>{m.tokens_reserved.toLocaleString()}</strong>
              </div>
              <div className="summary-row">
                <span>Recorded calls / attempts</span>
                <strong>
                  {d.usage.length} / {m.iteration}
                </strong>
              </div>
              <div className="summary-row">
                <span>Estimated records</span>
                <strong>{d.usage.filter((u) => u.estimated).length}</strong>
              </div>
              <div className="help-box">
                Interrupted calls conservatively consume their reservation. Estimates are budget accounting,
                not provider billing claims. Review is analytical; no code was executed.
              </div>
            </section>
          </Panel>
          <Panel>
            <div className="panel-header">
              <h3>
                <Radio size={14} />
                Latest events
              </h3>
              <button
                className="icon-button"
                onClick={() => setTab('events')}
                aria-label="Inspect full event log"
              >
                <ArrowUpRight size={14} />
              </button>
            </div>
            <ActivityList events={d.events.slice(-5).reverse()} />
          </Panel>
        </div>
      </div>
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this mission?">
        <div className="dialog-body">
          <p className="dialog-description">
            In-flight provider calls will be aborted and pending tasks skipped. Completed findings stay in the
            archive. A cancelled mission cannot resume, but its evidence remains available.
          </p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep mission
            </Button>
            <Button
              variant="danger"
              loading={busy === 'cancel'}
              onClick={async () => {
                if (await command('cancel')) setCancelOpen(false);
              }}
            >
              <Square size={13} /> Cancel mission
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={instructOpen}
        onClose={() => {
          if (!busy) setInstructOpen(false);
        }}
        title="Guide your squad"
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Broadcast guidance to the next model calls, or choose an agent to add a bounded follow-up task.
            Already-started calls keep their recorded input snapshot.
          </p>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await command('instruct', {
                  instruction,
                  ...(instructionAgent ? { agent_id: instructionAgent } : {}),
                })
              )
                setInstructOpen(false);
            }}
          >
            <label className="field">
              Your instruction
              <textarea
                required
                minLength={3}
                maxLength={6000}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="What should the squad reconsider, prioritize, or add?"
              />
            </label>
            <label className="field">
              Follow-up assignment
              <select value={instructionAgent} onChange={(e) => setInstructionAgent(e.target.value)}>
                <option value="">Broadcast only — no new task</option>
                {m.agent_snapshot.map((a) => (
                  <option key={a.id} value={a.id}>
                    Add a task for {a.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setInstructOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === 'instruct'}>
                <Send size={14} /> Send guidance
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
      <Dialog
        open={continueOpen}
        onClose={() => {
          if (!busy) setContinueOpen(false);
        }}
        title="Continue into the next mission"
      >
        <div className="dialog-body">
          <p className="dialog-description">
            Create a linked human-guided mission with the previous final deliverable as context. The original
            record stays immutable. Your current agent assignments and verified providers are required.
          </p>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy('continue');
              try {
                const result = await api<{ mission: { id: string } }>(`/api/missions/${m.id}/continue`, {
                  method: 'POST',
                  body: { instruction: continuation },
                });
                setContinueOpen(false);
                router.push(`/missions/${result.mission.id}`);
              } catch (error) {
                toast(error instanceof Error ? error.message : 'Could not continue this mission.', 'error');
                setBusy('');
              }
            }}
          >
            <label className="field">
              What should the squad do next?
              <textarea
                required
                minLength={10}
                maxLength={16000}
                value={continuation}
                onChange={(e) => setContinuation(e.target.value)}
                placeholder="Refine the implementation, address the remaining risks, or explore the next question…"
              />
            </label>
            <div className="form-actions">
              <Button type="button" variant="ghost" disabled={!!busy} onClick={() => setContinueOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === 'continue'}>
                Create linked mission <ArrowRight size={14} />
              </Button>
            </div>
          </form>
        </div>
      </Dialog>
    </>
  );
}
