import { listRooms, saveRoomMetadata } from '../../../../lib/backend.mjs';
import { respond, guard, readJSON } from '../../../../lib/http';
export async function GET(request: Request) { return respond(async () => { guard(request); return { rooms: await listRooms(request.headers.get('cookie')) }; }); }
export async function POST(request: Request) { return respond(async () => { guard(request); return { room: await saveRoomMetadata(request.headers.get('cookie'), await readJSON(request)) }; }); }
