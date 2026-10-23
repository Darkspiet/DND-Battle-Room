import { cookies } from 'next/headers';
import { createAccount, cookieOptions } from '../../../../lib/backend.mjs';
import { respond, readJSON, guard } from '../../../../lib/http';
export async function POST(request: Request) {
  return respond(async () => {
    guard(request, 'signup', 5, 15 * 60000);
    const result = await createAccount(await readJSON(request));
    (await cookies()).set('dnd-dm-session', result.sessionToken, cookieOptions());
    return { user: result.user };
  });
}
