import { idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { verifyProvider } from '@/lib/server/provider-service';
import { json, rateLimit, route } from '@/lib/server/http';
export const maxDuration = 60;
export const POST = route(async (request, context) => {
  const { user } = await authorize(request, true);
  await rateLimit(`provider-test:${user.id}`, 15, 60);
  const { id } = await context.params;
  return json(await verifyProvider(user.id, idSchema.parse(id)));
});
