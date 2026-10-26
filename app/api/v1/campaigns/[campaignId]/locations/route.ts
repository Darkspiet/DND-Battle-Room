import { NextRequest, NextResponse } from "next/server";
import { locationCreateSchema } from "../../../../../../lib/domain/contracts";
import { createWorldLocation } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = locationCreateSchema.parse(await request.json());
    return NextResponse.json(await createWorldLocation(user.id, (await context.params).campaignId, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
