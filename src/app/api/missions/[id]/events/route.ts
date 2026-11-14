import { idSchema } from '@/lib/contracts';
import { authorize, sessionInfo } from '@/lib/server/auth';
import { getMission } from '@/lib/server/repository';
import { query } from '@/lib/server/db';
import { json, rateLimit } from '@/lib/server/http';
import { safeError } from '@/lib/server/errors';
import type { MissionEvent } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // Cookie parsing is shared with the rest of the API through NextRequest.
    const { NextRequest } = await import('next/server');
    const nextRequest = new NextRequest(request.url, { headers: request.headers });
    const { user } = await authorize(nextRequest);
    const { id } = await context.params;
    idSchema.parse(id);
    await getMission(user.id, id);
    await rateLimit(`sse:${user.id}`, 120, 60);
    const header = request.headers.get('last-event-id');
    const queryCursor = new URL(request.url).searchParams.get('after') || '0';
    let cursor = /^\d{1,18}$/.test(header || queryCursor) ? header || queryCursor : '0';
    const encoder = new TextEncoder();
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastAuth = Date.now();
    let lastBeat = Date.now();
    const cleanup = () => {
      closed = true;
      if (timer) clearTimeout(timer);
      request.signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (text: string) => {
          if (!closed) controller.enqueue(encoder.encode(text));
        };
        send('retry: 3000\n: connected\n\n');
        request.signal.addEventListener('abort', abort, { once: true });
        const poll = async () => {
          if (closed) return;
          try {
            if (Date.now() - lastAuth > 15000) {
              const session = await sessionInfo(nextRequest);
              if (session.user?.id !== user.id) {
                send('event: session_expired\ndata: {"error":"Sign in again."}\n\n');
                cleanup();
                controller.close();
                return;
              }
              lastAuth = Date.now();
            }
            const events = await query<MissionEvent>(
              'SELECT id,mission_id,type,payload,created_at FROM mission_events WHERE mission_id=$1 AND id>$2::bigint ORDER BY id LIMIT 100',
              [id, cursor],
            );
            for (const event of events) {
              if (closed) return;
              cursor = event.id;
              send(`id: ${event.id}\nevent: mission\ndata: ${JSON.stringify(event)}\n\n`);
            }
            if (Date.now() - lastBeat > 15000) {
              send(': heartbeat\n\n');
              lastBeat = Date.now();
            }
            timer = setTimeout(poll, events.length === 100 ? 20 : 750);
          } catch {
            if (!closed) {
              send(
                'event: stream_error\ndata: {"error":"The event stream was interrupted. Reconnect to recover persisted events."}\n\n',
              );
              cleanup();
              try {
                controller.close();
              } catch {
                /* already closed */
              }
            }
          }
        };
        void poll();
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const safe = safeError(error);
    return json({ error: safe.message, code: safe.code }, safe.status);
  }
}
