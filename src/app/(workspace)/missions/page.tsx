import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listMissions } from '@/lib/server/repository';
import { MissionArchive } from '@/components/mission-archive';
export const metadata: Metadata = { title: 'Mission control' };
export default async function MissionsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <MissionArchive initial={await listMissions(user.id)} />;
}
