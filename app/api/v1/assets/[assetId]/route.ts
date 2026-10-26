import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { loadAuthorizedAsset, openAssetRange } from "../../../../../lib/server/assets";
import { apiError } from "../../../../../lib/server/http";
import { currentDM, currentPlayer } from "../../../../../lib/server/requestAuth";

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  try {
    const [dm, player] = await Promise.all([currentDM(), currentPlayer()]);
    const { row, path } = await loadAuthorizedAsset((await context.params).assetId, { dm, player });
    const range = await openAssetRange(path, request.headers.get("range"));
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=86400",
      "Content-Type": row.mimeType,
      "Content-Length": String(range.length),
      "X-Content-Type-Options": "nosniff"
    });
    if (range.partial) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${range.total}`);
    return new NextResponse(Readable.toWeb(range.stream) as ReadableStream, { status: range.partial ? 206 : 200, headers });
  } catch (error) {
    return apiError(error, "Could not load that asset.");
  }
}
