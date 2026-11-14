import type { PoolClient } from 'pg';
import type { ChatMessage, ChatResult } from './providers';
export const estimateTokens = (text: string) => Math.ceil(text.length / 3) + 64;
export function accountedUsage(result: ChatResult, messages: ChatMessage[]) {
  const estimated = result.totalTokens === null;
  return {
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens:
      result.totalTokens ??
      estimateTokens(messages.map((m) => m.content).join('\n')) + Math.ceil(result.content.length / 3),
    estimated,
  };
}
export async function settleOutstanding(client: PoolClient, missionId: string) {
  const outstanding = await client.query(
    `SELECT id FROM tasks WHERE mission_id=$1 AND input_snapshot->>'settled'='false' FOR UPDATE`,
    [missionId],
  );
  if (!outstanding.rowCount) return;
  await client.query(
    `INSERT INTO usage_records(user_id,mission_id,task_id,connection_id,agent_id,purpose,total_tokens,estimated,duration_ms)
    SELECT m.user_id,m.id,t.id,NULLIF(t.input_snapshot->>'connection_id','')::uuid,t.agent_id,'interrupted_estimate',(t.input_snapshot->>'reservation')::int,true,0
    FROM tasks t JOIN missions m ON m.id=t.mission_id WHERE t.mission_id=$1 AND t.input_snapshot->>'settled'='false'`,
    [missionId],
  );
  await client.query(
    `UPDATE missions SET tokens_used=tokens_used+(SELECT coalesce(sum((input_snapshot->>'reservation')::int),0) FROM tasks WHERE mission_id=$1 AND input_snapshot->>'settled'='false'),tokens_reserved=0 WHERE id=$1`,
    [missionId],
  );
  await client.query(
    `UPDATE tasks SET input_snapshot=jsonb_set(input_snapshot,'{settled}','true') WHERE mission_id=$1 AND input_snapshot->>'settled'='false'`,
    [missionId],
  );
  await client.query(`INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'budget_settled',$2)`, [
    missionId,
    JSON.stringify({
      calls: outstanding.rowCount,
      estimated: true,
      reason:
        'Interrupted calls conservatively consume their reserved budget; this is not a provider billing assertion.',
    }),
  ]);
}
