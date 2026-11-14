import { authorize } from '@/lib/server/auth';
import { dashboard } from '@/lib/server/repository';
import { json, route } from '@/lib/server/http';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  return json(await dashboard(user.id));
});
