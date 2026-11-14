import { idSchema } from '@/lib/contracts';
import { authorize, SESSION_COOKIE } from '@/lib/server/auth';
import { digest } from '@/lib/server/crypto';
import { query, audit } from '@/lib/server/db';
import { AppError } from '@/lib/server/errors';
import { body, json, route } from '@/lib/server/http';
import { z } from 'zod';
export const DELETE = route(async (request, context) => {
  const { user } = await authorize(request, true);
  const { id } = await context.params;
  idSchema.parse(id);
  await body(request, z.object({}).strict());
  const current = await query<{ id: string }>('SELECT id FROM sessions WHERE user_id=$1 AND token_hash=$2', [
    user.id,
    digest(request.cookies.get(SESSION_COOKIE)?.value || ''),
  ]);
  if (current[0]?.id === id) throw new AppError(409, 'Use Sign out to end your current session.');
  const rows = await query('DELETE FROM sessions WHERE id=$1 AND user_id=$2 RETURNING id', [id, user.id]);
  if (!rows.length) throw new AppError(404, 'Session not found.');
  await audit(user.id, 'auth.session_revoked', id);
  return json({ revoked: true });
});
