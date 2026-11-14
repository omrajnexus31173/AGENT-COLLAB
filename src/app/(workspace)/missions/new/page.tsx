import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listAgents, listProviders } from '@/lib/server/repository';
import { one } from '@/lib/server/db';
import { MODES, type MissionMode, type Preferences } from '@/lib/types';
import { MissionCreate } from '@/components/mission-create';
export const metadata: Metadata = { title: 'Launch a mission' };
export default async function NewMissionPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const [agents, connections, prefs, params] = await Promise.all([
    listAgents(user.id),
    listProviders(user.id),
    one<Preferences>(
      'SELECT default_mode,token_budget,reduced_motion,email_notifications FROM user_preferences WHERE user_id=$1',
      [user.id],
    ),
    searchParams,
  ]);
  const mode = MODES.includes(params.mode as MissionMode)
    ? (params.mode as MissionMode)
    : prefs?.default_mode || 'round_table';
  return (
    <MissionCreate
      agents={agents}
      connections={connections}
      defaultMode={mode}
      defaultBudget={prefs?.token_budget || 30000}
    />
  );
}
