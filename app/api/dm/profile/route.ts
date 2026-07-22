import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { updateLocalDMProfile } from "../../../../lib/dmServerStore";

const SESSION_COOKIE = "dnd-dm-session";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const user = await updateLocalDMProfile((await cookies()).get(SESSION_COOKIE)?.value, {
      name: body.name ? String(body.name) : undefined,
      color: body.color ? String(body.color) : undefined,
      avatarUrl: body.avatarUrl ? String(body.avatarUrl) : undefined,
      avatarName: body.avatarName ? String(body.avatarName) : undefined
    });
    return NextResponse.json({ user });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not update the DM profile." },
      { status: 400 }
    );
  }
}
