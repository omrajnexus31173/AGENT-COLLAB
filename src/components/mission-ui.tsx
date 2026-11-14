'use client';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  GitBranch,
  MessageSquareMore,
  Network,
  ShieldCheck,
  Swords,
  UsersRound,
  Workflow,
  XCircle,
} from 'lucide-react';
import type { Mission, MissionDetail, MissionMode } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { Logo, relativeTime, Status } from './ui';
export const MODE_ICONS = {
  round_table: UsersRound,
  debate: Swords,
  autonomous: Workflow,
  expert_review: ShieldCheck,
  guided: Fingerprint,
};
export function ModeIcon({ mode, size = 17 }: { mode: MissionMode; size?: number }) {
  const Icon = MODE_ICONS[mode];
  return <Icon size={size} />;
}
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>[Image: {alt || 'external image not loaded'}]</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
export function MissionTable({ missions }: { missions: Mission[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="mission-table">
        <thead>
          <tr>
            <th>MISSION</th>
            <th>STATUS</th>
            <th className="hide-mobile">PROGRESS</th>
            <th className="hide-mobile">CREATED</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {missions.map((mission) => (
            <tr key={mission.id}>
              <td>
                <Link href={`/missions/${mission.id}`} className="mission-title-cell">
                  <span className="mission-mode-icon">
                    <ModeIcon mode={mission.mode} />
                  </span>
                  <span>
                    <strong>{mission.title}</strong>
                    <small>
                      {MODE_LABELS[mission.mode]} · {mission.agent_snapshot.length} agents
                    </small>
                  </span>
                </Link>
              </td>
              <td>
                <Status status={mission.status} />
              </td>
              <td className="hide-mobile">
                <div className="table-progress">
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${mission.task_count ? Math.round(((mission.completed_count || 0) / mission.task_count) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <small>
                    {mission.completed_count || 0}/{mission.task_count || 0}
                  </small>
                </div>
              </td>
              <td className="hide-mobile">{relativeTime(mission.created_at)}</td>
              <td>
                <Link
                  href={`/missions/${mission.id}`}
                  className="icon-button"
                  aria-label={`Open ${mission.title}`}
                >
                  <ChevronRight size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const eventLabels: Record<string, string> = {
  mission_queued: 'Mission queued',
  mission_running: 'Mission started',
  task_started: 'Agent started a task',
  task_completed: 'Agent completed a task',
  message_created: 'Finding added to the transcript',
  task_retry: 'Provider call scheduled for retry',
  task_failed: 'Task failed',
  mission_failed: 'Mission failed',
  mission_completed: 'Final output persisted',
  mission_paused: 'Mission paused',
  mission_cancelled: 'Mission cancelled',
  mission_interrupted: 'Worker lease expired',
  mission_awaiting_approval: 'Waiting for your approval',
  human_instruction: 'Human instruction received',
  task_reassigned: 'Assignment updated',
  plan_created: 'Model delegated new tasks',
  budget_settled: 'Interrupted budget settled',
  call_aborted: 'Provider call aborted',
};
export function ActivityList({
  events,
  showTime = true,
}: {
  events: MissionDetail['events'];
  showTime?: boolean;
}) {
  return (
    <div className="activity-list">
      {events.length ? (
        events.map((event) => (
          <div className="activity-item" key={event.id}>
            <span className="activity-dot">
              {event.type.includes('failed') ? (
                <XCircle size={13} />
              ) : event.type.includes('completed') ? (
                <CheckCircle2 size={13} />
              ) : event.type.includes('message') ? (
                <MessageSquareMore size={13} />
              ) : (
                <Activity size={13} />
              )}
            </span>
            <div>
              <strong>{eventLabels[event.type] || event.type.replaceAll('_', ' ')}</strong>
              <p>{String(event.payload.title || event.payload.error || 'Recorded by the orchestrator')}</p>
            </div>
            {showTime && <time dateTime={event.created_at}>{relativeTime(event.created_at)}</time>}
          </div>
        ))
      ) : (
        <p className="muted" style={{ fontSize: 11, padding: '22px 0' }}>
          No events yet. Activity appears here when your agents work.
        </p>
      )}
    </div>
  );
}
export function MissionNetwork({
  detail,
  large = false,
  onSelectAgent,
}: {
  detail: MissionDetail;
  large?: boolean;
  onSelectAgent?: (id: string) => void;
}) {
  const { mission, tasks, dependencies } = detail;
  const agents = mission.agent_snapshot;
  const positions = new Map(
    agents.map((agent, i) => {
      const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      return [agent.id, { x: 50 + Math.cos(angle) * 36, y: 50 + Math.sin(angle) * 35 }];
    }),
  );
  const taskPositions = new Map(
    tasks.map((task) => [task.id, positions.get(task.agent_id) || { x: 50, y: 50 }]),
  );
  if (!agents.length)
    return (
      <div className="network-frame">
        <div className="network-empty">
          <Network size={30} />
          No agents assigned.
        </div>
      </div>
    );
  return (
    <div>
      <div className={`network-frame ${large ? 'network-page-frame' : ''}`}>
        <svg viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
          {agents.map((agent) => {
            const p = positions.get(agent.id)!;
            return (
              <path
                key={agent.id}
                d={`M500 250 L${p.x * 10} ${p.y * 5}`}
                className="network-edge"
                opacity={0.35}
              />
            );
          })}
          {dependencies.map((dep) => {
            const from = taskPositions.get(dep.depends_on),
              to = taskPositions.get(dep.task_id);
            const task = tasks.find((t) => t.id === dep.task_id);
            if (!from || !to) return null;
            const active = task?.status === 'running';
            const completed = task?.status === 'completed';
            const failed = task?.status === 'failed';
            return (
              <path
                key={`${dep.task_id}-${dep.depends_on}`}
                d={`M${from.x * 10} ${from.y * 5} Q500 250 ${to.x * 10} ${to.y * 5}`}
                className={`network-edge ${active ? 'active' : completed ? 'completed' : failed ? 'failed' : ''}`}
              />
            );
          })}
        </svg>
        <div className="network-core">
          <Logo compact />
          <small>NEXUS</small>
        </div>
        {agents.map((agent) => {
          const p = positions.get(agent.id)!;
          const assigned = tasks.filter((t) => t.agent_id === agent.id);
          const state = assigned.some((t) => t.status === 'running')
            ? 'running'
            : assigned.some((t) => t.status === 'failed')
              ? 'failed'
              : assigned.length && assigned.every((t) => t.status === 'completed')
                ? 'completed'
                : 'pending';
          const current =
            assigned.find((t) => t.status === 'running') ||
            assigned.find((t) => t.status === 'pending') ||
            assigned.at(-1);
          const Tag = onSelectAgent ? 'button' : 'div';
          return (
            <Tag
              key={agent.id}
              className={`network-node ${state}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={`${agent.name}: ${current?.title || 'Awaiting assignment'} (${state})`}
              {...(onSelectAgent
                ? {
                    onClick: () => onSelectAgent(agent.id),
                    'aria-label': `${agent.name}, ${state}. Inspect assignments.`,
                  }
                : {})}
            >
              <span className="node-state" />
              <img src={`/images/${agent.avatar}.webp`} alt="" width="45" height="49" />
              <strong>{agent.name}</strong>
              <small>{current?.title || 'Awaiting assignment'}</small>
            </Tag>
          );
        })}
      </div>
      <div className="network-legend">
        <span>
          <i style={{ background: '#a78bfa' }} />
          Executing
        </span>
        <span>
          <i style={{ background: '#34d399' }} />
          Completed
        </span>
        <span>
          <i style={{ background: '#fb7185' }} />
          Failed
        </span>
        <span>
          <i style={{ background: '#655774' }} />
          Pending
        </span>
        <span>
          <GitBranch size={11} />
          Lines represent persisted dependencies
        </span>
      </div>
    </div>
  );
}
export function MissionSummaryLink({ mission }: { mission: Mission }) {
  return (
    <Link href={`/missions/${mission.id}`} className="text-link">
      Open mission <ArrowRight size={14} />
    </Link>
  );
}
