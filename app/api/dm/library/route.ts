import { listLibrary, saveLibrary } from '../../../../lib/backend.mjs';
import { respond, guard, readJSON } from '../../../../lib/http';
export async function GET(request: Request) { return respond(async () => { guard(request); return { library: await listLibrary(request.headers.get('cookie')) }; }); }
export async function POST(request: Request) { return respond(async () => { guard(request); return { item: await saveLibrary(request.headers.get('cookie'), await readJSON(request)) }; }); }
