import { revokeSession } from '@/lib/server/auth';
import { assertOrigin, json, route } from '@/lib/server/http';
export const POST = route(async (request) => {
  assertOrigin(request);
  const response = json({ ok: true });
  await revokeSession(request, response);
  return response;
});
