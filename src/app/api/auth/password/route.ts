import { passwordChangeSchema } from '@/lib/contracts';
import { sessionResponse, authorize } from '@/lib/server/auth';
import { hashPassword, verifyPassword } from '@/lib/server/crypto';
import { one, transaction, audit } from '@/lib/server/db';
import { AppError } from '@/lib/server/errors';
import { body, rateLimit, route } from '@/lib/server/http';
export const POST = route(async (request) => {
  const { user } = await authorize(request, true);
  await rateLimit(`password:${user.id}`, 5, 900);
  const input = await body(request, passwordChangeSchema);
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [user.id]);
  if (!row || !(await verifyPassword(input.current_password, row.password_hash)))
    throw new AppError(401, 'The current password is incorrect.');
  const hash = await hashPassword(input.new_password);
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [user.id, hash]);
    await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
  });
  await audit(user.id, 'auth.password_changed');
  return sessionResponse(user.id, request, { ok: true });
});
