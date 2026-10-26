import { NextRequest, NextResponse } from "next/server";
import { locationPatchSchema } from "../../../../../../../lib/domain/contracts";
import { updateWorldLocation } from "../../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../../lib/server/requestAuth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string; locationId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const { campaignId, locationId } = await context.params;
    const patch = locationPatchSchema.parse(await request.json());
    return NextResponse.json({ location: await updateWorldLocation(user.id, campaignId, locationId, patch) });
  } catch (error) {
    return apiError(error);
  }
}
