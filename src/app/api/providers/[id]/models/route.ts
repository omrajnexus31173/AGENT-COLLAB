import { idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { discoverProviderModels } from '@/lib/server/provider-service';
import { json, rateLimit, route } from '@/lib/server/http';
export const GET = route(async (request, context) => {
  const { user } = await authorize(request);
  await rateLimit(`provider-models:${user.id}`, 30, 60);
  const { id } = await context.params;
  return json(await discoverProviderModels(user.id, idSchema.parse(id)));
});
