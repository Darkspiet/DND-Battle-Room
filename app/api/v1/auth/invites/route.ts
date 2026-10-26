import { NextRequest, NextResponse } from "next/server";
import { createDMInvite } from "../../../../../lib/server/auth";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    return NextResponse.json(await createDMInvite(user.id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error, "Could not create a DM invitation.");
  }
}
