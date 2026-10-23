import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { signInLocalDMAccount } from "../../../../lib/dmServerStore";

const SESSION_COOKIE = "dnd-dm-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await signInLocalDMAccount(String(body.username ?? ""), String(body.password ?? ""));
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
      { error: caught instanceof Error ? caught.message : "Could not sign in as DM." },
      { status: 401 }
    );
  }
}
