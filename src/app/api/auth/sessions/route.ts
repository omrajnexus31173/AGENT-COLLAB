import { authorize, SESSION_COOKIE } from '@/lib/server/auth';
import { digest } from '@/lib/server/crypto';
import { query } from '@/lib/server/db';
import { json, route } from '@/lib/server/http';
interface Row {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  token_hash: string;
}
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  const current = digest(request.cookies.get(SESSION_COOKIE)?.value || '');
  const rows = await query<Row>(
    'SELECT id,created_at,expires_at,last_seen_at,token_hash FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC',
    [user.id],
  );
  return json({
    sessions: rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      expires_at: row.expires_at,
      last_seen_at: row.last_seen_at,
      current: row.token_hash === current,
    })),
  });
});
