'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, KeyRound, LockKeyhole, Monitor, Settings2, ShieldCheck, UserRound } from 'lucide-react';
import type { MissionMode, Preferences } from '@/lib/types';
import { MODE_LABELS } from '@/lib/types';
import { api, setCsrf, useResource } from '@/lib/client';
import { Button, ErrorNotice, PageHeading, Panel, Toggle, useToast } from './ui';
import { useAuth } from './auth-provider';
interface SessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}
export function Settings({ initial }: { initial: Preferences }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const toast = useToast();
  const { refresh: refreshAuth } = useAuth();
  const sessions = useResource<{ sessions: SessionRow[] }>('/api/auth/sessions');
  async function save() {
    setBusy('preferences');
    setError('');
    try {
      await api('/api/preferences', { method: 'PUT', body: form });
      document.documentElement.dataset.motion = form.reduced_motion ? 'reduce' : 'system';
      toast('Workspace preferences saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences.');
    } finally {
      setBusy('');
    }
  }
  async function changePassword() {
    if (passwords.next !== passwords.confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy('password');
    setError('');
    try {
      const result = await api<{ csrfToken: string }>('/api/auth/password', {
        method: 'POST',
        body: { current_password: passwords.current, new_password: passwords.next },
      });
      setCsrf(result.csrfToken);
      await refreshAuth();
      setPasswords({ current: '', next: '', confirm: '' });
      await sessions.refresh();
      toast('Password updated. Other sessions were revoked.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your password.');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE THIS UNIVERSE YOURS"
        title="Workspace settings"
        description="Your defaults, your comfort, your security controls."
      />
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#preferences" className="active">
            <Settings2 size={15} />
            Preferences
          </a>
          <a href="#security">
            <ShieldCheck size={15} />
            Security
          </a>
          <Link href="/profile">
            <UserRound size={15} />
            Profile
          </Link>
        </nav>
        <div className="stack">
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <Panel>
            <section className="settings-section" id="preferences">
              <h2>Mission defaults</h2>
              <p>Start every new mission with the boundaries that work for you.</p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <div className="form-grid">
                  <label className="field">
                    Default collaboration mode
                    <select
                      value={form.default_mode}
                      onChange={(e) => setForm({ ...form, default_mode: e.target.value as MissionMode })}
                    >
                      {(Object.keys(MODE_LABELS) as MissionMode[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {MODE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Default token budget
                    <input
                      type="number"
                      min={1000}
                      max={100000}
                      step={1000}
                      required
                      value={form.token_budget}
                      onChange={(e) => setForm({ ...form, token_budget: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <Toggle
                  checked={form.reduced_motion}
                  onChange={(reduced_motion) => setForm({ ...form, reduced_motion })}
                  label="Reduce workspace motion"
                  description="Suppress decorative animation in the workspace. Your operating system’s reduced-motion preference is always respected."
                />
                {sessions.data?.sessions.length ? (
                  <div className="help-box">
                    <Monitor size={14} /> You have {sessions.data.sessions.length} active session
                    {sessions.data.sessions.length === 1 ? '' : 's'}. Sessions expire after seven days.
                  </div>
                ) : null}
                <div className="form-actions">
                  <Button type="submit" loading={busy === 'preferences'}>
                    <Check size={15} /> Save preferences
                  </Button>
                </div>
              </form>
            </section>
            <section className="settings-section" id="security">
              <h2>Password & authentication</h2>
              <p>Changing your password signs out every other session.</p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void changePassword();
                }}
              >
                <label className="field">
                  Current password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={passwords.current}
                    onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    New password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                      value={passwords.next}
                      onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    Confirm new password
                    <input
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={10}
                      maxLength={128}
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    />
                  </label>
                </div>
                <p className="field-hint">
                  Use at least 10 characters. Passwords are hashed with memory-hard scrypt.
                </p>
                <div className="form-actions">
                  <Button type="submit" variant="secondary" loading={busy === 'password'}>
                    <KeyRound size={14} /> Update password
                  </Button>
                </div>
              </form>
            </section>
            <section className="settings-section">
              <h2>Active sessions</h2>
              <p>Opaque, HttpOnly session cookies. No authentication tokens in local storage.</p>
              {sessions.error && <ErrorNotice>{sessions.error}</ErrorNotice>}
              {sessions.data?.sessions.map((session) => (
                <div className="toggle-row" key={session.id}>
                  <span>
                    <strong className="inline-label">
                      <Monitor size={14} />
                      {session.current ? 'This session' : 'Another session'}
                    </strong>
                    <small>
                      Signed in {new Date(session.created_at).toLocaleString()} · Expires{' '}
                      {new Date(session.expires_at).toLocaleDateString()}
                    </small>
                  </span>
                  {session.current ? (
                    <span className="status status-success">
                      <span className="status-dot" />
                      Current
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      className="button-small"
                      disabled={busy === session.id}
                      onClick={async () => {
                        setBusy(session.id);
                        try {
                          await api(`/api/auth/sessions/${session.id}`, { method: 'DELETE', body: {} });
                          await sessions.refresh();
                          toast('Session revoked.');
                        } catch (e) {
                          toast(e instanceof Error ? e.message : 'Could not revoke session.', 'error');
                        } finally {
                          setBusy('');
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </section>
            <section className="settings-section">
              <h2>Credential storage</h2>
              <p>
                Provider keys are encrypted with AES-256-GCM and authenticated against their owner and
                connection ID. They are never returned by the API.
              </p>
              <div className="notice notice-info">
                <LockKeyhole size={16} />
                Manage or remove individual credentials in the{' '}
                <Link href="/connections" className="text-link">
                  Connection Center
                </Link>
                .
              </div>
            </section>
          </Panel>
        </div>
      </div>
    </>
  );
}
