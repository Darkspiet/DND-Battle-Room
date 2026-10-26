import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { dmProfilePatchSchema } from "../../../../../lib/domain/contracts";
import { getDMBySessionToken, revokeDMSession, updateDMProfile } from "../../../../../lib/server/auth";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../lib/server/requestAuth";
import { DM_SESSION_COOKIE } from "../../../../../lib/server/session";

export async function GET() {
  try {
    const token = (await cookies()).get(DM_SESSION_COOKIE)?.value;
    return NextResponse.json({ user: await getDMBySessionToken(token) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const store = await cookies();
    await revokeDMSession(store.get(DM_SESSION_COOKIE)?.value);
    store.delete(DM_SESSION_COOKIE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }

}

export async function PATCH(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const patch = dmProfilePatchSchema.parse(await request.json());
    return NextResponse.json({ user: await updateDMProfile(user.id, patch) });
  } catch (error) {
    return apiError(error);
  }
}
