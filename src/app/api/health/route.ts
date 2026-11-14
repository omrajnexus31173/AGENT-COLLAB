import { query } from '@/lib/server/db';
import { json } from '@/lib/server/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await query('SELECT 1');
    return json({ status: 'ok', service: 'nexus-arcade' });
  } catch {
    return json({ status: 'unavailable', service: 'nexus-arcade' }, 503);
  }
}
