import { loginSchema } from '@/lib/contracts';
import { login, sessionResponse } from '@/lib/server/auth';
import { audit } from '@/lib/server/db';
import { assertOrigin, body, clientAddress, rateLimit, route } from '@/lib/server/http';
export const runtime = 'nodejs';
export const POST = route(async (request) => {
  assertOrigin(request);
  const input = await body(request, loginSchema);
  await rateLimit(`login-ip:${clientAddress(request)}`, 60, 900);
  await rateLimit(`login-email:${input.email}`, 10, 900);
  const user = await login(input.email, input.password);
  await audit(user.id, 'auth.login');
  return sessionResponse(user.id, request, { user });
});
