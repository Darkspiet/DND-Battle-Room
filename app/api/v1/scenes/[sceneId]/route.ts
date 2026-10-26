import { sceneForActor } from "../../../../../lib/domain/privacy";
import { NextRequest, NextResponse } from "next/server";
import { getScene, getSceneActor } from "../../../../../lib/server/campaigns";
import { apiError } from "../../../../../lib/server/http";
import { currentDM, currentPlayer } from "../../../../../lib/server/requestAuth";

export async function GET(_request: NextRequest, context: { params: Promise<{ sceneId: string }> }) {
  try {
    const sceneId = (await context.params).sceneId;
    const [dm, player] = await Promise.all([currentDM(), currentPlayer()]);
    const actor = await getSceneActor({ sceneId, dm, player });
    const scene = await getScene(sceneId);
    return NextResponse.json({ scene: scene ? sceneForActor(scene, actor) : null });
  } catch (error) {
    return apiError(error);
  }
}
