import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { Profile } from '@/components/profile';
export const metadata: Metadata = { title: 'Profile' };
export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <Profile initial={user} />;
}
