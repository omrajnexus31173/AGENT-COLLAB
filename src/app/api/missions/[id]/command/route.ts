import { commandSchema, idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { commandMission } from '@/lib/server/mission-service';
import { notifyMission, wakeRunner } from '@/lib/server/runner';
import { body, json, rateLimit, route } from '@/lib/server/http';
export const POST = route(async (request, context) => {
  const { user } = await authorize(request, true);
  await rateLimit(`mission-command:${user.id}`, 60, 60);
  const { id } = await context.params;
  idSchema.parse(id);
  const command = await body(request, commandSchema);
  const mission = await commandMission(user.id, id, command);
  notifyMission(id, command.action);
  wakeRunner();
  return json({ mission });
});
