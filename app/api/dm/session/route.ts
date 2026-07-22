import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearLocalDMSession, getLocalDMBySession } from "../../../../lib/dmServerStore";

const SESSION_COOKIE = "dnd-dm-session";

export async function GET() {
  const sessionToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await getLocalDMBySession(sessionToken);
  return NextResponse.json({ user });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  await clearLocalDMSession(sessionToken);
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
