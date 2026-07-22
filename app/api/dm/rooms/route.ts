import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getLocalDMBySession, loadServerDMRooms, saveServerDMRoom } from "../../../../lib/dmServerStore";
import type { DMRoomSummary } from "../../../../lib/types";

const SESSION_COOKIE = "dnd-dm-session";

export async function GET() {
  const user = await getLocalDMBySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in as DM first." }, { status: 401 });
  return NextResponse.json({ rooms: await loadServerDMRooms(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getLocalDMBySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in as DM first." }, { status: 401 });
  const room = (await request.json()) as DMRoomSummary;
  if (room.dmUserId !== user.id) {
    return NextResponse.json({ error: "Room owner does not match the signed-in DM." }, { status: 403 });
  }
  return NextResponse.json({ room: await saveServerDMRoom(room) });
}
