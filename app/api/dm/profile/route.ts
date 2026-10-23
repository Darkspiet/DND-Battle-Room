import { updateProfile } from '../../../../lib/backend.mjs';
import { respond, guard, readJSON } from '../../../../lib/http';
export async function PUT(request: Request) { return respond(async () => { guard(request); return { user: await updateProfile(request.headers.get('cookie'), await readJSON(request)) }; }); }
