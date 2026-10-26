import { NextRequest, NextResponse } from "next/server";
import { passwordResetSchema } from "../../../../../lib/domain/contracts";
import { resetDMPassword } from "../../../../../lib/server/auth";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation } from "../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const input = passwordResetSchema.parse(await request.json());
    return NextResponse.json(await resetDMPassword(input.resetCode, input.password));
  } catch (error) {
    return apiError(error, "Could not reset that password.");
  }
}
