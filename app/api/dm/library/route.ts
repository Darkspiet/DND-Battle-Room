import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getLocalDMBySession, loadServerLibraryItems, saveServerLibraryItem } from "../../../../lib/dmServerStore";
import type { LibraryItem } from "../../../../lib/types";

const SESSION_COOKIE = "dnd-dm-session";

export async function GET() {
  return NextResponse.json({ library: await loadServerLibraryItems() });
}

export async function POST(request: NextRequest) {
  const user = await getLocalDMBySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in as DM first." }, { status: 401 });
  const item = (await request.json()) as LibraryItem;
  return NextResponse.json({ item: await saveServerLibraryItem({ ...item, createdBy: item.createdBy ?? user.id }) });
}
