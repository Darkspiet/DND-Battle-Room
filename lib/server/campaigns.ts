import { sceneForActor } from "../domain/privacy";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import {
  audioTracks,
  assets,
  campaignAudioState,
  campaignPlayers,
  campaigns,
  diceRolls,
  playerSessions,
  sceneRevisions,
  scenes,
  worldConnections,
  worldLocations,
  campaignWorldSettings,
  libraryItems
} from "../../db/schema";
import { createDefaultSceneState, PLAYER_COLORS } from "../domain/defaults";
import { effectiveAudioPosition } from "../domain/audio";
import { sceneCommandSchema } from "../domain/contracts";
import {
  applySceneCommand,
  authorizeSceneCommand,
  DomainError,
  inverseSceneCommand,
  sceneCommandScope
} from "../domain/sceneReducer";
import type {
  Actor,
  AudioPlaybackState,
  CampaignPlayer,
  CampaignSummary,
  DMUser,
  PlayerDestination,
  SceneCommand,
  SceneRecord,
  SceneToken,
  WorldConnection,
  WorldLocation,
  WorldMapSettings
} from "../domain/types";
import { db } from "./db";
import { saveTokenPreset } from "./library";
import { createOpaqueToken, hashOpaqueToken, PLAYER_SESSION_MAX_AGE_SECONDS } from "./session";

function toIso(value: Date | string) {
  return new Date(value).toISOString();
}

function toPlayer(row: typeof campaignPlayers.$inferSelect): CampaignPlayer {
  return {
    id: row.id,
    campaignId: row.campaignId,
    nickname: row.nickname,
    color: row.color,
    avatarAssetId: row.avatarAssetId,
    destination: row.destinationSceneId ? { kind: "scene", sceneId: row.destinationSceneId } : { kind: "world" },
    joinedAt: toIso(row.joinedAt),
    lastSeenAt: toIso(row.lastSeenAt)
  };
}

function toScene(row: typeof scenes.$inferSelect): SceneRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    state: row.state,
    version: row.version,
    updatedAt: toIso(row.updatedAt)
  };
}

function toLocation(row: typeof worldLocations.$inferSelect): WorldLocation {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sceneId: row.sceneId,
    name: row.name,
    description: row.description,
    x: row.x,
    y: row.y,
    revealed: row.revealed,
    thumbnailAssetId: row.thumbnailAssetId
  };
}

function toConnection(row: typeof worldConnections.$inferSelect): WorldConnection {
  return {
    id: row.id,
    campaignId: row.campaignId,
    sourceLocationId: row.sourceLocationId,
    targetLocationId: row.targetLocationId,
    label: row.label,
    revealed: row.revealed
  };
}

function defaultWorldMap(campaignId: string): WorldMapSettings {
  return { campaignId, backgroundAssetId: null, x: 0, y: 0, scale: 1, opacity: 1 };
}

function toWorldMap(row: typeof campaignWorldSettings.$inferSelect): WorldMapSettings {
  return {
    campaignId: row.campaignId,
    backgroundAssetId: row.backgroundAssetId,
    x: row.x,
    y: row.y,
    scale: row.scale,
    opacity: row.opacity
  };
}

function createJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

async function ownedCampaign(userId: string, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerId, userId)))
    .limit(1);
  if (!campaign) throw new DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.");
  return campaign;
}

export async function listCampaigns(userId: string): Promise<CampaignSummary[]> {
  const rows = await db
    .select({
      campaign: campaigns,
      sceneCount: sql<number>`count(distinct ${scenes.id})`,
      playerCount: sql<number>`count(distinct ${campaignPlayers.id}) filter (where ${campaignPlayers.removedAt} is null)`
    })
    .from(campaigns)
    .leftJoin(scenes, eq(scenes.campaignId, campaigns.id))
    .leftJoin(campaignPlayers, eq(campaignPlayers.campaignId, campaigns.id))
    .where(eq(campaigns.ownerId, userId))
    .groupBy(campaigns.id)
    .orderBy(desc(campaigns.updatedAt));

  return rows.map(({ campaign, sceneCount, playerCount }) => ({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    joinCode: campaign.joinCode,
    joinEnabled: campaign.joinEnabled,
    ownerId: campaign.ownerId,
    sceneCount: Number(sceneCount),
    playerCount: Number(playerCount),
    updatedAt: toIso(campaign.updatedAt)
  }));
}

export async function createCampaign(user: DMUser, input: { name: string; description: string }) {
  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        ownerId: user.id,
        name: input.name,
        description: input.description,
        joinCode: createJoinCode()
      })
      .returning();
    const [scene] = await tx
      .insert(scenes)
      .values({
        campaignId: campaign.id,
        name: "Opening Encounter",
        state: createDefaultSceneState()
      })
      .returning();
    const [location] = await tx
      .insert(worldLocations)
      .values({
        campaignId: campaign.id,
        sceneId: scene.id,
        name: "Opening Encounter",
        description: "The campaign begins here.",
        x: 0,
        y: 0,
        revealed: true
      })
      .returning();
    await tx.insert(campaignAudioState).values({ campaignId: campaign.id });
    await tx.insert(campaignWorldSettings).values({ campaignId: campaign.id });
    return { campaign, scene: toScene(scene), location: toLocation(location) };
  });
}

export async function updateCampaign(
  userId: string,
  campaignId: string,
  patch: { name?: string; description?: string; joinEnabled?: boolean }
) {
  await ownedCampaign(userId, campaignId);
  const [campaign] = await db
    .update(campaigns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId))
    .returning();
  return campaign;
}

export async function getCampaignWorkspace(userId: string, campaignId: string) {
  const campaign = await ownedCampaign(userId, campaignId);
  const [sceneRows, locationRows, connectionRows, playerRows, trackRows, [audioRow], [worldMapRow]] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).orderBy(scenes.createdAt),
    db.select().from(worldLocations).where(eq(worldLocations.campaignId, campaignId)).orderBy(worldLocations.createdAt),
    db
      .select()
      .from(worldConnections)
      .where(eq(worldConnections.campaignId, campaignId))
      .orderBy(worldConnections.createdAt),
    db
      .select()
      .from(campaignPlayers)
      .where(and(eq(campaignPlayers.campaignId, campaignId), isNull(campaignPlayers.removedAt)))
      .orderBy(campaignPlayers.joinedAt),
    db.select().from(audioTracks).where(eq(audioTracks.campaignId, campaignId)).orderBy(audioTracks.createdAt),
    db.select().from(campaignAudioState).where(eq(campaignAudioState.campaignId, campaignId)).limit(1),
    db.select().from(campaignWorldSettings).where(eq(campaignWorldSettings.campaignId, campaignId)).limit(1)
  ]);
  return {
    campaign,
    scenes: sceneRows.map(toScene),
    locations: locationRows.map(toLocation),
    connections: connectionRows.map(toConnection),
    worldMap: worldMapRow ? toWorldMap(worldMapRow) : defaultWorldMap(campaignId),
    players: playerRows.map(toPlayer),
    audioTracks: trackRows,
    audioState: audioRow ? toAudioState(audioRow) : defaultAudioState(campaignId)
  };
}

export async function createWorldLocation(
  userId: string,
  campaignId: string,
  input: { name: string; description: string; x: number; y: number; revealed: boolean }
) {
  await ownedCampaign(userId, campaignId);
  return db.transaction(async (tx) => {
    const [scene] = await tx
      .insert(scenes)
      .values({ campaignId, name: input.name, state: createDefaultSceneState() })
      .returning();
    const [location] = await tx
      .insert(worldLocations)
      .values({ ...input, campaignId, sceneId: scene.id })
      .returning();
    await tx.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    return { scene: toScene(scene), location: toLocation(location) };
  });
}

export async function updateWorldLocation(
  userId: string,
  campaignId: string,
  locationId: string,
  patch: Partial<Pick<WorldLocation, "name" | "description" | "x" | "y" | "revealed">>
) {
  await ownedCampaign(userId, campaignId);
  const [location] = await db
    .update(worldLocations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(worldLocations.id, locationId), eq(worldLocations.campaignId, campaignId)))
    .returning();
  if (!location) throw new DomainError("LOCATION_NOT_FOUND", "Location not found.");
  if (patch.name)
    await db.update(scenes).set({ name: patch.name, updatedAt: new Date() }).where(eq(scenes.id, location.sceneId));
  return toLocation(location);
}

export async function updateWorldMap(
  userId: string,
  campaignId: string,
  patch: Partial<Pick<WorldMapSettings, "backgroundAssetId" | "x" | "y" | "scale" | "opacity">>
) {
  await ownedCampaign(userId, campaignId);
  if (patch.backgroundAssetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.id, patch.backgroundAssetId),
          eq(assets.ownerId, userId),
          eq(assets.campaignId, campaignId),
          eq(assets.kind, "world")
        )
      )
      .limit(1);
    if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Choose a world image uploaded to this campaign.");
  }
  const [row] = await db
    .insert(campaignWorldSettings)
    .values({ campaignId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: campaignWorldSettings.campaignId,
      set: { ...patch, updatedAt: new Date() }
    })
    .returning();
  await db.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
  return toWorldMap(row);
}

export async function createWorldConnection(
  userId: string,
  campaignId: string,
  input: { sourceLocationId: string; targetLocationId: string; label: string; revealed: boolean }
) {
  await ownedCampaign(userId, campaignId);
  const locations = await db
    .select({ id: worldLocations.id })
    .from(worldLocations)
    .where(
      and(
        eq(worldLocations.campaignId, campaignId),
        inArray(worldLocations.id, [input.sourceLocationId, input.targetLocationId])
      )
    );
  if (locations.length !== 2)
    throw new DomainError("LOCATION_NOT_FOUND", "Both locations must belong to this campaign.");
  const [connection] = await db
    .insert(worldConnections)
    .values({ ...input, campaignId })
    .returning();
  return toConnection(connection);
}

export async function joinCampaign(
  code: string,
  input: { nickname: string; color?: string; character?: { name: string; icon: string } }
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.joinCode, code.toUpperCase()), eq(campaigns.joinEnabled, true)))
    .limit(1);
  if (!campaign) throw new DomainError("CAMPAIGN_NOT_FOUND", "That campaign code is not open.");
  const existing = await db
    .select({ color: campaignPlayers.color })
    .from(campaignPlayers)
    .where(and(eq(campaignPlayers.campaignId, campaign.id), isNull(campaignPlayers.removedAt)));
  const used = new Set(existing.map((row) => row.color.toLowerCase()));
  const chosen =
    input.color && !used.has(input.color.toLowerCase())
      ? input.color
      : (PLAYER_COLORS.find((candidate) => !used.has(candidate.toLowerCase())) ?? PLAYER_COLORS[0]);
  const token = createOpaqueToken();
  const joined = await db.transaction(async (tx) => {
    const [player] = await tx
      .insert(campaignPlayers)
      .values({ campaignId: campaign.id, nickname: input.nickname, color: chosen })
      .returning();
    await tx.insert(playerSessions).values({
      tokenHash: hashOpaqueToken(token),
      playerId: player.id,
      expiresAt: new Date(Date.now() + PLAYER_SESSION_MAX_AGE_SECONDS * 1000)
    });
    const [scene] = await tx
      .select()
      .from(scenes)
      .where(eq(scenes.campaignId, campaign.id))
      .orderBy(scenes.createdAt)
      .for("update")
      .limit(1);
    if (!scene) throw new DomainError("SCENE_NOT_FOUND", "This campaign does not have a battle scene.");
    const occupied = new Set(scene.state.tokens.map((candidate) => `${candidate.x}:${candidate.y}`));
    const preferredX = Math.min(2, scene.state.grid.columns - 1);
    const preferredY = Math.min(2, scene.state.grid.rows - 1);
    const preferredIndex = preferredY * scene.state.grid.columns + preferredX;
    let x = preferredX;
    let y = preferredY;
    for (let offset = 0; offset < scene.state.grid.columns * scene.state.grid.rows; offset += 1) {
      const index = (preferredIndex + offset) % (scene.state.grid.columns * scene.state.grid.rows);
      const candidateX = index % scene.state.grid.columns;
      const candidateY = Math.floor(index / scene.state.grid.columns);
      if (!occupied.has(`${candidateX}:${candidateY}`)) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }
    const characterToken: SceneToken = {
      id: randomUUID(),
      name: input.character?.name ?? input.nickname,
      icon: input.character?.icon ?? "⚔",
      kind: "character",
      ownerId: player.id,
      ownerName: player.nickname,
      assetId: null,
      color: chosen,
      x,
      y,
      size: 1,
      hp: null,
      note: null,
      conditions: []
    };
    const nextState = { ...scene.state, tokens: [...scene.state.tokens, characterToken] };
    await tx.insert(sceneRevisions).values({
      sceneId: scene.id,
      version: scene.version,
      state: scene.state,
      command: { type: "player.character.create", token: characterToken },
      actorId: player.id,
      actorName: player.nickname
    });
    await tx
      .update(scenes)
      .set({ state: nextState, version: scene.version + 1, updatedAt: new Date() })
      .where(eq(scenes.id, scene.id));
    return { campaign, player: toPlayer(player), token, characterToken };
  });
  await saveTokenPreset(campaign.ownerId, joined.characterToken).catch(() => undefined);
  return joined;
}

export async function getPlayerBySessionToken(token?: string | null) {
  if (!token) return null;
  const [row] = await db
    .select({ player: campaignPlayers })
    .from(playerSessions)
    .innerJoin(campaignPlayers, eq(campaignPlayers.id, playerSessions.playerId))
    .where(
      and(
        eq(playerSessions.tokenHash, hashOpaqueToken(token)),
        sql`${playerSessions.expiresAt} > now()`,
        isNull(campaignPlayers.removedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  await db.update(campaignPlayers).set({ lastSeenAt: new Date() }).where(eq(campaignPlayers.id, row.player.id));
  return toPlayer(row.player);
}

export async function getPlayerCampaignView(player: CampaignPlayer, code: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, player.campaignId), eq(campaigns.joinCode, code.toUpperCase())))
    .limit(1);
  if (!campaign) throw new DomainError("CAMPAIGN_NOT_FOUND", "Campaign not found.");
  const [locationRows, connectionRows, [audioRow], trackRows, [worldMapRow]] = await Promise.all([
    db
      .select()
      .from(worldLocations)
      .where(and(eq(worldLocations.campaignId, campaign.id), eq(worldLocations.revealed, true))),
    db
      .select()
      .from(worldConnections)
      .where(and(eq(worldConnections.campaignId, campaign.id), eq(worldConnections.revealed, true))),
    db.select().from(campaignAudioState).where(eq(campaignAudioState.campaignId, campaign.id)).limit(1),
    db.select().from(audioTracks).where(eq(audioTracks.campaignId, campaign.id)),
    db.select().from(campaignWorldSettings).where(eq(campaignWorldSettings.campaignId, campaign.id)).limit(1)
  ]);
  const scene = player.destination.kind === "scene" ? await getScene(player.destination.sceneId) : null;
  return {
    campaign: { id: campaign.id, name: campaign.name, description: campaign.description, joinCode: campaign.joinCode },
    player,
    locations: locationRows.map(toLocation),
    connections: connectionRows.map(toConnection),
    worldMap: worldMapRow ? toWorldMap(worldMapRow) : defaultWorldMap(campaign.id),
    scene: scene ? sceneForActor(scene, { id: player.id, name: player.nickname, role: "player", campaignId: campaign.id }) : null,
    audioTracks: trackRows,
    audioState: audioRow ? toAudioState(audioRow) : defaultAudioState(campaign.id)
  };
}

export async function setPlayerDestinations(
  userId: string,
  campaignId: string,
  playerIds: string[],
  destination: PlayerDestination
) {
  await ownedCampaign(userId, campaignId);
  return db.transaction(async (tx) => {
    let targetScene: typeof scenes.$inferSelect | undefined;
    let campaignScenes: Array<typeof scenes.$inferSelect> = [];
    if (destination.kind === "scene") {
      campaignScenes = await tx
        .select()
        .from(scenes)
        .where(eq(scenes.campaignId, campaignId))
        .orderBy(scenes.createdAt)
        .for("update");
      targetScene = campaignScenes.find((scene) => scene.id === destination.sceneId);
      if (!targetScene) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
    }

    const rows = await tx
      .update(campaignPlayers)
      .set({ destinationSceneId: destination.kind === "scene" ? destination.sceneId : null })
      .where(
        and(
          eq(campaignPlayers.campaignId, campaignId),
          inArray(campaignPlayers.id, playerIds),
          isNull(campaignPlayers.removedAt)
        )
      )
      .returning();

    if (targetScene) {
      let state = targetScene.state;
      const deployed: string[] = [];
      for (const player of rows) {
        if (state.tokens.some((token) => token.ownerId === player.id)) continue;
        const source = campaignScenes.flatMap((scene) => scene.state.tokens).find((token) => token.ownerId === player.id);
        if (!source) continue;
        const occupied = new Set(state.tokens.map((token) => `${token.x}:${token.y}`));
        let x = 0;
        let y = 0;
        while (occupied.has(`${x}:${y}`) && y < state.grid.rows) {
          x += 1;
          if (x >= state.grid.columns) {
            x = 0;
            y += 1;
          }
        }
        state = {
          ...state,
          tokens: [
            ...state.tokens,
            { ...source, id: randomUUID(), x, y: Math.min(y, state.grid.rows - source.size), conditions: [] }
          ]
        };
        deployed.push(player.id);
      }
      if (deployed.length) {
        await tx.insert(sceneRevisions).values({
          sceneId: targetScene.id,
          version: targetScene.version,
          state: targetScene.state,
          command: { type: "players.character.deploy", playerIds: deployed },
          actorId: userId,
          actorName: "DM"
        });
        await tx
          .update(scenes)
          .set({ state, version: targetScene.version + 1, updatedAt: new Date() })
          .where(eq(scenes.id, targetScene.id));
      }
    }
    return rows.map(toPlayer);
  });
}

export async function getScene(sceneId: string) {
  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return scene ? toScene(scene) : null;
}

export async function getSceneActor(input: {
  sceneId: string;
  dm?: DMUser | null;
  player?: CampaignPlayer | null;
}): Promise<Actor> {
  const scene = await getScene(input.sceneId);
  if (!scene) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
  if (input.dm) {
    await ownedCampaign(input.dm.id, scene.campaignId);
    return { id: input.dm.id, name: input.dm.displayName, role: "dm", campaignId: scene.campaignId };
  }
  if (
    input.player &&
    input.player.campaignId === scene.campaignId &&
    input.player.destination.kind === "scene" &&
    input.player.destination.sceneId === scene.id
  ) {
    return { id: input.player.id, name: input.player.nickname, role: "player", campaignId: scene.campaignId };
  }
  throw new DomainError("FORBIDDEN", "You are not assigned to this battle room.");
}

async function assertSceneAssetReferences(actor: Actor, command: SceneCommand) {
  let assetId: string | null | undefined;
  let expectedKind: "token" | "map" | undefined;
  if (command.type === "token.create") {
    assetId = command.token.assetId;
    expectedKind = "token";
  } else if (command.type === "token.update" && "assetId" in command.patch) {
    assetId = command.patch.assetId;
    expectedKind = "token";
  } else if (command.type === "grid.update" && "backgroundAssetId" in command.patch) {
    assetId = command.patch.backgroundAssetId;
    expectedKind = "map";
  }
  if (!assetId || !expectedKind) return;
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  const [shared] = actor.role === "dm" ? await db.select({ id: libraryItems.id }).from(libraryItems)
    .where(and(eq(libraryItems.assetId, assetId), eq(libraryItems.visibility, "shared"))).limit(1) : [];
  const kindMatches = expectedKind === "token" ? asset?.kind === "token" || asset?.kind === "avatar" : asset?.kind === expectedKind;
  if (
    !asset ||
    (asset.ownerId !== actor.id && !shared) ||
    !kindMatches ||
    (!shared && asset.campaignId !== null && asset.campaignId !== actor.campaignId)
  ) {
    throw new DomainError("ASSET_NOT_FOUND", "That image is not available for this campaign.");
  }
}

export async function commitSceneCommand(
  actor: Actor,
  sceneId: string,
  baseVersion: number,
  command: SceneCommand,
  commandId: string
) {
  await assertSceneAssetReferences(actor, command);
  const scene = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(scenes).where(eq(scenes.id, sceneId)).for("update").limit(1);
    if (!row) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
    if (row.campaignId !== actor.campaignId) throw new DomainError("FORBIDDEN", "You cannot change this scene.");
    const [existing] = await tx
      .select({ id: sceneRevisions.id })
      .from(sceneRevisions)
      .where(and(eq(sceneRevisions.commandId, commandId), eq(sceneRevisions.sceneId, sceneId)))
      .limit(1);
    if (existing) return toScene(row);
    if (row.version !== baseVersion)
      throw new DomainError("VERSION_CONFLICT", "The scene changed; refresh the latest state and try again.");
    authorizeSceneCommand(actor, row.state, command);
    if (command.type === "token.create" || command.type === "token.update") {
      const value: Partial<SceneToken> = command.type === "token.create" ? command.token : command.patch;
      if ("ownerId" in value && value.ownerId) {
        const [owner] = await tx.select().from(campaignPlayers).where(and(eq(campaignPlayers.id, value.ownerId), eq(campaignPlayers.campaignId, row.campaignId), isNull(campaignPlayers.removedAt))).limit(1);
        if (!owner) throw new DomainError("FORBIDDEN", "Choose a current player from this campaign.");
        value.ownerName = owner.nickname;
      } else if ("ownerId" in value) value.ownerName = null;
      if (actor.role === "dm") {
        const existing = command.type === "token.update" ? row.state.tokens.find((token) => token.id === command.tokenId) : null;
        if ("note" in value) { value.dmNote = value.note; value.note = existing?.ownerId ? existing.note : null; }
        if (existing && !existing.ownerId) {
          value.dmNote ??= existing.dmNote ?? existing.note;
          value.hpPrivate = true;
          if (!("note" in value)) value.note = null;
        }
        if (command.type === "token.create" && !command.token.ownerId) value.hpPrivate = true;
      }
    }
    const state = applySceneCommand(row.state, command);
    if (state.tokens.length > 500 || state.drawings.length > 1000 || state.effects.length > 500)
      throw new DomainError("LIMIT_REACHED", "This scene has reached its object limit.");
    const scope = sceneCommandScope(command);
    const inverse = scope === "build" ? inverseSceneCommand(row.state, command) : null;
    await tx.insert(sceneRevisions).values({
      sceneId,
      version: row.version,
      commandId,
      scope,
      state: row.state,
      command: command as unknown as Record<string, unknown>,
      inverseCommand: inverse as unknown as Record<string, unknown> | null,
      actorId: actor.id,
      actorName: actor.name
    });
    const [updated] = await tx
      .update(scenes)
      .set({ state, version: row.version + 1, updatedAt: new Date() })
      .where(eq(scenes.id, sceneId))
      .returning();
    await tx.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, row.campaignId));
    return toScene(updated);
  });
  if (actor.role === "dm" && command.type === "token.create") {
    await saveTokenPreset(actor.id, command.token).catch(() => undefined);
  }
  return scene;
}

export async function undoSceneCommand(actor: Actor, sceneId: string, baseVersion: number) {
  if (actor.role !== "dm") throw new DomainError("FORBIDDEN", "Only the DM can undo scene changes.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(scenes).where(eq(scenes.id, sceneId)).for("update").limit(1);
    if (!row) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
    if (row.campaignId !== actor.campaignId) throw new DomainError("FORBIDDEN", "You cannot change this scene.");
    if (row.version !== baseVersion)
      throw new DomainError("VERSION_CONFLICT", "The scene changed; refresh the latest state and try again.");
    const [revision] = await tx
      .select()
      .from(sceneRevisions)
      .where(
        and(
          eq(sceneRevisions.sceneId, sceneId),
          eq(sceneRevisions.scope, "build"),
          isNotNull(sceneRevisions.inverseCommand),
          isNull(sceneRevisions.undoneAt)
        )
      )
      .orderBy(desc(sceneRevisions.version), desc(sceneRevisions.createdAt))
      .for("update")
      .limit(1);
    if (!revision) throw new DomainError("NOTHING_TO_UNDO", "There is no build change to undo.");
    const inverse = sceneCommandSchema.parse(revision.inverseCommand);
    const state = applySceneCommand(row.state, inverse);
    await tx.update(sceneRevisions).set({ undoneAt: new Date() }).where(eq(sceneRevisions.id, revision.id));
    const [updated] = await tx
      .update(scenes)
      .set({ state, version: row.version + 1, updatedAt: new Date() })
      .where(eq(scenes.id, sceneId))
      .returning();
    await tx.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, row.campaignId));
    return toScene(updated);
  });
}

export async function submitInitiative(
  actor: Actor,
  sceneId: string,
  tokenId: string,
  baseVersion: number,
  initiative: number,
  dexModifier = 0,
  input?: { mode?: "manual" | "normal" | "advantage" | "disadvantage"; roll?: number; source?: "app" | "manual" | "dm" }
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(scenes).where(eq(scenes.id, sceneId)).for("update").limit(1);
    if (!row) throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
    if (row.campaignId !== actor.campaignId) throw new DomainError("FORBIDDEN", "You cannot change this scene.");
    if (row.version !== baseVersion)
      throw new DomainError("VERSION_CONFLICT", "The scene changed; refresh the latest state and try again.");
    const token = row.state.tokens.find((candidate) => candidate.id === tokenId);
    if (!token) throw new DomainError("TOKEN_NOT_FOUND", "That token no longer exists.");
    if (row.state.combat.phase !== "initiative")
      throw new DomainError("INITIATIVE_CLOSED", "The DM is not collecting initiative right now.");
    if (actor.role === "player" && token.ownerId !== actor.id)
      throw new DomainError("FORBIDDEN", "You can only submit initiative for your assigned token.");

    const existing = row.state.combat.entries.find((entry) => entry.tokenId === tokenId);
    const nextEntry = {
      id: existing?.id ?? randomUUID(),
      tokenId,
      name: token.name,
      ownerId: token.ownerId,
      ownerName: token.ownerName,
      dexModifier,
      roll: input?.roll ?? null,
      total: initiative,
      mode: input?.mode ?? "manual",
      conditions: token.conditions.map((condition) => condition.label),
      submitted: true,
      source: input?.source ?? (actor.role === "dm" ? "dm" : "manual"),
      skipped: false,
      createdAt: existing?.createdAt ?? Date.now()
    } as const;
    const entries = existing
      ? row.state.combat.entries.map((entry) => (entry.tokenId === tokenId ? { ...entry, ...nextEntry } : entry))
      : [...row.state.combat.entries, nextEntry];
    const state = {
      ...row.state,
      combat: {
        ...row.state.combat,
        entries
      }
    };
    await tx
      .insert(sceneRevisions)
      .values({
        sceneId,
        version: row.version,
        state: row.state,
        command: { type: "initiative.submit", tokenId, initiative },
        actorId: actor.id,
        actorName: actor.name
      });
    const [updated] = await tx
      .update(scenes)
      .set({ state, version: row.version + 1, updatedAt: new Date() })
      .where(eq(scenes.id, sceneId))
      .returning();
    return toScene(updated);
  });
}

export async function rollSceneInitiative(
  actor: Actor,
  sceneId: string,
  tokenId: string,
  baseVersion: number,
  dexModifier: number,
  mode: "normal" | "advantage" | "disadvantage"
) {
  const first = randomInt(1, 21);
  const second = mode === "normal" ? first : randomInt(1, 21);
  const roll = mode === "advantage" ? Math.max(first, second) : mode === "disadvantage" ? Math.min(first, second) : first;
  return submitInitiative(actor, sceneId, tokenId, baseVersion, roll + dexModifier, dexModifier, {
    mode,
    roll,
    source: actor.role === "dm" ? "dm" : "app"
  });
}

export async function rollDice(actor: Actor, sceneId: string, expression: string, isPrivate: boolean) {
  if (actor.role === "player") {
    const player = await getPlayerById(actor.id);
    if (!player || player.destination.kind !== "scene" || player.destination.sceneId !== sceneId) {
      throw new DomainError("FORBIDDEN", "You are not active in that battle room.");
    }
  }
  if (!/^(?:[1-9]\d?|100)d(?:[2-9]|[1-9]\d{1,3})(?:\s*[+-]\s*\d{1,4})?$/.test(expression.replace(/\s/g, "")))
    throw new DomainError("INVALID_DICE", "Use up to 100 dice with 2–9999 sides and an optional modifier, such as 2d20+5.");
  const dice = new DiceRoll(expression);
  const total = Number(dice.total);
  const result = { output: dice.output, total };
  const [row] = await db
    .insert(diceRolls)
    .values({
      campaignId: actor.campaignId,
      sceneId,
      actorId: actor.id,
      actorName: actor.name,
      expression,
      result,
      total,
      private: isPrivate
    })
    .returning();
  return {
    id: row.id,
    actorId: actor.id,
    actorName: actor.name,
    expression,
    total,
    output: dice.output,
    private: isPrivate,
    createdAt: toIso(row.createdAt)
  };
}

export async function listDiceRolls(actor: Actor, sceneId: string, limit = 30) {
  const scene = await getScene(sceneId);
  if (!scene || scene.campaignId !== actor.campaignId)
    throw new DomainError("SCENE_NOT_FOUND", "Scene not found.");
  const rows = await db
    .select()
    .from(diceRolls)
    .where(
      and(
        eq(diceRolls.sceneId, sceneId),
        actor.role === "player" ? or(eq(diceRolls.private, false), eq(diceRolls.actorId, actor.id)) : undefined
      )
    )
    .orderBy(desc(diceRolls.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    expression: row.expression,
    total: row.total,
    output: typeof row.result.output === "string" ? row.result.output : `${row.expression} = ${row.total}`,
    private: row.private,
    createdAt: toIso(row.createdAt)
  }));
}

async function getPlayerById(playerId: string) {
  const [row] = await db
    .select()
    .from(campaignPlayers)
    .where(and(eq(campaignPlayers.id, playerId), isNull(campaignPlayers.removedAt)))
    .limit(1);
  return row ? toPlayer(row) : null;
}

function defaultAudioState(campaignId: string): AudioPlaybackState {
  return { campaignId, trackId: null, playing: false, positionMs: 0, startedAt: null, loop: true, revision: 0 };
}

function toAudioState(row: typeof campaignAudioState.$inferSelect): AudioPlaybackState {
  return {
    campaignId: row.campaignId,
    trackId: row.trackId,
    playing: row.playing,
    positionMs: row.positionMs,
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
    loop: row.loop,
    revision: row.revision
  };
}

export async function createAudioTrack(
  userId: string,
  campaignId: string,
  input: { title: string; assetId?: string | null; externalUrl?: string | null; provider?: string | null }
) {
  await ownedCampaign(userId, campaignId);
  if (input.assetId) {
    const [asset] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.id, input.assetId),
          eq(assets.ownerId, userId),
          eq(assets.campaignId, campaignId),
          eq(assets.kind, "audio")
        )
      )
      .limit(1);
    if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Choose an audio file from this campaign.");
  }
  const [track] = await db
    .insert(audioTracks)
    .values({ ...input, campaignId })
    .returning();
  return track;
}

export async function setAudioState(
  userId: string,
  campaignId: string,
  input: { trackId?: string | null; playing?: boolean; positionMs?: number; loop?: boolean }
) {
  await ownedCampaign(userId, campaignId);
  if (input.trackId) {
    const [track] = await db
      .select({ id: audioTracks.id })
      .from(audioTracks)
      .where(and(eq(audioTracks.id, input.trackId), eq(audioTracks.campaignId, campaignId)))
      .limit(1);
    if (!track) throw new DomainError("AUDIO_TRACK_NOT_FOUND", "That track is not part of this campaign.");
  }
  return db.transaction(async (tx) => {
    const [currentRow] = await tx
      .select()
      .from(campaignAudioState)
      .where(eq(campaignAudioState.campaignId, campaignId))
      .for("update")
      .limit(1);
    const current = currentRow ? toAudioState(currentRow) : defaultAudioState(campaignId);
    const now = new Date();
    const playing = input.playing ?? current.playing;
    const positionMs = input.positionMs ?? Math.floor(effectiveAudioPosition(current, now.getTime()));
    const trackId = input.trackId === undefined ? current.trackId : input.trackId;
    const loop = input.loop ?? current.loop;
    const [row] = await tx
      .insert(campaignAudioState)
      .values({
        campaignId,
        trackId,
        playing,
        positionMs,
        loop,
        startedAt: playing ? now : null,
        revision: current.revision + 1,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: campaignAudioState.campaignId,
        set: {
          trackId,
          playing,
          positionMs,
          loop,
          startedAt: playing ? now : null,
          revision: sql`${campaignAudioState.revision} + 1`,
          updatedAt: now
        }
      })
      .returning();
    return toAudioState(row);
  });
}
