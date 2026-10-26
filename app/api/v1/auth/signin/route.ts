import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { signInSchema } from "../../../../../lib/domain/contracts";
import { signInDM } from "../../../../../lib/server/auth";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation } from "../../../../../lib/server/requestAuth";
import { DM_SESSION_COOKIE, DM_SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "../../../../../lib/server/session";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const input = signInSchema.parse(await request.json());
    const result = await signInDM(input.username, input.password);
    (await cookies()).set(DM_SESSION_COOKIE, result.token, sessionCookieOptions(DM_SESSION_MAX_AGE_SECONDS));
    return NextResponse.json({ user: result.user });
  } catch (error) {
    return apiError(error, "Could not sign in.");
  }
}
