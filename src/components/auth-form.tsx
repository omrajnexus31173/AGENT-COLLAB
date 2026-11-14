'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, setCsrf } from '@/lib/client';
import { Button, ErrorNotice, Logo } from './ui';
import type { User } from '@/lib/types';
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const signup = mode === 'signup';
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const next = params.get('next');
  const destination =
    next &&
    /^\/(dashboard|missions|connections|agents|network|settings|profile|archive)(\/|$|\?)/.test(next) &&
    !next.includes('\\')
      ? next
      : '/dashboard';
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div className="auth-story-top">
          <Logo />
          <Link href="/" className="text-link">
            <ArrowLeft size={15} /> Back to the universe
          </Link>
        </div>
        <div className="auth-story-content">
          <div className="eyebrow">ONE UNIVERSE. MULTIPLE MINDS.</div>
          <h1>
            Intelligence is
            <br />
            better together.
          </h1>
          <p>Your next great idea deserves more than one perspective.</p>
          <img
            src="/images/nexus-fallback.webp"
            alt="A dimensional portal surrounding the Nexus core"
            width="960"
            height="640"
          />
          <div className="auth-story-points">
            <span>
              <Check size={15} /> Your own models
            </span>
            <span>
              <Check size={15} /> Your private squad
            </span>
            <span>
              <Check size={15} /> Your next mission
            </span>
          </div>
        </div>
        <span className="auth-story-footer">NEXUS ARCADE / ENTER THE MULTIVERSE OF INTELLIGENCE</span>
      </div>
      <div className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-form-wrap">
          <div className="auth-symbol">
            <ShieldCheck size={27} />
          </div>
          <div className="eyebrow">{signup ? 'YOUR UNIVERSE STARTS HERE' : 'WELCOME BACK, COMMANDER'}</div>
          <h2>{signup ? 'Create your workspace.' : 'Return to your universe.'}</h2>
          <p>
            {signup
              ? 'A private home for your agents, connections, and missions.'
              : 'Sign in to reconnect with your squad.'}
          </p>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const result = await api<{ user: User; csrfToken: string }>(`/api/auth/${mode}`, {
                  method: 'POST',
                  body: signup ? form : { email: form.email, password: form.password },
                });
                setCsrf(result.csrfToken);
                const session = await api<{ user: User | null }>('/api/auth/session');
                if (!session.user) throw new Error('The session was not established. Please try again.');
                router.replace(destination);
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not sign in.');
                setBusy(false);
              }
            }}
          >
            {signup && (
              <label className="field">
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
            )}
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                maxLength={254}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="field">
              Password
              <span className="password-input">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  placeholder={signup ? 'At least 10 characters' : 'Enter your password'}
                  required
                  minLength={signup ? 10 : 1}
                  maxLength={128}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            {signup && (
              <p className="field-hint">
                Use a unique password with at least 10 characters. No email verification is required in this
                deployment.
              </p>
            )}
            <Button type="submit" loading={busy} className="full-width">
              {busy ? 'Establishing session…' : signup ? 'Create workspace' : 'Enter your workspace'}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-switch">
            {signup ? 'Already have a universe?' : 'New to the arcade?'}{' '}
            <Link href={`${signup ? '/login' : '/signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
              {signup ? 'Sign in' : 'Create an account'} <ArrowUpRightSmall />
            </Link>
          </div>
          <div className="auth-security">
            <LockKeyhole size={14} />
            <span>
              Protected sessions. Server-side credentials.
              <br />
              Your API keys are never sent to the browser.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
function ArrowUpRightSmall() {
  return <ArrowRight size={13} style={{ transform: 'rotate(-40deg)' }} />;
}
