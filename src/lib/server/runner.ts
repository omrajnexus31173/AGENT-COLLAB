import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Agent, Evidence } from '@/lib/types';
import { query, one, transaction } from './db';
import { AppError } from './errors';
import { chat, defaultTransport, type ChatResult, type ChatMessage, type Transport } from './providers';
import { providerConfig } from './provider-service';
import { buildContext, type DependencyFinding } from './context';
import { accountedUsage, estimateTokens, settleOutstanding } from './accounting';
import { insertDynamicTasks, type MissionRow } from './mission-service';
import { parseDelegatedPlan } from './plans';

export interface TaskRow {
  id: string;
  mission_id: string;
  agent_id: string;
  title: string;
  instructions: string;
  kind: string;
  status: string;
  position: number;
  recipient_agent_id: string | null;
  attempts: number;
  max_retries: number;
  next_attempt_at: string | null;
  input_snapshot: {
    messages: ChatMessage[];
    reservation: number;
    settled: boolean;
    execution_id?: string;
    connection_id: string | null;
    context_hash: string;
  } | null;
  output: string | null;
}
interface ClaimedTask {
  task: TaskRow;
  messages: ChatMessage[];
  reservation: number;
  agent: Agent;
}
// Each claim gets a fresh fencing token. A process can outlive one of its
// missions' leases, so a process-level ID is not sufficient after recovery.
const active = new Map<string, AbortController>();
export function notifyMission(id: string, action: string) {
  if (['pause', 'cancel'].includes(action)) active.get(id)?.abort();
}
async function event(client: PoolClient, id: string, type: string, payload: Record<string, unknown> = {}) {
  await client.query('INSERT INTO mission_events(mission_id,type,payload) VALUES($1,$2,$3)', [
    id,
    type,
    JSON.stringify(payload),
  ]);
}
async function lockMission(client: PoolClient, id: string) {
  const result = await client.query<MissionRow>('SELECT * FROM missions WHERE id=$1 FOR UPDATE', [id]);
  return result.rows[0];
}
async function failMission(client: PoolClient, id: string, message: string) {
  await client.query(`UPDATE tasks SET status='skipped' WHERE mission_id=$1 AND status='pending'`, [id]);
  await client.query(`UPDATE tasks SET status='interrupted' WHERE mission_id=$1 AND status='running'`, [id]);
  await client.query(
    `UPDATE missions SET status='failed',error=$2,worker_id=NULL,lease_until=NULL,completed_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
    [id, message.slice(0, 500)],
  );
  await event(client, id, 'mission_failed', { status: 'failed', error: message.slice(0, 500) });
}
export async function recoverExpired() {
  await transaction(async (client) => {
    const expired = await client.query<{ id: string }>(
      `SELECT id FROM missions WHERE status='running' AND lease_until<now() FOR UPDATE SKIP LOCKED LIMIT 20`,
    );
    for (const { id } of expired.rows) {
      await settleOutstanding(client, id);
      await client.query(
        `UPDATE tasks SET status='interrupted',last_error='Worker lease expired. Resume explicitly to retry; an upstream call may have been billed.' WHERE mission_id=$1 AND status='running'`,
        [id],
      );
      await client.query(
        `UPDATE missions SET status='interrupted',worker_id=NULL,lease_until=NULL,error='The worker stopped unexpectedly. Completed tasks are preserved. Resume explicitly to retry interrupted calls.',version=version+1,updated_at=now() WHERE id=$1`,
        [id],
      );
      await event(client, id, 'mission_interrupted', {
        status: 'interrupted',
        reason: 'worker_lease_expired',
      });
    }
  });
}
export async function claimMission(): Promise<MissionRow | null> {
  return transaction(async (client) => {
    const candidate = await client.query<{ id: string }>(
      `SELECT id FROM missions WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!candidate.rowCount) return null;
    const result = await client.query<MissionRow>(
      `UPDATE missions SET status='running',worker_id=$2,lease_until=now()+interval '45 seconds',started_at=coalesce(started_at,now()),updated_at=now(),version=version+1 WHERE id=$1 RETURNING *`,
      [candidate.rows[0].id, randomUUID()],
    );
    await event(client, result.rows[0].id, 'mission_running', { status: 'running' });
    return result.rows[0];
  });
}
async function claimTask(mission: MissionRow, executionId: string): Promise<ClaimedTask | null> {
  return transaction(async (client) => {
    const m = await lockMission(client, mission.id);
    if (!m || m.status !== 'running' || m.worker_id !== executionId) return null;
    const ready = await client.query<TaskRow>(
      `SELECT t.* FROM tasks t WHERE t.mission_id=$1 AND t.status='pending' AND (t.next_attempt_at IS NULL OR t.next_attempt_at<=now())
      AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks dep ON dep.id=d.depends_on WHERE d.task_id=t.id AND dep.status<>'completed') ORDER BY t.position FOR UPDATE LIMIT 1`,
      [m.id],
    );
    if (!ready.rowCount) {
      const pending = await client.query<{ status: string; count: number }>(
        'SELECT status,count(*)::int FROM tasks WHERE mission_id=$1 GROUP BY status',
        [m.id],
      );
      const counts = Object.fromEntries(pending.rows.map((r) => [r.status, r.count]));
      if (!counts.pending && !counts.running && !counts.completed)
        await failMission(client, m.id, 'No task could be executed.');
      else if (!counts.pending && !counts.running && !counts.interrupted) {
        const missing = await client.query(
          `SELECT 1 FROM tasks WHERE mission_id=$1 AND kind='synthesis' AND status='completed'`,
          [m.id],
        );
        if (!missing.rowCount)
          await failMission(client, m.id, 'The dependency graph ended without a completed synthesis.');
      }
      return null;
    }
    const task = ready.rows[0];
    if (task.kind === 'synthesis' && m.settings.approval_required && !m.settings.approved_at) {
      await client.query(
        `UPDATE missions SET status='awaiting_approval',worker_id=NULL,lease_until=NULL,version=version+1,updated_at=now() WHERE id=$1`,
        [m.id],
      );
      await event(client, m.id, 'mission_awaiting_approval', { status: 'awaiting_approval' });
      return null;
    }
    const agents = m.agent_snapshot as Agent[];
    const agent = agents.find((a) => a.id === task.agent_id);
    if (!agent?.connection_id || !agent.model) {
      await failMission(client, m.id, 'An agent has no assigned provider or model.');
      return null;
    }
    const deps = await client.query<DependencyFinding>(
      `SELECT t.id,t.title,t.output,t.agent_id FROM tasks t JOIN task_dependencies d ON d.depends_on=t.id WHERE d.task_id=$1 AND t.status='completed' ORDER BY t.position`,
      [task.id],
    );
    const instructions = await client.query<{ content: string; created_at: string }>(
      `SELECT content,created_at FROM agent_messages WHERE mission_id=$1 AND role='user' AND (to_agent_id IS NULL OR to_agent_id=$2) ORDER BY created_at DESC LIMIT 5`,
      [m.id, agent.id],
    );
    const context = buildContext({
      agent,
      mode: m.mode,
      title: m.title,
      brief: m.brief,
      task,
      dependencies: deps.rows,
      instructions: instructions.rows.reverse(),
      squad: agents,
      maxSteps: m.max_steps,
    });
    const reservation =
      estimateTokens(context.messages.map((x) => x.content).join('\n')) + agent.max_output_tokens;
    if (m.tokens_used + m.tokens_reserved + reservation > m.token_budget) {
      await failMission(
        client,
        m.id,
        `The ${m.token_budget.toLocaleString('en-US')}-token budget cannot reserve the next call. Completed work is preserved; continue with a larger budget.`,
      );
      return null;
    }
    if (m.iteration >= m.max_steps * (m.max_retries + 1)) {
      await failMission(client, m.id, 'The bounded attempt limit was reached.');
      return null;
    }
    const snapshot = {
      messages: context.messages,
      reservation,
      settled: false,
      execution_id: executionId,
      connection_id: agent.connection_id,
      context_hash: context.contextHash,
    };
    const updated = await client.query<TaskRow>(
      `UPDATE tasks SET status='running',attempts=attempts+1,input_snapshot=$2,started_at=now(),last_error=NULL WHERE id=$1 RETURNING *`,
      [task.id, JSON.stringify(snapshot)],
    );
    await client.query(
      'UPDATE missions SET tokens_reserved=tokens_reserved+$2,iteration=iteration+1,version=version+1,updated_at=now() WHERE id=$1',
      [m.id, reservation],
    );
    await event(client, m.id, 'task_started', {
      task_id: task.id,
      agent_id: agent.id,
      title: task.title,
      attempt: updated.rows[0].attempts,
      context_hash: context.contextHash,
      context_truncated: context.truncated,
      dependency_ids: context.dependencyIds,
      reservation,
    });
    return { task: updated.rows[0], messages: context.messages, reservation, agent };
  });
}
async function completeTask(
  mission: MissionRow,
  claimed: ClaimedTask,
  result: ChatResult,
  duration: number,
  executionId: string,
) {
  const { task, agent, messages, reservation } = claimed;
  const usage = accountedUsage(result, messages);
  await transaction(async (client) => {
    const m = await lockMission(client, mission.id);
    if (!m || m.status !== 'running' || m.worker_id !== executionId)
      throw new AppError(499, 'This mission is no longer owned by the active worker.', 'CANCELLED');
    const current = await client.query<TaskRow>('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [task.id]);
    if (
      current.rows[0]?.status !== 'running' ||
      current.rows[0]?.attempts !== task.attempts ||
      current.rows[0]?.input_snapshot?.execution_id !== executionId ||
      current.rows[0]?.input_snapshot?.settled
    )
      throw new AppError(499, 'This task was interrupted or replaced by a newer attempt.', 'CANCELLED');
    await client.query(
      `UPDATE tasks SET status='completed',output=$2,response_model=$3,provider_request_id=$4,completed_at=now(),input_snapshot=jsonb_set(input_snapshot,'{settled}','true') WHERE id=$1`,
      [task.id, result.content, result.model, result.requestId],
    );
    await client.query(
      'UPDATE missions SET tokens_used=tokens_used+$2,tokens_reserved=greatest(0,tokens_reserved-$3),version=version+1,updated_at=now() WHERE id=$1',
      [mission.id, usage.totalTokens, reservation],
    );
    await client.query(
      `INSERT INTO usage_records(user_id,mission_id,task_id,connection_id,agent_id,purpose,input_tokens,output_tokens,total_tokens,estimated,duration_ms,response_model,provider_request_id)
      VALUES($1,$2,$3,$4,$5,'mission',$6,$7,$8,$9,$10,$11,$12)`,
      [
        m.user_id,
        m.id,
        task.id,
        agent.connection_id,
        agent.id,
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.estimated,
        duration,
        result.model,
        result.requestId,
      ],
    );
    const message = await client.query<{ id: string }>(
      `INSERT INTO agent_messages(mission_id,task_id,from_agent_id,to_agent_id,role,kind,content) VALUES($1,$2,$3,$4,'assistant',$5,$6) RETURNING id`,
      [
        m.id,
        task.id,
        agent.id,
        task.recipient_agent_id,
        task.kind === 'plan'
          ? 'delegation'
          : task.kind === 'synthesis'
            ? 'synthesis'
            : task.recipient_agent_id
              ? 'review'
              : 'finding',
        result.content,
      ],
    );
    await event(client, m.id, 'task_completed', {
      task_id: task.id,
      agent_id: agent.id,
      to_agent_id: task.recipient_agent_id,
      title: task.title,
      model: result.model,
      provider_request_id: result.requestId,
      tokens: usage.totalTokens,
      estimated: usage.estimated,
    });
    await event(client, m.id, 'message_created', {
      message_id: message.rows[0].id,
      task_id: task.id,
      from_agent_id: agent.id,
      to_agent_id: task.recipient_agent_id,
    });
    if (task.kind === 'plan') {
      const specs = parseDelegatedPlan(
        result.content,
        m.agent_snapshot as Agent[],
        agent.id,
        m.synthesis_agent_id,
        m.max_steps - 2,
      );
      await insertDynamicTasks(client, m, specs, result.content);
    }
    if (task.kind === 'synthesis') {
      const evidence = await client.query<Evidence>(
        `SELECT t.id task_id,a.id message_id,$2::text agent,t.title,t.response_model model,t.provider_request_id FROM tasks t LEFT JOIN agent_messages a ON a.task_id=t.id AND a.role='assistant' WHERE t.mission_id=$1 AND t.status='completed' AND t.kind<>'synthesis' ORDER BY t.position`,
        [m.id, agent.name],
      );
      const appendix = `\n\n---\n## Recorded execution evidence\n${evidence.rows.map((e) => `- **${e.title}** — ${e.agent}; model: ${e.model || 'not reported'}; task: \`${e.task_id}\`${e.provider_request_id ? `; provider request: \`${e.provider_request_id}\`` : ''}.`).join('\n')}\n\nThese are recorded model calls and handoffs, not independent correctness verification. No code-execution or browsing tools were available to this mission.`;
      await client.query(
        'INSERT INTO mission_outputs(mission_id,agent_id,content,model,evidence) VALUES($1,$2,$3,$4,$5)',
        [m.id, agent.id, result.content + appendix, result.model, JSON.stringify(evidence.rows)],
      );
      await client.query(
        `UPDATE missions SET status='completed',completed_at=now(),worker_id=NULL,lease_until=NULL,error=NULL,version=version+1,updated_at=now() WHERE id=$1`,
        [m.id],
      );
      await event(client, m.id, 'mission_completed', { status: 'completed', output_saved: true });
    }
  });
}
async function failTask(
  mission: MissionRow,
  claimed: ClaimedTask,
  error: unknown,
  duration: number,
  executionId: string,
  result?: ChatResult,
) {
  const { task, agent, reservation, messages } = claimed;
  const usage = result
    ? accountedUsage(result, messages)
    : { totalTokens: reservation, inputTokens: null, outputTokens: null, estimated: true };
  const retryable = error instanceof AppError && error.retryable && task.attempts <= task.max_retries;
  const message =
    error instanceof AppError
      ? error.message
      : 'The provider call failed unexpectedly. No completion was recorded.';
  let shouldAbort = false;
  await transaction(async (client) => {
    const m = await lockMission(client, mission.id);
    const current = await client.query<TaskRow>('SELECT * FROM tasks WHERE id=$1 FOR UPDATE', [task.id]);
    if (
      !m ||
      current.rows[0]?.attempts !== task.attempts ||
      current.rows[0]?.input_snapshot?.execution_id !== executionId ||
      current.rows[0]?.input_snapshot?.settled
    )
      return;
    await client.query(
      'UPDATE missions SET tokens_used=tokens_used+$2,tokens_reserved=greatest(0,tokens_reserved-$3),version=version+1,updated_at=now() WHERE id=$1',
      [m.id, usage.totalTokens, reservation],
    );
    await client.query(
      `INSERT INTO usage_records(user_id,mission_id,task_id,connection_id,agent_id,purpose,input_tokens,output_tokens,total_tokens,estimated,duration_ms,response_model,provider_request_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        m.user_id,
        m.id,
        task.id,
        agent.connection_id,
        agent.id,
        result ? 'mission' : 'failed_attempt_estimate',
        usage.inputTokens,
        usage.outputTokens,
        usage.totalTokens,
        usage.estimated,
        duration,
        result?.model || null,
        result?.requestId || null,
      ],
    );
    await client.query(
      `UPDATE tasks SET input_snapshot=jsonb_set(input_snapshot,'{settled}','true'),last_error=$2,output=coalesce($3,output),response_model=$4 WHERE id=$1`,
      [task.id, message.slice(0, 500), result?.content || null, result?.model || null],
    );
    if (m.status !== 'running' || m.worker_id !== executionId) {
      await event(client, m.id, 'call_aborted', { task_id: task.id, estimated: usage.estimated });
      return;
    }
    if (retryable) {
      await client.query(
        `UPDATE tasks SET status='pending',next_attempt_at=now()+($2 || ' seconds')::interval WHERE id=$1`,
        [task.id, Math.min(8, 2 ** task.attempts)],
      );
      await event(client, m.id, 'task_retry', {
        task_id: task.id,
        agent_id: agent.id,
        attempt: task.attempts,
        error: message.slice(0, 500),
      });
    } else {
      await client.query(`UPDATE tasks SET status='failed',completed_at=now() WHERE id=$1`, [task.id]);
      await event(client, m.id, 'task_failed', {
        task_id: task.id,
        agent_id: agent.id,
        error: message.slice(0, 500),
      });
      await failMission(client, m.id, message);
      shouldAbort = true;
    }
  });
  if (shouldAbort) active.get(mission.id)?.abort();
}
async function runTask(
  mission: MissionRow,
  claimed: ClaimedTask,
  signal: AbortSignal,
  transport: Transport,
  executionId: string,
) {
  const start = Date.now();
  let result: ChatResult | undefined;
  try {
    const config = await providerConfig(mission.user_id, claimed.agent.connection_id!);
    const current = await one<{ enabled: boolean }>(
      'SELECT enabled FROM provider_connections WHERE id=$1 AND user_id=$2',
      [config.id, mission.user_id],
    );
    if (!current?.enabled)
      throw new AppError(422, 'The assigned provider connection is disabled or disconnected.');
    result = await chat(
      config,
      claimed.messages,
      {
        model: claimed.agent.model!,
        maxTokens: claimed.agent.max_output_tokens,
        temperature: Number(claimed.agent.temperature),
        signal,
        timeoutMs: mission.timeout_ms,
      },
      transport,
    );
    await completeTask(mission, claimed, result, Date.now() - start, executionId);
  } catch (error) {
    await failTask(mission, claimed, error, Date.now() - start, executionId, result);
  }
}
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
export async function executeMission(initial: MissionRow, transport: Transport = defaultTransport) {
  const executionId = initial.worker_id;
  if (!executionId) throw new Error('A mission must be claimed before execution.');
  const controller = new AbortController();
  active.set(initial.id, controller);
  let mission = initial;
  const heartbeat = setInterval(async () => {
    try {
      const rows = await query(
        "UPDATE missions SET lease_until=now()+interval '45 seconds' WHERE id=$1 AND worker_id=$2 AND status='running' RETURNING id",
        [mission.id, executionId],
      );
      if (!rows.length) controller.abort();
    } catch {
      controller.abort();
    }
  }, 5000);
  const running = new Set<Promise<void>>();
  try {
    while (!controller.signal.aborted) {
      const current = await one<MissionRow>('SELECT * FROM missions WHERE id=$1', [mission.id]);
      if (!current || current.status !== 'running' || current.worker_id !== executionId) break;
      mission = current;
      while (running.size < 3 && !controller.signal.aborted) {
        const claimed = await claimTask(mission, executionId);
        if (!claimed) break;
        const promise = runTask(mission, claimed, controller.signal, transport, executionId).finally(() =>
          running.delete(promise),
        );
        running.add(promise);
      }
      if (running.size) await Promise.race(running);
      else {
        const state = await one<{ status: string }>('SELECT status FROM missions WHERE id=$1', [mission.id]);
        if (state?.status !== 'running') break;
        const delayed = await one(
          `SELECT 1 FROM tasks WHERE mission_id=$1 AND status='pending' AND next_attempt_at>now()`,
          [mission.id],
        );
        if (delayed) await wait(1000, controller.signal);
        else {
          await transaction(async (client) => {
            const m = await lockMission(client, mission.id);
            if (m?.status === 'running')
              await failMission(
                client,
                m.id,
                'No runnable task remains. The mission was not marked complete.',
              );
          });
          break;
        }
      }
    }
  } catch {
    controller.abort();
    await transaction(async (client) => {
      const owned = await lockMission(client, initial.id);
      if (!owned || owned.status !== 'running' || owned.worker_id !== executionId) return;
      await settleOutstanding(client, initial.id);
      await failMission(
        client,
        initial.id,
        'The worker encountered an unexpected error. Completed outputs are preserved.',
      );
    }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    controller.abort();
    await Promise.allSettled(running);
    if (active.get(initial.id) === controller) active.delete(initial.id);
    await query(
      "UPDATE missions SET worker_id=NULL,lease_until=NULL WHERE id=$1 AND worker_id=$2 AND status='running'",
      [initial.id, executionId],
    ).catch(() => {});
  }
}
export async function runNextMission(transport: Transport = defaultTransport) {
  const mission = await claimMission();
  if (!mission) return false;
  await executeMission(mission, transport);
  return true;
}
const globalRunner = globalThis as unknown as {
  nexusTimer?: ReturnType<typeof setInterval>;
  nexusTicking?: boolean;
};
export async function runnerTick() {
  if (globalRunner.nexusTicking || active.size >= 2) return;
  globalRunner.nexusTicking = true;
  try {
    await recoverExpired();
    const mission = await claimMission();
    if (mission)
      void executeMission(mission)
        .catch(() => console.error('[runner] Mission execution interrupted; lease recovery is enabled.'))
        .finally(() => wakeRunner());
  } finally {
    globalRunner.nexusTicking = false;
  }
}
export function wakeRunner() {
  void runnerTick().catch(() => console.error('[runner] Database unavailable; retrying on the next tick.'));
}
export function startRunner() {
  if (globalRunner.nexusTimer) return;
  globalRunner.nexusTimer = setInterval(wakeRunner, 1500);
  globalRunner.nexusTimer.unref();
  wakeRunner();
}
export function stopRunner() {
  if (globalRunner.nexusTimer) clearInterval(globalRunner.nexusTimer);
  globalRunner.nexusTimer = undefined;
  for (const controller of active.values()) controller.abort();
}
