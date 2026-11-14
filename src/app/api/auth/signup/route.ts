import { signupSchema } from '@/lib/contracts';
import { signup, sessionResponse } from '@/lib/server/auth';
import { audit } from '@/lib/server/db';
import { assertOrigin, body, clientAddress, rateLimit, route } from '@/lib/server/http';
export const runtime = 'nodejs';
export const POST = route(async (request) => {
  assertOrigin(request);
  await rateLimit(`signup:${clientAddress(request)}`, 30, 3600);
  const input = await body(request, signupSchema);
  const user = await signup(input.name, input.email, input.password);
  await audit(user.id, 'auth.signup');
  return sessionResponse(user.id, request, { user }, 201);
});
