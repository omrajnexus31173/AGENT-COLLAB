'use client';
import { useState } from 'react';
import { Archive, Command, Plus, Search } from 'lucide-react';
import type { Mission } from '@/lib/types';
import { useResource } from '@/lib/client';
import { Button, EmptyState, ErrorNotice, Loading, PageHeading, Panel } from './ui';
import { MissionTable } from './mission-ui';
export function MissionArchive({
  initial,
  archive = false,
  initialQuery = '',
}: {
  initial: Mission[];
  archive?: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, loading, error, refresh } = useResource<{ missions: Mission[] }>(
    `/api/missions?q=${encodeURIComponent(search)}&status=${status}&limit=50&offset=${offset}`,
    { missions: initial },
  );
  const missions = data?.missions || [];
  return (
    <>
      <PageHeading
        eyebrow={archive ? 'EVERY MISSION LEAVES A TRAIL' : 'YOUR COLLABORATION COMMAND CENTER'}
        title={archive ? 'Mission archive' : 'Mission control'}
        description={
          archive
            ? 'Search, reopen, and export the work your squad has already done.'
            : 'Follow every assignment from the first brief to the final deliverable.'
        }
        action={
          <Button href="/missions/new">
            <Plus size={16} /> New mission
          </Button>
        }
      />
      <div className="filter-bar">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setOffset(0);
          }}
        >
          <Search size={15} />
          <input
            aria-label="Search mission titles and briefs"
            placeholder="Search mission titles and briefs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="icon-button" aria-label="Search missions">
            <Search size={13} />
          </button>
        </form>
        <div className="filter-tabs">
          {[
            ['', 'All missions'],
            ['running', 'Running'],
            ['completed', 'Completed'],
            ['paused', 'Paused'],
            ['failed', 'Failed'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={status === key ? 'active' : ''}
              onClick={() => {
                setStatus(key);
                setOffset(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <ErrorNotice>
          {error}{' '}
          <button className="text-link" onClick={() => void refresh()}>
            Retry
          </button>
        </ErrorNotice>
      )}
      <Panel>
        {loading && !data ? (
          <Loading />
        ) : missions.length ? (
          <>
            <MissionTable missions={missions} />
            <div className="table-footer">
              <span>
                {offset + 1}–{offset + missions.length} · newest first
              </span>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  className="text-link"
                  style={{ background: 'transparent', fontSize: 10 }}
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </button>
                <button
                  className="text-link"
                  style={{ background: 'transparent', fontSize: 10 }}
                  disabled={missions.length < 50 || loading}
                  onClick={() => setOffset(offset + 50)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={archive ? <Archive size={28} /> : <Command size={28} />}
            title={
              search || status
                ? 'No missions match this view.'
                : 'Your next breakthrough starts with a mission.'
            }
            description={
              search || status
                ? 'Try a different search or status filter.'
                : 'Assemble a squad, define a goal, and let real collaboration begin. Completed and interrupted missions are preserved here.'
            }
            action={
              <Button href="/missions/new" variant="secondary">
                Launch a mission <Plus size={14} />
              </Button>
            }
          />
        )}
      </Panel>
    </>
  );
}
