import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { playerJoinSchema } from "../../../../../lib/domain/contracts";
import { getPlayerCampaignView, joinCampaign } from "../../../../../lib/server/campaigns";
import { apiError, HttpError } from "../../../../../lib/server/http";
import { assertTrustedMutation, currentPlayer } from "../../../../../lib/server/requestAuth";
import { PLAYER_SESSION_COOKIE, PLAYER_SESSION_MAX_AGE_SECONDS, sessionCookieOptions } from "../../../../../lib/server/session";

async function code(context: { params: Promise<{ code: string }> }) {
  return (await context.params).code.toUpperCase();
}

export async function GET(_request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    const player = await currentPlayer();
    if (!player) throw new HttpError(401, "PLAYER_SESSION_REQUIRED", "Enter your player name to join this campaign.");
    return NextResponse.json(await getPlayerCampaignView(player, await code(context)));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    assertTrustedMutation(request);
    const input = playerJoinSchema.parse(await request.json());
    const result = await joinCampaign(await code(context), input);
    (await cookies()).set(PLAYER_SESSION_COOKIE, result.token, sessionCookieOptions(PLAYER_SESSION_MAX_AGE_SECONDS));
    return NextResponse.json({ campaign: result.campaign, player: result.player }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
