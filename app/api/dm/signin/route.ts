import { cookies } from 'next/headers';
import { signIn, cookieOptions } from '../../../../lib/backend.mjs';
import { respond, readJSON, guard } from '../../../../lib/http';
export async function POST(request: Request) {
  return respond(async () => {
    guard(request, 'signin', 20, 15 * 60000);
    const result = await signIn(await readJSON(request));
    (await cookies()).set('dnd-dm-session', result.sessionToken, cookieOptions());
    return { user: result.user };
  });
}
