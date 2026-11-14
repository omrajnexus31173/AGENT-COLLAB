import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listProviders } from '@/lib/server/repository';
import { Connections } from '@/components/connections';
export const metadata: Metadata = { title: 'Connection center' };
export default async function ConnectionsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <Connections initial={await listProviders(user.id)} />;
}
