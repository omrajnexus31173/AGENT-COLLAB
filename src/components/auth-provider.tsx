'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionInfo, User } from '@/lib/types';
import { api, setCsrf } from '@/lib/client';
import { ToastProvider } from './ui';
const AuthContext = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, refresh: async () => {}, logout: async () => {} });
export function AuthProvider({ initialUser, children }: { initialUser: User; children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(initialUser);
  const router = useRouter();
  const refresh = async () => {
    const session = await api<SessionInfo>('/api/auth/session');
    setUser(session.user);
    setCsrf(session.csrfToken);
  };
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    setCsrf(null);
    setUser(null);
    router.push('/');
    router.refresh();
  };
  useEffect(() => {
    void refresh().catch(() => {});
    const expired = () => {
      setUser(null);
      router.push('/login');
    };
    window.addEventListener('nexus:session-expired', expired);
    return () => window.removeEventListener('nexus:session-expired', expired);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthContext.Provider value={{ user, refresh, logout }}>
      <ToastProvider>{children}</ToastProvider>
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
