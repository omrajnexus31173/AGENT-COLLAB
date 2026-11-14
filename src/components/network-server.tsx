import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listMissions } from '@/lib/server/repository';
import { NetworkPage } from './network-page';
export async function NetworkServer() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <NetworkPage initial={await listMissions(user.id)} />;
}
