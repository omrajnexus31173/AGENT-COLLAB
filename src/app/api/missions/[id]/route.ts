import { idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { missionDetail } from '@/lib/server/repository';
import { json, route } from '@/lib/server/http';
export const GET = route(async (request, context) => {
  const { user } = await authorize(request);
  const { id } = await context.params;
  return json(await missionDetail(user.id, idSchema.parse(id)));
});
