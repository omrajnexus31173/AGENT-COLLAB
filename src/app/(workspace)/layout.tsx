import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { AuthProvider } from '@/components/auth-provider';
import { AppShell } from '@/components/app-shell';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  return (
    <AuthProvider initialUser={user}>
      <AppShell user={user}>{children}</AppShell>
    </AuthProvider>
  );
}
