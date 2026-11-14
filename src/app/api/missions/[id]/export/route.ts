import { idSchema } from '@/lib/contracts';
import { authorize } from '@/lib/server/auth';
import { missionDetail } from '@/lib/server/repository';
import { audit } from '@/lib/server/db';
import { route, rateLimit } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { MODE_LABELS } from '@/lib/types';
export const GET = route(async (request, context) => {
  const { user } = await authorize(request);
  await rateLimit(`export:${user.id}`, 30, 60);
  const { id } = await context.params;
  idSchema.parse(id);
  const format = request.nextUrl.searchParams.get('format') || 'json';
  if (!['json', 'md'].includes(format)) throw new AppError(422, 'Choose JSON or Markdown export.');
  const detail = await missionDetail(user.id, id);
  await audit(user.id, 'mission.exported', id, { format });
  const m = detail.mission;
  let content: string;
  if (format === 'json')
    content = JSON.stringify(
      { exported_at: new Date().toISOString(), product: 'Nexus Arcade', ...detail },
      null,
      2,
    );
  else
    content = `# ${m.title}\n\nMode: ${MODE_LABELS[m.mode]}\nStatus: ${m.status}\nBudget used: ${m.tokens_used} / ${m.token_budget} (includes labeled estimates)\n\n## Mission\n${m.brief}\n\n## Final output\n${detail.output?.content || 'No final output was produced.'}\n\n## Agent transcript\n${detail.messages.map((msg) => `### ${m.agent_snapshot.find((a) => a.id === msg.from_agent_id)?.name || (msg.role === 'user' ? 'You' : 'Orchestrator')} · ${msg.kind}\n${msg.content}`).join('\n\n')}\n\n## Usage\n${detail.usage.map((u) => `- ${u.purpose}: ${u.total_tokens} tokens${u.estimated ? ' (estimated)' : ''}; ${u.duration_ms} ms`).join('\n')}`;
  return new Response(content, {
    headers: {
      'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="nexus-${id}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
});
