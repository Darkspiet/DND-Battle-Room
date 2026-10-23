import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createLocalDMAccount } from "../../../../lib/dmServerStore";

const SESSION_COOKIE = "dnd-dm-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await createLocalDMAccount({
      username: String(body.username ?? ""),
      password: String(body.password ?? ""),
      name: String(body.name ?? ""),
      color: String(body.color ?? "#b7394b"),
      avatarUrl: body.avatarUrl ? String(body.avatarUrl) : undefined,
      avatarName: body.avatarName ? String(body.avatarName) : undefined
    });
    (await cookies()).set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.APP_URL?.startsWith("https://") ?? false,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/"
    });
    return NextResponse.json({ user: result.user });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not create the DM profile." },
      { status: 400 }
    );
  }
}
