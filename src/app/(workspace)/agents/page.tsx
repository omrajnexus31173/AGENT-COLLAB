import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/server/auth';
import { listAgents, listProviders } from '@/lib/server/repository';
import { Agents } from '@/components/agents';
export const metadata: Metadata = { title: 'Agent roster' };
export default async function AgentsPage() {
  const user = await currentUser();
  if (!user) redirect('/login');
  const [agents, connections] = await Promise.all([listAgents(user.id), listProviders(user.id)]);
  return <Agents initial={agents} connections={connections} />;
}
