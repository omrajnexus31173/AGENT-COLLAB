import { profileSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { query, audit } from '@/lib/server/db';
import { body, json, route } from '@/lib/server/http';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  return json({ user });
});
export const PATCH = route(async (request) => {
  const { user } = await authorize(request, true);
  const input = await body(request, profileSchema);
  const rows = await query(
    'UPDATE users SET name=$2,avatar_color=$3,updated_at=now() WHERE id=$1 RETURNING id,name,email,avatar_color,created_at',
    [user.id, input.name, input.avatar_color],
  );
  await audit(user.id, 'profile.updated');
  return json({ user: rows[0] });
});
