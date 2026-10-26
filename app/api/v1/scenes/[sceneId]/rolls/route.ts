import { NextRequest, NextResponse } from "next/server";
import { getSceneActor, listDiceRolls } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { currentDM, currentPlayer } from "../../../../../../lib/server/requestAuth";

export async function GET(request: NextRequest, context: { params: Promise<{ sceneId: string }> }) {
  try {
    const sceneId = (await context.params).sceneId;
    const [dm, player] = await Promise.all([currentDM(), currentPlayer()]);
    const actor = await getSceneActor({ sceneId, dm, player });
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
    return NextResponse.json({ rolls: await listDiceRolls(actor, sceneId, limit) });
  } catch (error) {
    return apiError(error);
  }
}
