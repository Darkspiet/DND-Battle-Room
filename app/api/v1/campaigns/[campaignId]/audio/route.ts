import { NextRequest, NextResponse } from "next/server";
import { audioStateSchema, audioTrackCreateSchema } from "../../../../../../lib/domain/contracts";
import { createAudioTrack, setAudioState } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const campaignId = (await context.params).campaignId;
    const body = await request.json();
    if (body.action === "track") {
      return NextResponse.json({ track: await createAudioTrack(user.id, campaignId, audioTrackCreateSchema.parse(body)) }, { status: 201 });
    }
    return NextResponse.json({ audioState: await setAudioState(user.id, campaignId, audioStateSchema.parse(body)) });
  } catch (error) {
    return apiError(error);
  }
}
