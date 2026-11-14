'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, Bot, GitBranch, Network, Pause, Play, Radio, RefreshCw } from 'lucide-react';
import type { Mission } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { api, useMission, useResource } from '@/lib/client';
import { Button, EmptyState, ErrorNotice, Loading, PageHeading, Panel, Status, useToast } from './ui';
import { ActivityList, MissionNetwork } from './mission-ui';
export function NetworkPage({ initial }: { initial: Mission[] }) {
  const { data, error, refresh } = useResource<{ missions: Mission[] }>('/api/missions?limit=50', {
    missions: initial,
  });
  const missions = data?.missions || initial;
  const [selected, setSelected] = useState(
    missions.find((m) => ['running', 'queued', 'paused', 'awaiting_approval'].includes(m.status))?.id ||
      missions[0]?.id ||
      '',
  );
  return (
    <>
      <PageHeading
        eyebrow="INTELLIGENCE IN MOTION"
        title="The live network"
        description="Every node, handoff, and transition comes from a persisted backend event."
        action={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCw size={14} /> Refresh missions
          </Button>
        }
      />
      {error && <ErrorNotice>{error}</ErrorNotice>}
      {missions.length ? (
        <>
          <div className="filter-bar">
            <label className="field" style={{ minWidth: 280, maxWidth: 500 }}>
              Select a mission
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.status.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <span className="notice notice-info" style={{ fontSize: 10 }}>
              <Radio size={14} />
              No simulated online indicators
            </span>
          </div>
          <LiveNetwork key={selected} id={selected} />
        </>
      ) : (
        <Panel>
          <EmptyState
            icon={<Network size={30} />}
            title="A network needs a mission."
            description="Launch a collaboration to see your agents, real task dependencies, and live execution states. No activity is invented while you wait."
            action={
              <Button href="/missions/new">
                Create the first mission <ArrowUpRight size={15} />
              </Button>
            }
          />
        </Panel>
      )}
    </>
  );
}
function LiveNetwork({ id }: { id: string }) {
  const { detail, error, connection, reload } = useMission(id);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!detail)
    return error ? (
      <ErrorNotice>{error}</ErrorNotice>
    ) : (
      <Loading label="Reading the persisted mission graph…" />
    );
  const m = detail.mission;
  const agent = m.agent_snapshot.find((a) => a.id === agentId);
  const tasks = detail.tasks.filter((t) => !agentId || t.agent_id === agentId);
  async function control(action: string) {
    setBusy(true);
    try {
      await api(`/api/missions/${id}/command`, { method: 'POST', body: { action } });
      await reload();
      toast(action === 'pause' ? 'Mission paused.' : 'Mission queued to resume.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Command failed.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <Panel>
        <div className="panel-header">
          <h2>
            <Network size={17} />
            {m.title}
          </h2>
          <div className="inline-label">
            <Status status={m.status} />
            <span className={`connection-live ${connection}`}>
              <Radio size={12} />
              {connection}
            </span>
            <Link href={`/missions/${id}`} className="icon-button" aria-label="Open mission workspace">
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="panel-body">
          <MissionNetwork detail={detail} large onSelectAgent={setAgentId} />
        </div>
      </Panel>
      <div className="network-info-grid">
        <Panel>
          <h3>
            <Bot size={15} /> {agent ? `${agent.name}’s assignments` : 'Inspect an agent'}
          </h3>
          {agent ? (
            <>
              <p style={{ marginBottom: 14 }}>
                {agent.role} · {agent.model}
              </p>
              {tasks.map((t) => (
                <div className="summary-row" key={t.id}>
                  <span>{t.title}</span>
                  <Status status={t.status} />
                </div>
              ))}
              <button
                className="text-link"
                style={{ background: 'transparent', padding: 0, marginTop: 15 }}
                onClick={() => setAgentId(null)}
              >
                Show all assignments
              </button>
            </>
          ) : (
            <p>
              Select a node in the network to inspect its actual assignments. Node states are derived from
              persisted task records.
            </p>
          )}
        </Panel>
        <Panel>
          <h3>
            <GitBranch size={15} /> Mission progression
          </h3>
          <div className="summary-row">
            <span>Mode</span>
            <strong>{MODE_LABELS[m.mode]}</strong>
          </div>
          <div className="summary-row">
            <span>Completed tasks</span>
            <strong>
              {detail.tasks.filter((t) => t.status === 'completed').length} / {detail.tasks.length}
            </strong>
          </div>
          <div className="summary-row">
            <span>Recorded dependencies</span>
            <strong>{detail.dependencies.length}</strong>
          </div>
          <div className="summary-row">
            <span>Budget consumed</span>
            <strong>{m.tokens_used.toLocaleString()} tokens</strong>
          </div>
          {['running', 'queued'].includes(m.status) && (
            <Button
              variant="secondary"
              className="button-small"
              style={{ marginTop: 17 }}
              loading={busy}
              onClick={() => void control('pause')}
            >
              <Pause size={13} /> Pause mission
            </Button>
          )}
          {['paused', 'interrupted'].includes(m.status) && (
            <Button
              variant="secondary"
              className="button-small"
              style={{ marginTop: 17 }}
              loading={busy}
              onClick={() => void control('resume')}
            >
              <Play size={13} /> Resume mission
            </Button>
          )}
        </Panel>
        <Panel>
          <h3>
            <Activity size={15} /> Actual event stream
          </h3>
          <ActivityList events={detail.events.slice(-3).reverse()} showTime={false} />
        </Panel>
      </div>
    </>
  );
}
