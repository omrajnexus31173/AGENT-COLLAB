import { missionSchema } from '@/lib/contracts';
import { MODES } from '@/lib/types';
import { authorize } from '@/lib/server/auth';
import { listMissions } from '@/lib/server/repository';
import { createMission } from '@/lib/server/mission-service';
import { wakeRunner } from '@/lib/server/runner';
import { body, json, rateLimit, route } from '@/lib/server/http';
export const GET = route(async (request) => {
  const { user } = await authorize(request);
  const params = request.nextUrl.searchParams;
  const status = params.get('status') || '';
  if (
    status &&
    ![
      'queued',
      'running',
      'paused',
      'awaiting_approval',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ].includes(status)
  )
    return json({ error: 'Invalid status filter.' }, 422);
  return json({
    missions: await listMissions(
      user.id,
      params.get('q') || '',
      status,
      Number(params.get('limit')) || 50,
      Number(params.get('offset')) || 0,
    ),
  });
});
export const POST = route(async (request) => {
  const { user } = await authorize(request, true);
  await rateLimit(`mission-create:${user.id}`, 15, 60);
  const input = await body(request, missionSchema);
  const mission = await createMission(user.id, input);
  wakeRunner();
  return json({ mission }, 201);
});
void MODES;
