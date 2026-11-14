import { providerSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { listProviders } from '@/lib/server/repository';
import { saveProvider } from '@/lib/server/provider-service';
import { body, json, rateLimit, route } from '@/lib/server/http';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  return json({ connections: await listProviders(user.id) });
});
export const POST = route(async (request) => {
  const { user } = await authorize(request, true);
  await rateLimit(`provider-save:${user.id}`, 30, 3600);
  const input = await body(request, providerSchema);
  return json({ connection: await saveProvider(user.id, input) }, 201);
});
