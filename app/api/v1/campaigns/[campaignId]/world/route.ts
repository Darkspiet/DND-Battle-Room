import { NextRequest, NextResponse } from "next/server";
import { worldMapPatchSchema } from "../../../../../../lib/domain/contracts";
import { updateWorldMap } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../lib/server/requestAuth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const { campaignId } = await context.params;
    const patch = worldMapPatchSchema.parse(await request.json());
    return NextResponse.json({ worldMap: await updateWorldMap(user.id, campaignId, patch) });
  } catch (error) {
    return apiError(error, "Could not update the world map.");
  }
}
