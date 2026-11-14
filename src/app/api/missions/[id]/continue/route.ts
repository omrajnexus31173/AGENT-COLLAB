import { continueSchema, idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { getMission } from '@/lib/server/repository';
import { createMission } from '@/lib/server/mission-service';
import { wakeRunner } from '@/lib/server/runner';
import { body, json, rateLimit, route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
export const POST = route(async (request, context) => {
  const { user } = await authorize(request, true);
  await rateLimit(`mission-create:${user.id}`, 15, 60);
  const { id } = await context.params;
  idSchema.parse(id);
  const previous = await getMission(user.id, id);
  if (previous.status !== 'completed')
    throw new AppError(409, 'Complete the original mission before continuing it.');
  const input = await body(request, continueSchema);
  const ids = input.agent_ids || previous.agent_snapshot.map((a) => a.id);
  const mission = await createMission(
    user.id,
    {
      title: `${previous.title.slice(0, 125)} · continued`,
      brief: input.instruction,
      mode: 'guided',
      agent_ids: ids,
      synthesis_agent_id: ids.includes(previous.synthesis_agent_id) ? previous.synthesis_agent_id : ids[0],
      token_budget: previous.token_budget,
      max_steps: Math.min(32, Math.max(previous.max_steps, ids.length * 2 + 2)),
      max_retries: 2,
      timeout_ms: 90000,
    },
    id,
  );
  wakeRunner();
  return json({ mission }, 201);
});
