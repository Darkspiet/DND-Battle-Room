import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { storeAsset } from "../../../../lib/server/assets";
import { apiError } from "../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../lib/server/requestAuth";

const kindSchema = z.enum(["avatar", "map", "token", "audio", "world"]);

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    const kind = kindSchema.parse(form.get("kind"));
    const campaignId = form.get("campaignId");
    const asset = await storeAsset(user, { file, kind, campaignId: typeof campaignId === "string" && campaignId ? campaignId : null });
    return NextResponse.json({ asset, url: `/api/v1/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return apiError(error, "Could not upload that file.");
  }
}
