import { NextRequest, NextResponse } from "next/server";
import { campaignPatchSchema } from "../../../../../lib/domain/contracts";
import { getCampaignWorkspace, updateCampaign } from "../../../../../lib/server/campaigns";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../lib/server/requestAuth";

async function id(context: { params: Promise<{ campaignId: string }> }) {
  return (await context.params).campaignId;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const user = await requireDM();
    return NextResponse.json(await getCampaignWorkspace(user.id, await id(context)));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const patch = campaignPatchSchema.parse(await request.json());
    return NextResponse.json({ campaign: await updateCampaign(user.id, await id(context), patch) });
  } catch (error) {
    return apiError(error);
  }
}
