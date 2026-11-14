import type { Metadata } from 'next';
import { currentUser } from '@/lib/server/auth';
import { dashboard } from '@/lib/server/repository';
import { Dashboard } from '@/components/dashboard';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'Overview' };
export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <Dashboard initial={await dashboard(user.id)} />;
}
