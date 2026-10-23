import { cookies } from 'next/headers';
import { readRoom, joinRoom, cookieOptions } from '../../../../lib/backend.mjs';
import { respond, guard, readJSON } from '../../../../lib/http';
type Context = { params: Promise<{ roomCode: string }> };
export async function GET(request: Request, context: Context) { return respond(async () => { guard(request); const { roomCode } = await context.params; return readRoom(request.headers.get('cookie'), roomCode); }); }
export async function POST(request: Request, context: Context) {
  return respond(async () => { guard(request, 'join', 60, 15*60000); const { roomCode } = await context.params;
    const result = await joinRoom(request.headers.get('cookie'), roomCode, await readJSON(request));
    if (result.sessionToken) (await cookies()).set('dnd-guest-session', result.sessionToken, cookieOptions());
    return { room: result.room, profile: result.profile };
  });
}
// Full-state PUT replacement is deliberately unsupported. Use authorized commands.
