import { NextRequest, NextResponse } from "next/server";
import { libraryItemPatchSchema } from "../../../../../lib/domain/contracts";
import { deleteLibraryItem, updateLibraryItem } from "../../../../../lib/server/library";
import { apiError } from "../../../../../lib/server/http";
import { assertTrustedMutation, requireDM } from "../../../../../lib/server/requestAuth";

async function itemId(context: { params: Promise<{ itemId: string }> }) {
  return (await context.params).itemId;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    const patch = libraryItemPatchSchema.parse(await request.json());
    return NextResponse.json({ item: await updateLibraryItem(user.id, await itemId(context), patch) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ itemId: string }> }) {
  try {
    assertTrustedMutation(request);
    const user = await requireDM();
    return NextResponse.json(await deleteLibraryItem(user.id, await itemId(context)));
  } catch (error) {
    return apiError(error);
  }
}
