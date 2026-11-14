import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { missionDetail } from '@/lib/server/repository';
import { AppError } from '@/lib/server/errors';
import { MissionDetail } from '@/components/mission-detail';
export const metadata: Metadata = { title: 'Mission workspace' };
export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await missionDetail(user.id, id).catch((error) => {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  });
  return <MissionDetail key={id} initial={detail} />;
}
