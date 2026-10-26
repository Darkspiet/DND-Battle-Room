import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { assets, campaignPlayers, campaigns, libraryItems, sceneRevisions, scenes } from "../../db/schema";
import type { AssetKind, CampaignPlayer, DMUser, SceneToken } from "../domain/types";
import { isPrivateNetworkAddress } from "../domain/network";
import { parseByteRange } from "../domain/range";
import { db } from "./db";
import { saveTokenPreset } from "./library";
import { DomainError } from "../domain/sceneReducer";
import { HttpError } from "./http";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "audio/x-wav"]);

function assetRoot() {
  return process.env.ASSET_DIR ? path.resolve(process.env.ASSET_DIR) : path.resolve(".data/assets");
}

function extensionFor(mime: string) {
  return (
    (
      {
        "image/webp": "webp",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "audio/mpeg": "mp3",
        "audio/ogg": "ogg",
        "audio/webm": "webm",
        "audio/wav": "wav",
        "audio/x-wav": "wav"
      } as Record<string, string>
    )[mime] ?? "bin"
  );
}

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

export function rasterMetadata(bytes: Buffer) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 10 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return { mimeType: "image/gif", width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    if (bytes.length >= 30 && bytes.subarray(12, 16).toString("ascii") === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { mimeType: "image/webp", width, height };
    }
    return { mimeType: "image/webp", width: null, height: null };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const dimensions = jpegDimensions(bytes);
    return { mimeType: "image/jpeg", width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  }
  return null;
}

export async function storeAsset(user: DMUser, input: { file: File; kind: AssetKind; campaignId?: string | null }) {
  if (input.campaignId) {
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.ownerId, user.id)))
      .limit(1);
    if (!campaign) throw new DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.");
  }

  const source = Buffer.from(await input.file.arrayBuffer());
  const bytes: Buffer<ArrayBufferLike> = source;
  const mimeType = input.file.type;
  let width: number | null = null;
  let height: number | null = null;

  if (IMAGE_TYPES.has(mimeType)) {
    if (source.byteLength > 20 * 1024 * 1024) throw new Error("Images must be smaller than 20 MB.");
    const metadata = rasterMetadata(source);
    if (!metadata || metadata.mimeType !== mimeType) throw new Error("The uploaded file does not match its image type.");
    width = metadata.width;
    height = metadata.height;
    if (width && height && width * height > 64_000_000) throw new Error("Images cannot exceed 64 million pixels.");
  } else if (input.kind === "audio" && AUDIO_TYPES.has(mimeType)) {
    if (source.byteLength > 100 * 1024 * 1024) throw new Error("Audio files must be smaller than 100 MB.");
  } else {
    throw new Error(input.kind === "audio" ? "Use MP3, OGG, WebM, or WAV audio." : "Use a PNG, JPEG, or WebP image.");
  }

  const digest = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `${digest.slice(0, 2)}/${digest}.${extensionFor(mimeType)}`;
  const destination = path.join(assetRoot(), storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await stat(destination);
  } catch {
    await writeFile(destination, bytes, { flag: "wx" });
  }

  const [row] = await db
    .insert(assets)
    .values({
      kind: input.kind,
      campaignId: input.campaignId,
      ownerId: user.id,
      originalName: input.file.name,
      mimeType,
      byteSize: bytes.byteLength,
      width,
      height,
      storageKey
    })
    .returning();
  return row;
}

export async function storePlayerAvatar(player: CampaignPlayer, file: File) {
  const [campaign] = await db
    .select({ ownerId: campaigns.ownerId })
    .from(campaigns)
    .where(eq(campaigns.id, player.campaignId))
    .limit(1);
  if (!campaign) throw new DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.");
  const asset = await storeAsset(
    { id: campaign.ownerId, username: "", displayName: "", role: "dm", color: "#000000" },
    { file, kind: "avatar", campaignId: player.campaignId }
  );
  const changedTokens = await db.transaction(async (tx) => {
    await tx
      .update(campaignPlayers)
      .set({ avatarAssetId: asset.id, lastSeenAt: new Date() })
      .where(and(eq(campaignPlayers.id, player.id), eq(campaignPlayers.campaignId, player.campaignId)));
    const sceneRows = await tx
      .select()
      .from(scenes)
      .where(eq(scenes.campaignId, player.campaignId))
      .for("update");
    const tokens: SceneToken[] = [];
    for (const scene of sceneRows) {
      const owned = scene.state.tokens.filter((token) => token.ownerId === player.id);
      if (!owned.length) continue;
      const state = {
        ...scene.state,
        tokens: scene.state.tokens.map((token) =>
          token.ownerId === player.id ? { ...token, assetId: asset.id } : token
        )
      };
      await tx.insert(sceneRevisions).values({
        sceneId: scene.id,
        version: scene.version,
        state: scene.state,
        command: { type: "player.character.portrait", playerId: player.id, assetId: asset.id },
        actorId: player.id,
        actorName: player.nickname
      });
      await tx
        .update(scenes)
        .set({ state, version: scene.version + 1, updatedAt: new Date() })
        .where(eq(scenes.id, scene.id));
      tokens.push(...state.tokens.filter((token) => token.ownerId === player.id));
    }
    return tokens;
  });
  for (const token of changedTokens) await saveTokenPreset(campaign.ownerId, token).catch(() => undefined);
  return asset;
}

async function assertPublicRemoteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DomainError("INVALID_ASSET_URL", "Use a public HTTP or HTTPS image URL.");
  }
  if (url.username || url.password) throw new DomainError("INVALID_ASSET_URL", "Image URLs cannot contain credentials.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new DomainError("UNSAFE_ASSET_URL", "That image address is not publicly routable.");
  }
  return url;
}

async function downloadPublicImage(url: URL): Promise<{ status: number; location?: string; mime: string; bytes: Buffer }> {
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address)))
    throw new DomainError("UNSAFE_ASSET_URL", "That image address is not publicly routable.");
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
      lookup: (_hostname, options, callback) => {
        // Node requests all addresses when auto family selection is enabled.
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      }
    }, (response) => {
      const status = response.statusCode ?? 500;
      if (status >= 300 && status < 400) {
        response.destroy();
        resolve({ status, location: response.headers.location, mime: "", bytes: Buffer.alloc(0) });
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) request.destroy(new DomainError("ASSET_TOO_LARGE", "Images must be smaller than 20 MB."));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status, mime: response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() ?? "", bytes: Buffer.concat(chunks) }));
    });
    const timer = setTimeout(() => request.destroy(new Error("Image request timed out.")), 12000);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end();
  });
}

export async function importRemoteAsset(
  user: DMUser,
  input: { url: string; kind: Exclude<AssetKind, "audio">; campaignId?: string | null }
) {
  let url = await assertPublicRemoteUrl(input.url);
  let response: Awaited<ReturnType<typeof downloadPublicImage>> | undefined;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    response = await downloadPublicImage(url);
    if (response.status < 300 || response.status >= 400) break;
    if (!response.location || redirect === 3) throw new DomainError("ASSET_DOWNLOAD_FAILED", "The image redirected too many times.");
    url = await assertPublicRemoteUrl(new URL(response.location, url).toString());
  }
  if (!response || response.status < 200 || response.status >= 300) throw new DomainError("ASSET_DOWNLOAD_FAILED", "The image server did not return a usable file.");
  const mimeType = response.mime;
  if (!IMAGE_TYPES.has(mimeType)) throw new DomainError("INVALID_ASSET_TYPE", "Use a PNG, JPEG, WebP, or GIF image.");
  const bytes = response.bytes;
  const name = decodeURIComponent(url.pathname.split("/").at(-1) || `imported.${mimeType.split("/")[1] || "image"}`);
  return storeAsset(user, {
    campaignId: input.campaignId,
    kind: input.kind,
    file: new File([new Uint8Array(bytes)], name, { type: mimeType })
  });
}

export async function loadAuthorizedAsset(
  assetId: string,
  actor: { dm?: DMUser | null; player?: CampaignPlayer | null }
) {
  const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!row) throw new DomainError("ASSET_NOT_FOUND", "Asset not found.");

  let allowed = actor.dm?.id === row.ownerId;
  if (!allowed && actor.dm && row.campaignId) {
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, row.campaignId), eq(campaigns.ownerId, actor.dm.id)))
      .limit(1);
    allowed = Boolean(campaign);
  }
  if (!allowed && actor.dm) {
    const [shared] = await db.select({ id: libraryItems.id }).from(libraryItems).where(and(eq(libraryItems.assetId, row.id), eq(libraryItems.visibility, "shared"))).limit(1);
    allowed = Boolean(shared);
  }
  if (!allowed && actor.player) {
    // Referenced shared-library media may belong to a different DM. Only expose
    // assets present in the player's active encounter, or this campaign's media.
    if (row.campaignId === actor.player.campaignId) allowed = true;
    else if (actor.player.destination.kind === "scene") {
      const [scene] = await db.select().from(scenes).where(and(eq(scenes.id, actor.player.destination.sceneId), eq(scenes.campaignId, actor.player.campaignId))).limit(1);
      allowed = Boolean(scene && (scene.state.grid.backgroundAssetId === row.id || scene.state.tokens.some((token) => token.assetId === row.id)));
    }
  }
  if (!allowed) throw new DomainError("FORBIDDEN", "You cannot access that asset.");

  return { row, path: path.join(assetRoot(), row.storageKey) };
}

export async function openAssetRange(filePath: string, range?: string | null) {
  const { size: total } = await stat(filePath);
  const parsed = parseByteRange(range, total);
  if (!parsed) throw new HttpError(416, "INVALID_RANGE", "The requested byte range is not available.");
  return {
    ...parsed,
    total,
    length: parsed.end - parsed.start + 1,
    stream: createReadStream(filePath, { start: parsed.start, end: parsed.end })
  };
}
