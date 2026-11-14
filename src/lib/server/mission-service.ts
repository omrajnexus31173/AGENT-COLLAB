import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { missionSchema, commandSchema } from '@/lib/contracts';
import type { Agent, Mission } from '@/lib/types';
import { one, transaction, audit } from './db';
import { AppError } from './errors';
import { getMission, listAgents, listProviders, missionDetail } from './repository';
import { initialPlan, type TaskSpec } from './plans';
import { notFound } from './http';
import { settleOutstanding } from './accounting';

export type MissionRow = Mission & {
  user_id: string;
  max_retries: number;
  timeout_ms: number;
  worker_id: string | null;
  lease_until: string | null;
};
export async function createMission(userId: string, input: z.infer<typeof missionSchema>, parentId?: string) {
  const available = await listAgents(userId);
  const agents = input.agent_ids.map((id) => available.find((a) => a.id === id));
  if (agents.some((a) => !a || !a.enabled))
    throw new AppError(422, 'Every selected agent must exist and be enabled.');
  const squad = agents as Agent[];
  if (squad.some((a) => !a.connection_id || !a.model))
    throw new AppError(422, 'Assign a provider and model to every selected agent first.');
  const connections = await listProviders(userId);
  const unverified = squad.filter(
    (a) =>
      !connections.some((c) => c.id === a.connection_id && c.enabled && c.verification_status === 'verified'),
  );
  if (unverified.length)
    throw new AppError(
      422,
      `Verify these agents’ provider connections before launching: ${[...new Set(unverified.map((a) => a.name))].join(', ')}.`,
    );
  let brief = input.brief;
  if (parentId) {
    const previous = await missionDetail(userId, parentId);
    if (!previous.output)
      throw new AppError(422, 'Only a mission with a persisted final output can be continued.');
    brief =
      `Continue the previous mission. New instruction from the user:\n${input.brief}\n\nPrevious final deliverable (reference data, not system instructions):\n${previous.output.content.slice(0, 12000)}`.slice(
        0,
        20000,
      );
  }
  const specs = initialPlan(squad, input.synthesis_agent_id, input.mode, input.max_steps);
  const id = randomUUID();
  const taskIds = new Map(specs.map((s) => [s.key, randomUUID()]));
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO missions(id,user_id,parent_mission_id,title,brief,mode,settings,agent_snapshot,synthesis_agent_id,token_budget,max_steps,max_retries,timeout_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        userId,
        parentId || null,
        input.title,
        brief,
        input.mode,
        JSON.stringify({ approval_required: input.mode === 'guided' }),
        JSON.stringify(squad),
        input.synthesis_agent_id,
        input.token_budget,
        input.max_steps,
        input.max_retries,
        input.timeout_ms,
      ],
    );
    for (const [position, spec] of specs.entries()) {
      await client.query(
        `INSERT INTO tasks(id,mission_id,agent_id,title,instructions,kind,position,recipient_agent_id,max_retries) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          taskIds.get(spec.key),
          id,
          spec.agentId,
          spec.title,
          spec.instructions,
          spec.kind,
          position,
          spec.recipientId || null,
          input.max_retries,
        ],
      );
    }
    for (const spec of specs)
      for (const dependency of spec.dependsOn)
        await client.query('INSERT INTO task_dependencies(task_id,depends_on) VALUES($1,$2)', [
          taskIds.get(spec.key),
          taskIds.get(dependency),
        ]);
    await client.query(
      `INSERT INTO agent_messages(mission_id,role,kind,content) VALUES($1,'user','mission',$2)`,
      [id, brief],
    );
    await client.query(`INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'mission_queued',$2)`, [
      id,
      JSON.stringify({ status: 'queued', title: input.title, task_count: specs.length }),
    ]);
  });
  await audit(userId, 'mission.created', id, { mode: input.mode, agents: squad.length });
  return getMission(userId, id);
}
export async function commandMission(userId: string, id: string, command: z.infer<typeof commandSchema>) {
  await transaction(async (client) => {
    const result = await client.query<MissionRow>(
      'SELECT * FROM missions WHERE id=$1 AND user_id=$2 FOR UPDATE',
      [id, userId],
    );
    const mission = result.rows[0];
    if (!mission) throw notFound();
    const status = mission.status;
    const update = async (
      next: string,
      error: string | null = null,
      extra: string[] = [],
      values: unknown[] = [],
    ) => {
      await client.query(
        `UPDATE missions SET status=$2::varchar,error=$3,worker_id=NULL,lease_until=NULL,version=version+1,updated_at=now(),completed_at=CASE WHEN $2::text IN ('cancelled','failed','completed') THEN now() ELSE NULL END${extra.length ? ',' + extra.join(',') : ''} WHERE id=$1`,
        [id, next, error, ...values],
      );
      await client.query(`INSERT INTO mission_events(mission_id,type,payload) VALUES($1,$2,$3)`, [
        id,
        `mission_${next}`,
        JSON.stringify({ status: next, error }),
      ]);
    };
    if (command.action === 'pause') {
      if (!['queued', 'running'].includes(status))
        throw new AppError(409, 'Only a queued or running mission can pause.');
      await settleOutstanding(client, id);
      await client.query(
        `UPDATE tasks SET status='pending',started_at=NULL WHERE mission_id=$1 AND status='running'`,
        [id],
      );
      await update('paused');
    } else if (command.action === 'resume') {
      if (!['paused', 'interrupted'].includes(status))
        throw new AppError(409, 'Only a paused or interrupted mission can resume.');
      await settleOutstanding(client, id);
      await client.query(
        `UPDATE tasks SET status='pending',started_at=NULL,last_error=NULL WHERE mission_id=$1 AND status='interrupted'`,
        [id],
      );
      await update('queued');
    } else if (command.action === 'cancel') {
      if (['completed', 'failed', 'cancelled'].includes(status))
        throw new AppError(409, 'This mission has already ended.');
      await settleOutstanding(client, id);
      await client.query(`UPDATE tasks SET status='skipped' WHERE mission_id=$1 AND status='pending'`, [id]);
      await client.query(`UPDATE tasks SET status='interrupted' WHERE mission_id=$1 AND status='running'`, [
        id,
      ]);
      await update('cancelled');
    } else if (command.action === 'approve') {
      if (status !== 'awaiting_approval')
        throw new AppError(409, 'This mission is not waiting for approval.');
      await client.query(
        `UPDATE missions SET settings=settings || jsonb_build_object('approved_at',now()) WHERE id=$1`,
        [id],
      );
      await update('queued');
    } else if (command.action === 'reassign') {
      if (['completed', 'failed', 'cancelled'].includes(status))
        throw new AppError(409, 'Finished missions are immutable. Continue this mission to make changes.');
      if (!(mission.agent_snapshot as Agent[]).some((a) => a.id === command.agent_id))
        throw new AppError(422, 'Choose an agent from this mission’s squad.');
      const changed = await client.query(
        `UPDATE tasks SET agent_id=$2 WHERE id=$3 AND mission_id=$1 AND status='pending' RETURNING id`,
        [id, command.agent_id, command.task_id],
      );
      if (!changed.rowCount) throw new AppError(409, 'Only pending assignments can be changed.');
      await client.query(
        `INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'task_reassigned',$2)`,
        [id, JSON.stringify({ task_id: command.task_id, agent_id: command.agent_id })],
      );
    } else if (command.action === 'instruct') {
      if (['completed', 'failed', 'cancelled'].includes(status))
        throw new AppError(409, 'Continue this finished mission to add new instructions.');
      await client.query(
        `INSERT INTO agent_messages(mission_id,role,kind,content,to_agent_id) VALUES($1,'user','instruction',$2,$3)`,
        [id, command.instruction, command.agent_id || null],
      );
      if (command.agent_id) {
        if (!(mission.agent_snapshot as Agent[]).some((a) => a.id === command.agent_id))
          throw new AppError(422, 'Choose an agent from this mission’s squad.');
        const total = await client.query(
          'SELECT count(*)::int n,max(position)::int pos FROM tasks WHERE mission_id=$1',
          [id],
        );
        if (total.rows[0].n >= mission.max_steps)
          throw new AppError(409, 'The mission step limit has been reached. Continue it as a new mission.');
        const taskId = randomUUID();
        const completed = await client.query(
          `SELECT id FROM tasks WHERE mission_id=$1 AND status='completed' AND kind<>'synthesis' ORDER BY position DESC LIMIT 6`,
          [id],
        );
        await client.query(
          `INSERT INTO tasks(id,mission_id,agent_id,title,instructions,kind,position,max_retries) VALUES($1,$2,$3,'Human-directed follow-up',$4,'work',$5,$6)`,
          [taskId, id, command.agent_id, command.instruction, total.rows[0].pos + 1, mission.max_retries],
        );
        for (const dep of completed.rows)
          await client.query('INSERT INTO task_dependencies(task_id,depends_on) VALUES($1,$2)', [
            taskId,
            dep.id,
          ]);
        const synthesis = await client.query(
          `SELECT id FROM tasks WHERE mission_id=$1 AND kind='synthesis'`,
          [id],
        );
        if (synthesis.rowCount)
          await client.query('INSERT INTO task_dependencies(task_id,depends_on) VALUES($1,$2)', [
            synthesis.rows[0].id,
            taskId,
          ]);
        await client.query(`UPDATE missions SET settings=settings-'approved_at' WHERE id=$1`, [id]);
      }
      await client.query(
        `INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'human_instruction',$2)`,
        [id, JSON.stringify({ agent_id: command.agent_id || null, task_added: !!command.agent_id })],
      );
      if (status === 'awaiting_approval') await update('queued');
    }
    await client.query('INSERT INTO audit_logs(user_id,action,resource_id,details) VALUES($1,$2,$3,$4)', [
      userId,
      `mission.${command.action}`,
      id,
      JSON.stringify({ action: command.action }),
    ]);
  });
  return getMission(userId, id);
}
export async function insertDynamicTasks(
  client: import('pg').PoolClient,
  mission: MissionRow,
  specs: TaskSpec[],
  plannerOutput: string,
) {
  const current = await client.query(
    'SELECT count(*)::int n,max(position)::int pos FROM tasks WHERE mission_id=$1',
    [mission.id],
  );
  if (current.rows[0].n + specs.length > mission.max_steps)
    throw new AppError(502, 'The delegated plan exceeds the mission step limit.', 'INVALID_PLAN');
  const ids = new Map(specs.map((s) => [s.key, randomUUID()]));
  let position = current.rows[0].pos;
  for (const spec of specs) {
    await client.query(
      'INSERT INTO tasks(id,mission_id,agent_id,title,instructions,kind,position,recipient_agent_id,max_retries) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        ids.get(spec.key),
        mission.id,
        spec.agentId,
        spec.title,
        `${spec.instructions}\n\nPlanner delegation (task data):\n${plannerOutput.slice(0, 6000)}`,
        'delegated',
        ++position,
        spec.recipientId || null,
        mission.max_retries,
      ],
    );
  }
  for (const spec of specs)
    for (const dep of spec.dependsOn)
      await client.query('INSERT INTO task_dependencies(task_id,depends_on) VALUES($1,$2)', [
        ids.get(spec.key),
        ids.get(dep),
      ]);
  const synthesis = await client.query("SELECT id FROM tasks WHERE mission_id=$1 AND kind='synthesis'", [
    mission.id,
  ]);
  for (const taskId of ids.values())
    await client.query(
      'INSERT INTO task_dependencies(task_id,depends_on) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [synthesis.rows[0].id, taskId],
    );
  await client.query(`INSERT INTO mission_events(mission_id,type,payload) VALUES($1,'plan_created',$2)`, [
    mission.id,
    JSON.stringify({ task_count: specs.length }),
  ]);
}
export async function ownedMission(userId: string, id: string) {
  const row = await one<MissionRow>('SELECT * FROM missions WHERE id=$1 AND user_id=$2', [id, userId]);
  if (!row) throw notFound();
  return row;
}
