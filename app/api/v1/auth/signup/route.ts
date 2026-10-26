import { dmInviteRequired } from "../../../../../lib/server/signupPolicy";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { signUpSchema } from "../../../../../lib/domain/contracts";
import { signUpDM } from "../../../../../lib/server/auth";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation } from "../../../../../lib/server/requestAuth";
import { DM_SESSION_COOKIE, DM_SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "../../../../../lib/server/session";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ inviteRequired: dmInviteRequired() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const input = signUpSchema.parse(await request.json());
    const result = await signUpDM(input);
    (await cookies()).set(DM_SESSION_COOKIE, result.token, sessionCookieOptions(DM_SESSION_MAX_AGE_SECONDS));
    return NextResponse.json({ user: result.user });
  } catch (error) {
    return apiError(error, "Could not create the DM account.");
  }
}
