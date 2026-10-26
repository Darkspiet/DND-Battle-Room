import { NextRequest, NextResponse } from "next/server";
import { libraryItemCreateSchema } from "../../../../lib/domain/contracts";
import { createLibraryItem, listLibraryItems } from "../../../../lib/server/library";
import { apiError } from "../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../lib/server/requestAuth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireDM();
    return NextResponse.json({ items: await listLibraryItems(user.id, request.nextUrl.searchParams.get("kind")) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const input = libraryItemCreateSchema.parse(await request.json());
    return NextResponse.json({ item: await createLibraryItem(user.id, input) }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
