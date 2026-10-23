import { roomCommand } from '../../../../../lib/backend.mjs';
import { guard, respond, readJSON } from '../../../../../lib/http';
export async function POST(request: Request, context: { params: Promise<{ roomCode: string }> }) { return respond(async () => { guard(request, 'room-command', 600); return { room: await roomCommand(request.headers.get('cookie'), (await context.params).roomCode, await readJSON(request)) }; }); }
