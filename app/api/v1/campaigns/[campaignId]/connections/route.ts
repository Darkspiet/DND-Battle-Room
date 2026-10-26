import { NextRequest, NextResponse } from "next/server";
import { connectionCreateSchema } from "../../../../../../lib/domain/contracts";
import { createWorldConnection } from "../../../../../../lib/server/campaigns";
import { apiError } from "../../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../../lib/server/requestAuth";

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = connectionCreateSchema.parse(await request.json());
    return NextResponse.json({ connection: await createWorldConnection(user.id, (await context.params).campaignId, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
