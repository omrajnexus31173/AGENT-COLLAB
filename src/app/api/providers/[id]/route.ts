import { idSchema, providerSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { getProvider } from '@/lib/server/repository';
import { saveProvider, disconnectProvider } from '@/lib/server/provider-service';
import { body, json, route } from '@/lib/server/http';
export const GET = route(async (request, context) => {
  const { user } = await authorize(request);
  const { id } = await context.params;
  return json({ connection: await getProvider(user.id, idSchema.parse(id)) });
});
export const PUT = route(async (request, context) => {
  const { user } = await authorize(request, true);
  const { id } = await context.params;
  const input = await body(request, providerSchema);
  return json({ connection: await saveProvider(user.id, input, idSchema.parse(id)) });
});
export const DELETE = route(async (request, context) => {
  const { user } = await authorize(request, true);
  const { id } = await context.params;
  return json(await disconnectProvider(user.id, idSchema.parse(id)));
});
