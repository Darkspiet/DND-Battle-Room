import { roomStatus } from '../../../../../lib/backend.mjs';
import { guard, respond } from '../../../../../lib/http';
export async function GET(request: Request, context: { params: Promise<{ roomCode: string }> }) { return respond(async () => { guard(request, 'room-status', 60); return roomStatus((await context.params).roomCode); }); }
