'use client';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bot,
  ChevronRight,
  Command,
  GitBranch,
  Plug,
  Plus,
  Radio,
  Target,
  Zap,
} from 'lucide-react';
import type { DashboardData, MissionMode } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { useResource } from '@/lib/client';
import { Button, EmptyState, ErrorNotice, PageHeading, Panel, Status } from './ui';
import { ActivityList, MissionTable, ModeIcon } from './mission-ui';
export function Dashboard({ initial }: { initial: DashboardData }) {
  const { data, error, refresh } = useResource<{
    missions: DashboardData['missions'];
    agents: DashboardData['agents'];
    connections: DashboardData['connections'];
    stats: DashboardData['stats'];
    activity: DashboardData['activity'];
  }>('/api/dashboard', initial);
  const d = data || initial;
  return (
    <>
      <PageHeading
        eyebrow="YOUR PERSONAL UNIVERSE"
        title="Welcome to the nexus."
        description="Your agents, your missions, your next breakthrough. Everything starts here."
        action={
          <Button href="/missions/new">
            <Plus size={16} /> New mission
          </Button>
        }
      />
      {error && (
        <ErrorNotice>
          {error}{' '}
          <button className="text-link" onClick={() => void refresh()}>
            Retry
          </button>
        </ErrorNotice>
      )}
      {!d.stats.verified && (
        <div className="setup-banner">
          <Plug size={20} />
          <div>
            <strong>Your squad is ready for its first connection.</strong>
            <p>Add a provider, verify it with a real request, and assign models to your agents.</p>
          </div>
          <Link href="/connections" className="text-link">
            Set up connections <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <div className="stat-grid">
        {[
          {
            label: 'Missions launched',
            value: d.stats.missions,
            icon: Command,
            note: `${d.stats.completed} completed with persisted outputs`,
          },
          {
            label: 'Active missions',
            value: d.stats.active,
            icon: Activity,
            note: 'Queued, running, paused, or interrupted',
          },
          {
            label: 'Agents in your roster',
            value: d.stats.agents,
            icon: Bot,
            note: `${d.stats.verified} verified provider connection${d.stats.verified === 1 ? '' : 's'}`,
          },
          {
            label: 'Mission budget used',
            value: d.stats.tokens.toLocaleString(),
            icon: Zap,
            note: 'Reported tokens + labeled estimates',
          },
        ].map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <stat.icon size={17} />
            </div>
            <div className="stat-value">{stat.value}</div>
            <small>{stat.note}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="stack">
          <Panel className="mission-launch">
            <img className="launch-art" src="/images/nexus-fallback.webp" alt="" width="250" height="250" />
            <div>
              <div className="eyebrow">GREAT MINDS. ONE MISSION.</div>
              <h2>
                What will you build
                <br />
                with your squad?
              </h2>
              <p>Turn a question into a collaboration. Assemble your minds and give them a goal.</p>
              <Button href="/missions/new">
                Launch a mission <ArrowUpRight size={15} />
              </Button>
            </div>
          </Panel>
          <Panel>
            <div className="panel-header">
              <h2>
                <Command size={16} />
                Recent missions
              </h2>
              <Link href="/missions" className="text-link">
                View all <ArrowRight size={13} />
              </Link>
            </div>
            {d.missions.length ? (
              <MissionTable missions={d.missions} />
            ) : (
              <EmptyState
                icon={<Target size={27} />}
                title="Your first mission awaits."
                description="Connect your providers and give your squad a problem worth solving. Every real handoff will be recorded here."
                action={
                  <Button href="/connections" variant="secondary" className="button-small">
                    Prepare your squad <ArrowRight size={14} />
                  </Button>
                }
              />
            )}
          </Panel>
          <Panel>
            <div className="panel-header">
              <h2>
                <GitBranch size={16} />
                Choose your collaboration mode
              </h2>
            </div>
            <div className="mode-grid">
              {(Object.keys(MODE_LABELS) as MissionMode[]).map((mode) => (
                <Link href={`/missions/new?mode=${mode}`} className="mode-tile" key={mode}>
                  <ModeIcon mode={mode} />
                  <span>{MODE_LABELS[mode]}</span>
                  <ChevronRight size={14} />
                </Link>
              ))}
            </div>
          </Panel>
        </div>
        <div className="stack">
          <Panel>
            <div className="panel-header">
              <h2>
                <Radio size={16} />
                Mission activity
              </h2>
              <Link href="/archive" className="icon-button" aria-label="View mission archive">
                <ArrowUpRight size={15} />
              </Link>
            </div>
            <ActivityList events={d.activity} />
          </Panel>
          <Panel>
            <div className="panel-header">
              <h2>
                <Bot size={16} />
                Your starting squad
              </h2>
              <Link href="/agents" className="text-link">
                Manage <ArrowRight size={13} />
              </Link>
            </div>
            {d.agents.slice(0, 5).map((agent) => (
              <Link href="/agents" className="squad-mini" key={agent.id}>
                <img src={`/images/${agent.avatar}.webp`} alt="" width="35" height="39" />
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </div>
                <Status status={agent.connection_id ? 'neutral' : 'neutral'}>
                  {agent.connection_id ? 'Assigned' : 'Unassigned'}
                </Status>
              </Link>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
