import { and, desc, eq, or, sql } from "drizzle-orm";
import { assets, libraryItems } from "../../db/schema";
import type { LibraryItem, LibraryVisibility, SceneToken } from "../domain/types";
import { DomainError } from "../domain/sceneReducer";
import { db } from "./db";

function toLibraryItem(row: typeof libraryItems.$inferSelect): LibraryItem {
  return {
    ...row,
    kind: row.kind as LibraryItem["kind"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

const STARTER_LIBRARY: LibraryItem[] = [
  ["00000000-0000-4000-8000-000000000101", "token", "Adventurer", "Characters", "⚔", "character", "#b83c52"],
  ["00000000-0000-4000-8000-000000000102", "token", "Spellcaster", "Characters", "✦", "character", "#4d86e8"],
  ["00000000-0000-4000-8000-000000000103", "token", "Town Guard", "NPCs", "🛡", "npc", "#d8a33d"],
  ["00000000-0000-4000-8000-000000000104", "token", "Villager", "NPCs", "◇", "npc", "#2fa66d"],
  ["00000000-0000-4000-8000-000000000105", "token", "Goblin", "Monsters", "G", "monster", "#62a85a"],
  ["00000000-0000-4000-8000-000000000106", "token", "Skeleton", "Monsters", "☠", "monster", "#8d99a8"],
  ["00000000-0000-4000-8000-000000000107", "object", "Treasure Chest", "Map objects", "▣", "object", "#b7864b"],
  ["00000000-0000-4000-8000-000000000108", "object", "Stone Pillar", "Map objects", "⬟", "object", "#6f7783"]
].map(([id, kind, name, category, icon, tokenKind, color]) => ({
  id,
  ownerId: "00000000-0000-4000-8000-000000000000",
  visibility: "shared",
  kind: kind as LibraryItem["kind"],
  name,
  category,
  assetId: null,
  data: { icon, kind: tokenKind, color, size: 1, starter: true },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
}));

function tokenCategory(token: SceneToken) {
  if (token.kind === "character") return "Characters";
  if (token.kind === "npc") return "NPCs";
  if (token.kind === "monster") return "Monsters";
  return "Map objects";
}

function tokenAutoKey(token: SceneToken) {
  return [token.kind, token.name.trim().toLowerCase(), token.icon, token.assetId ?? "", token.size].join("|");
}

export async function listLibraryItems(userId: string, kind?: string | null) {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        or(eq(libraryItems.ownerId, userId), eq(libraryItems.visibility, "shared")),
        kind ? eq(libraryItems.kind, kind) : undefined
      )
    )
    .orderBy(desc(libraryItems.updatedAt));
  return [...rows.map(toLibraryItem), ...STARTER_LIBRARY].filter((item) => !kind || item.kind === kind);
}

async function assertOwnedAsset(userId: string, assetId?: string | null) {
  if (!assetId) return;
  const [asset] = await db
    .select({ id: assets.id, kind: assets.kind })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.ownerId, userId)))
    .limit(1);
  if (!asset || (asset.kind !== "token" && asset.kind !== "avatar"))
    throw new DomainError("ASSET_NOT_FOUND", "That token image is not in your library.");
}

export async function saveTokenPreset(userId: string, token: SceneToken) {
  const autoKey = tokenAutoKey(token);
  const kind = token.kind === "object" ? "object" : "token";
  const data = {
    icon: token.icon,
    kind: token.kind,
    color: token.color,
    size: token.size,
    hp: token.hp ?? null,
    note: token.note ?? null,
    conditions: token.conditions,
    sourceTokenId: token.id,
    autoKey
  };
  const [existing] = await db
    .select({ id: libraryItems.id })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.ownerId, userId),
        or(
          sql`${libraryItems.data}->>'sourceTokenId' = ${token.id}`,
          sql`${libraryItems.data}->>'autoKey' = ${autoKey}`
        )
      )
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(libraryItems)
      .set({ kind, name: token.name, category: tokenCategory(token), assetId: token.assetId, data, updatedAt: new Date() })
      .where(eq(libraryItems.id, existing.id))
      .returning();
    return toLibraryItem(row);
  }

  const [row] = await db
    .insert(libraryItems)
    .values({
      ownerId: userId,
      visibility: "private",
      kind,
      name: token.name,
      category: tokenCategory(token),
      assetId: token.assetId,
      data
    })
    .returning();
  return toLibraryItem(row);
}

export async function createLibraryItem(
  userId: string,
  input: {
    kind: "token" | "object" | "effect";
    name: string;
    category: string;
    visibility: LibraryVisibility;
    assetId?: string | null;
    data: Record<string, unknown>;
  }
) {
  await assertOwnedAsset(userId, input.assetId);
  const sourceTokenId = typeof input.data.sourceTokenId === "string" ? input.data.sourceTokenId : null;
  if (sourceTokenId) {
    const [existing] = await db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(eq(libraryItems.ownerId, userId), sql`${libraryItems.data}->>'sourceTokenId' = ${sourceTokenId}`)
      )
      .limit(1);
    if (existing) {
      const [row] = await db
        .update(libraryItems)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(libraryItems.id, existing.id))
        .returning();
      return toLibraryItem(row);
    }
  }
  const [row] = await db
    .insert(libraryItems)
    .values({ ...input, ownerId: userId })
    .returning();
  return toLibraryItem(row);
}

export async function updateLibraryItem(
  userId: string,
  itemId: string,
  patch: Partial<{
    kind: "token" | "object" | "effect";
    name: string;
    category: string;
    visibility: LibraryVisibility;
    assetId: string | null;
    data: Record<string, unknown>;
  }>
) {
  await assertOwnedAsset(userId, patch.assetId);
  const [row] = await db
    .update(libraryItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerId, userId)))
    .returning();
  if (!row) throw new DomainError("LIBRARY_ITEM_NOT_FOUND", "Library item not found.");
  return toLibraryItem(row);
}

export async function deleteLibraryItem(userId: string, itemId: string) {
  const [row] = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.ownerId, userId)))
    .returning({ id: libraryItems.id });
  if (!row) throw new DomainError("LIBRARY_ITEM_NOT_FOUND", "Library item not found.");
  return row;
}
