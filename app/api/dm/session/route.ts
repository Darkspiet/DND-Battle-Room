import { cookies } from 'next/headers';
import { readActor, signOut } from '../../../../lib/backend.mjs';
import { respond, guard } from '../../../../lib/http';
export async function GET(request: Request) { return respond(async () => { guard(request); return { user: await readActor(request.headers.get('cookie'), true) }; }); }
export async function DELETE(request: Request) { return respond(async () => { guard(request); await signOut(request.headers.get('cookie')); (await cookies()).delete('dnd-dm-session'); return { ok: true }; }); }
