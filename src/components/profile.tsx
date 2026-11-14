'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Settings2, ShieldCheck } from 'lucide-react';
import type { User } from '@/lib/types';
import { api } from '@/lib/client';
import { useAuth } from './auth-provider';
import { Button, ErrorNotice, PageHeading, Panel, Status, useToast } from './ui';
export function Profile({ initial }: { initial: User }) {
  const { user, refresh } = useAuth();
  const current = user || initial;
  const [name, setName] = useState(current.name);
  const [color, setColor] = useState(current.avatar_color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  return (
    <>
      <PageHeading
        eyebrow="THE HUMAN BEHIND THE MISSIONS"
        title="Your profile"
        description="Your identity in the Nexus universe."
      />
      <div className="settings-grid">
        <nav className="settings-nav">
          <Link href="/profile" className="active">
            <ShieldCheck size={15} />
            Profile
          </Link>
          <Link href="/settings">
            <Settings2 size={15} />
            Settings
          </Link>
        </nav>
        <Panel>
          <div className="profile-hero">
            <span className="profile-avatar" style={{ background: `${color}15`, color }}>
              {name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <h2>{current.name}</h2>
              <p>
                Member since{' '}
                {new Date(current.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
            </div>
            <Status status="verified">Authenticated</Status>
          </div>
          <section className="settings-section">
            <h2>Personal details</h2>
            <p>This name is visible only in your private workspace.</p>
            {error && <ErrorNotice>{error}</ErrorNotice>}
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await api('/api/profile', { method: 'PATCH', body: { name, avatar_color: color } });
                  await refresh();
                  toast('Profile updated.');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not update profile.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="field">
                Display name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Email address
                <input type="email" readOnly value={current.email} style={{ opacity: 0.6 }} />
                <small>
                  Email changes and recovery require an email service, which is not configured in this
                  deployment.
                </small>
              </label>
              <div className="field">
                Workspace signal color
                <div className="color-picker">
                  {['#a78bfa', '#60a5fa', '#22d3ee', '#34d399', '#fbbf24', '#fb7185'].map((value) => (
                    <button
                      type="button"
                      key={value}
                      style={{ background: value }}
                      className={color === value ? 'selected' : ''}
                      onClick={() => setColor(value)}
                      aria-label={`Choose ${value}`}
                      aria-pressed={color === value}
                    />
                  ))}
                </div>
              </div>
              <div className="form-actions">
                <Button type="submit" loading={busy}>
                  <Check size={15} /> Save profile
                </Button>
              </div>
            </form>
          </section>
          <section className="settings-section">
            <h2>Account security</h2>
            <p>Manage your password and inspect or revoke active sessions.</p>
            <Button href="/settings#security" variant="secondary">
              <ShieldCheck size={15} /> Security settings
            </Button>
          </section>
        </Panel>
      </div>
    </>
  );
}
