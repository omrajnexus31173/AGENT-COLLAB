import { agentSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { query, audit } from '@/lib/server/db';
import { listAgents, getProvider } from '@/lib/server/repository';
import { body, json, route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  return json({ agents: await listAgents(user.id) });
});
export const POST = route(async (request) => {
  const { user } = await authorize(request, true);
  const input = await body(request, agentSchema);
  if (input.connection_id) await getProvider(user.id, input.connection_id);
  if (input.connection_id && !input.model) throw new AppError(422, 'Choose a model for this agent.');
  const rows = await query<{ id: string }>(
    'INSERT INTO agents(user_id,name,role,color,avatar,system_prompt,connection_id,model,temperature,max_output_tokens,enabled,configuration) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
    [
      user.id,
      input.name,
      input.role,
      input.color,
      input.avatar,
      input.system_prompt,
      input.connection_id,
      input.model,
      input.temperature,
      input.max_output_tokens,
      input.enabled,
      JSON.stringify(input.configuration),
    ],
  );
  await audit(user.id, 'agent.created', rows[0].id);
  return json({ id: rows[0].id }, 201);
});
