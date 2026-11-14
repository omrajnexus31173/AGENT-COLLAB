'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import type { Preferences } from '@/lib/types';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Archive,
  Bot,
  ChevronRight,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Plug,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type { User } from '@/lib/types';
import { useAuth } from './auth-provider';
import { Logo } from './ui';
const links = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/missions', label: 'Mission control', icon: Command },
  { href: '/network', label: 'Live network', icon: Network },
  { href: '/agents', label: 'Agent roster', icon: Bot },
  { href: '/connections', label: 'Connections', icon: Plug },
  { href: '/archive', label: 'Mission archive', icon: Archive },
];
export function AppShell({ user, children }: { user: User; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    void api<{ preferences: Preferences }>('/api/preferences')
      .then(({ preferences }) => {
        document.documentElement.dataset.motion = preferences.reduced_motion ? 'reduce' : 'system';
      })
      .catch(() => {});
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, []);
  const current =
    links.find((l) => pathname.startsWith(l.href))?.label ||
    (pathname.startsWith('/settings')
      ? 'Settings'
      : pathname.startsWith('/profile')
        ? 'Profile'
        : 'Workspace');
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-selector">
          <span className="workspace-symbol">N</span>
          <span>
            Personal universe<small>Private workspace</small>
          </span>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobile(false)}
              className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              {href === '/missions' && <Plus size={14} className="nav-end" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="little-orbit" />
            <strong>Your minds. Your mission.</strong>
            <p>
              Bring your own models.
              <br />
              Build something greater.
            </p>
            <Link href="/connections">
              Connect a provider <ChevronRight size={14} />
            </Link>
          </div>
          <Link
            href="/settings"
            className={`nav-link ${pathname === '/settings' ? 'active' : ''}`}
            onClick={() => setMobile(false)}
          >
            <Settings size={18} />
            Settings
          </Link>
          <Link
            href="/profile"
            className={`nav-link ${pathname === '/profile' ? 'active' : ''}`}
            onClick={() => setMobile(false)}
          >
            <UserRound size={18} />
            Profile
          </Link>
          <div className="sidebar-user">
            <Link
              href="/profile"
              className="avatar"
              style={{ background: `${user.avatar_color}22`, color: user.avatar_color }}
            >
              {user.name.slice(0, 2).toUpperCase()}
            </Link>
            <Link href="/profile" className="user-label">
              <strong>{user.name}</strong>
              <small>Personal account</small>
            </Link>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                try {
                  await logout();
                } finally {
                  setLoggingOut(false);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="desktop-only">Workspace</span>
            <ChevronRight size={14} className="desktop-only" />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                router.push(`/archive?q=${encodeURIComponent(search)}`);
              }}
            >
              <Search size={15} />
              <input
                aria-label="Search missions"
                placeholder="Search missions…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <span className="private-indicator">
              <ShieldCheck size={14} />
              <span>Private workspace</span>
            </span>
            <Link
              href="/profile"
              className="avatar avatar-small"
              style={{ background: `${user.avatar_color}22`, color: user.avatar_color }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </Link>
          </div>
        </header>
        <main id="main-content" className="workspace-content">
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            NEXUS ARCADE <span className="muted">/</span> ONE UNIVERSE. MULTIPLE MINDS.
          </span>
          <span>
            <Activity size={12} /> Backend-driven collaboration
          </span>
        </footer>
      </div>
    </div>
  );
}
