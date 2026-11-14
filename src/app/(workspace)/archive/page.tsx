import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listMissions } from '@/lib/server/repository';
import { MissionArchive } from '@/components/mission-archive';
export const metadata: Metadata = { title: 'Mission archive' };
export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { q } = await searchParams;
  const query = (q || '').slice(0, 140);
  return (
    <MissionArchive key={query} initial={await listMissions(user.id, query)} archive initialQuery={query} />
  );
}
