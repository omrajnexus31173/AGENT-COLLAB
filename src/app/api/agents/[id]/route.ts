import { agentSchema, idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { query, audit } from '@/lib/server/db';
import { getAgent, getProvider } from '@/lib/server/repository';
import { body, json, route, notFound } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
export const GET = route(async (request, context) => {
  const { user } = await authorize(request);
  const { id } = await context.params;
  return json({ agent: await getAgent(user.id, idSchema.parse(id)) });
});
export const PUT = route(async (request, context) => {
  const { user } = await authorize(request, true);
  const { id } = await context.params;
  idSchema.parse(id);
  const input = await body(request, agentSchema);
  if (input.connection_id) await getProvider(user.id, input.connection_id);
  if (input.connection_id && !input.model) throw new AppError(422, 'Choose a model for this agent.');
  const rows = await query(
    'UPDATE agents SET name=$3,role=$4,color=$5,avatar=$6,system_prompt=$7,connection_id=$8,model=$9,temperature=$10,max_output_tokens=$11,enabled=$12,configuration=$13,updated_at=now() WHERE id=$1::uuid AND user_id=$2::uuid RETURNING id',
    [
      id,
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
  if (!rows.length) throw notFound();
  await audit(user.id, 'agent.updated', id);
  return json({ id });
});
export const DELETE = route(async (request, context) => {
  const { user } = await authorize(request, true);
  const { id } = await context.params;
  const rows = await query('DELETE FROM agents WHERE id=$1 AND user_id=$2 RETURNING id', [
    idSchema.parse(id),
    user.id,
  ]);
  if (!rows.length) throw notFound();
  await audit(user.id, 'agent.deleted', id);
  return json({ deleted: true });
});
