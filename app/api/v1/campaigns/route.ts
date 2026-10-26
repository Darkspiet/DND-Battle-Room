import { NextRequest, NextResponse } from "next/server";
import { campaignCreateSchema } from "../../../../lib/domain/contracts";
import { createCampaign, listCampaigns } from "../../../../lib/server/campaigns";
import { apiError } from "../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../lib/server/requestAuth";

export async function GET() {
  try {
    const user = await requireDM();
    return NextResponse.json({ campaigns: await listCampaigns(user.id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = campaignCreateSchema.parse(await request.json());
    return NextResponse.json(await createCampaign(user, input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
