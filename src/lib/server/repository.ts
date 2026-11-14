import type { Agent, DashboardData, Mission, MissionDetail, ProviderConnection, Usage } from '@/lib/types';
import { query, one } from './db';
import { notFound } from './http';

export const PROVIDER_COLUMNS = `id,name,kind,protocol,base_url,default_model,selected_models,key_hint,(encrypted_key IS NOT NULL) AS has_credential,enabled,verification_status,verified_at,verified_model,last_error,created_at,updated_at`;
export async function listProviders(userId: string) {
  return query<ProviderConnection>(
    `SELECT ${PROVIDER_COLUMNS} FROM provider_connections WHERE user_id=$1 ORDER BY created_at`,
    [userId],
  );
}
export async function getProvider(userId: string, id: string) {
  const row = await one<ProviderConnection>(
    `SELECT ${PROVIDER_COLUMNS} FROM provider_connections WHERE user_id=$1 AND id=$2`,
    [userId, id],
  );
  if (!row) throw notFound();
  return row;
}
export async function listAgents(userId: string) {
  return query<Agent>(
    'SELECT id,name,role,color,avatar,system_prompt,connection_id,model,temperature::float,max_output_tokens,enabled,configuration,created_at FROM agents WHERE user_id=$1 ORDER BY created_at,id',
    [userId],
  );
}
export async function getAgent(userId: string, id: string) {
  const row = await one<Agent>(
    'SELECT id,name,role,color,avatar,system_prompt,connection_id,model,temperature::float,max_output_tokens,enabled,configuration,created_at FROM agents WHERE user_id=$1 AND id=$2',
    [userId, id],
  );
  if (!row) throw notFound();
  return row;
}
const missionSelect = `id,title,brief,mode,status,settings,agent_snapshot,synthesis_agent_id,token_budget,tokens_used,tokens_reserved,max_steps,iteration,version,error,parent_mission_id,created_at,updated_at,started_at,completed_at,(SELECT count(*) FROM tasks t WHERE t.mission_id=m.id)::int AS task_count,(SELECT count(*) FROM tasks t WHERE t.mission_id=m.id AND t.status='completed')::int AS completed_count`;
export async function listMissions(userId: string, search = '', status = '', limit = 50, offset = 0) {
  return query<Mission>(
    `SELECT ${missionSelect} FROM missions m WHERE user_id=$1 AND ($2='' OR title ILIKE '%' || $2 || '%' OR brief ILIKE '%' || $2 || '%') AND ($3='' OR status=$3) ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
    [
      userId,
      search.slice(0, 140),
      status,
      Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
      Number.isSafeInteger(offset) ? Math.min(Math.max(offset, 0), 1_000_000) : 0,
    ],
  );
}
export async function getMission(userId: string, id: string) {
  const mission = await one<Mission>(`SELECT ${missionSelect} FROM missions m WHERE user_id=$1 AND id=$2`, [
    userId,
    id,
  ]);
  if (!mission) throw notFound();
  return mission;
}
export async function missionDetail(userId: string, id: string): Promise<MissionDetail> {
  const mission = await getMission(userId, id);
  const [tasks, dependencies, messages, events, output, usage] = await Promise.all([
    query<MissionDetail['tasks'][number]>(
      'SELECT id,mission_id,agent_id,title,instructions,kind,status,position,recipient_agent_id,attempts,output,response_model,provider_request_id,last_error,created_at,started_at,completed_at FROM tasks WHERE mission_id=$1 ORDER BY position',
      [id],
    ),
    query<MissionDetail['dependencies'][number]>(
      'SELECT d.task_id,d.depends_on FROM task_dependencies d JOIN tasks t ON t.id=d.task_id WHERE t.mission_id=$1',
      [id],
    ),
    query<MissionDetail['messages'][number]>(
      'SELECT id,mission_id,task_id,from_agent_id,to_agent_id,role,kind,content,created_at FROM agent_messages WHERE mission_id=$1 ORDER BY created_at,id',
      [id],
    ),
    query<MissionDetail['events'][number]>(
      'SELECT id,mission_id,type,payload,created_at FROM mission_events WHERE mission_id=$1 ORDER BY id DESC LIMIT 200',
      [id],
    ).then((rows) => rows.reverse()),
    one<NonNullable<MissionDetail['output']>>(
      'SELECT id,mission_id,agent_id,content,model,evidence,created_at FROM mission_outputs WHERE mission_id=$1',
      [id],
    ),
    query<Usage>(
      'SELECT id,purpose,total_tokens,input_tokens,output_tokens,estimated,duration_ms,response_model,created_at FROM usage_records WHERE mission_id=$1 ORDER BY created_at',
      [id],
    ),
  ]);
  return { mission, tasks, dependencies, messages, events, output, usage };
}
export async function dashboard(userId: string): Promise<DashboardData> {
  const [missions, agents, connections, stats, activity] = await Promise.all([
    listMissions(userId, '', '', 6),
    listAgents(userId),
    listProviders(userId),
    one<{ missions: number; completed: number; active: number; tokens: number }>(
      `SELECT count(*)::int AS count_missions, count(*) FILTER(WHERE status='completed')::int AS completed, count(*) FILTER(WHERE status IN ('running','queued','paused','awaiting_approval','interrupted'))::int AS active, coalesce(sum(tokens_used),0)::int AS tokens FROM missions WHERE user_id=$1`,
      [userId],
    ),
    query<MissionDetail['events'][number]>(
      'SELECT e.id,e.mission_id,e.type,e.payload,e.created_at FROM mission_events e JOIN missions m ON m.id=e.mission_id WHERE m.user_id=$1 ORDER BY e.id DESC LIMIT 8',
      [userId],
    ),
  ]);
  const s = stats as unknown as { count_missions: number; completed: number; active: number; tokens: number };
  return {
    missions,
    agents,
    connections,
    stats: {
      missions: s.count_missions,
      completed: s.completed,
      active: s.active,
      agents: agents.length,
      verified: connections.filter((c) => c.verification_status === 'verified' && c.enabled).length,
      tokens: s.tokens,
    },
    activity,
  };
}
