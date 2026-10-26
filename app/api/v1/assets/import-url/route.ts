import { NextRequest, NextResponse } from "next/server";
import { assetUrlImportSchema } from "../../../../../lib/domain/contracts";
import { importRemoteAsset } from "../../../../../lib/server/assets";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = assetUrlImportSchema.parse(await request.json());
    const asset = await importRemoteAsset(user, input);
    return NextResponse.json({ asset, url: `/api/v1/assets/${asset.id}` }, { status: 201 });
  } catch (error) {
    return apiError(error, "Could not import that image.");
  }
}
