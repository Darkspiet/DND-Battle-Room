import { NextRequest, NextResponse } from "next/server";
import { playerDestinationSchema } from "../../../../../../lib/domain/contracts";
import { setPlayerDestinations } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = playerDestinationSchema.parse(await request.json());
    return NextResponse.json({ players: await setPlayerDestinations(user.id, (await context.params).campaignId, input.playerIds, input.destination) });
  } catch (error) {
    return apiError(error);
  }
}
