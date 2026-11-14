import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import type { Preferences } from '@/lib/types';
import { Settings } from '@/components/settings';
export const metadata: Metadata = { title: 'Settings' };
export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const prefs = await one<Preferences>(
    'SELECT default_mode,token_budget,reduced_motion,email_notifications FROM user_preferences WHERE user_id=$1',
    [user.id],
  );
  return (
    <Settings
      initial={
        prefs || {
          default_mode: 'round_table',
          token_budget: 30000,
          reduced_motion: false,
          email_notifications: false,
        }
      }
    />
  );
}
