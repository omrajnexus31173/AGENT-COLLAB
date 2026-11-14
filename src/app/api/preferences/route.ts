import { preferencesSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { query, one } from '@/lib/server/db';
import { body, json, route } from '@/lib/server/http';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  const preferences = await one(
    'INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING default_mode,token_budget,reduced_motion,email_notifications',
    [user.id],
  );
  return json({ preferences });
});
export const PUT = route(async (request) => {
  const { user } = await authorize(request, true);
  const input = await body(request, preferencesSchema);
  await query(
    `INSERT INTO user_preferences(user_id,default_mode,token_budget,reduced_motion,email_notifications) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(user_id) DO UPDATE SET default_mode=$2,token_budget=$3,reduced_motion=$4,email_notifications=$5,updated_at=now()`,
    [user.id, input.default_mode, input.token_budget, input.reduced_motion, input.email_notifications],
  );
  return json({ preferences: input });
});
