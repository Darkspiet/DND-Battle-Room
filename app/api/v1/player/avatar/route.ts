import { NextRequest, NextResponse } from "next/server";
import { storePlayerAvatar } from "../../../../../lib/server/assets";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requirePlayer } from "../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const player = await requirePlayer();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a portrait to upload.");
    const asset = await storePlayerAvatar(player, file);
    return NextResponse.json({ asset, url: `/api/v1/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return apiError(error, "Could not upload that portrait.");
  }
}
