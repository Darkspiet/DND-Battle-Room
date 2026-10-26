import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type { SceneState } from "../lib/domain/types";

export const accountRole = pgEnum("account_role", ["dm"]);
export const assetKind = pgEnum("asset_kind", ["avatar", "map", "token", "audio", "world"]);
export const libraryVisibility = pgEnum("library_visibility", ["private", "shared"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    role: accountRole("role").notNull().default("dm"),
    color: text("color").notNull().default("#b83c52"),
    avatarAssetId: uuid("avatar_asset_id"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("users_username_idx").on(table.username)]
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId, table.expiresAt)]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_idx").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId, table.expiresAt)
  ]
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    joinCode: text("join_code").notNull(),
    joinEnabled: boolean("join_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("campaigns_join_code_idx").on(table.joinCode),
    index("campaigns_owner_updated_idx").on(table.ownerId, table.updatedAt)
  ]
);

export const scenes = pgTable(
  "scenes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    state: jsonb("state").$type<SceneState>().notNull(),
    version: bigint("version", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("scenes_campaign_updated_idx").on(table.campaignId, table.updatedAt)]
);

export const sceneRevisions = pgTable(
  "scene_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    version: bigint("version", { mode: "number" }).notNull(),
    commandId: uuid("command_id"),
    scope: text("scope").notNull().default("scene"),
    state: jsonb("state").$type<SceneState>().notNull(),
    command: jsonb("command").$type<Record<string, unknown>>().notNull(),
    inverseCommand: jsonb("inverse_command").$type<Record<string, unknown>>(),
    actorId: uuid("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("scene_revisions_scene_version_idx").on(table.sceneId, table.version),
    uniqueIndex("scene_revisions_command_id_idx").on(table.commandId)
  ]
);

export const campaignPlayers = pgTable(
  "campaign_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    color: text("color").notNull(),
    avatarAssetId: uuid("avatar_asset_id"),
    destinationSceneId: uuid("destination_scene_id").references(() => scenes.id, { onDelete: "set null" }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("campaign_players_campaign_idx").on(table.campaignId, table.lastSeenAt)]
);

export const playerSessions = pgTable(
  "player_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => campaignPlayers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("player_sessions_player_idx").on(table.playerId, table.expiresAt)]
);

export const worldLocations = pgTable(
  "world_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    revealed: boolean("revealed").notNull().default(false),
    thumbnailAssetId: uuid("thumbnail_asset_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("world_locations_campaign_idx").on(table.campaignId),
    uniqueIndex("world_locations_scene_idx").on(table.sceneId)
  ]
);

export const worldConnections = pgTable(
  "world_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => worldLocations.id, { onDelete: "cascade" }),
    targetLocationId: uuid("target_location_id")
      .notNull()
      .references(() => worldLocations.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    revealed: boolean("revealed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("world_connections_campaign_idx").on(table.campaignId)]
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: assetKind("kind").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("assets_storage_key_idx").on(table.storageKey), index("assets_campaign_idx").on(table.campaignId)]
);

export const campaignWorldSettings = pgTable("campaign_world_settings", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  backgroundAssetId: uuid("background_asset_id").references(() => assets.id, { onDelete: "set null" }),
  x: real("x").notNull().default(0),
  y: real("y").notNull().default(0),
  scale: real("scale").notNull().default(1),
  opacity: real("opacity").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: libraryVisibility("visibility").notNull().default("private"),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("library_items_owner_visibility_idx").on(table.ownerId, table.visibility)]
);

export const audioTracks = pgTable(
  "audio_tracks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    externalUrl: text("external_url"),
    provider: text("provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("audio_tracks_campaign_idx").on(table.campaignId)]
);

export const campaignAudioState = pgTable("campaign_audio_state", {
  campaignId: uuid("campaign_id")
    .primaryKey()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  trackId: uuid("track_id").references(() => audioTracks.id, { onDelete: "set null" }),
  playing: boolean("playing").notNull().default(false),
  positionMs: integer("position_ms").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  loop: boolean("loop").notNull().default(true),
  revision: bigint("revision", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const diceRolls = pgTable(
  "dice_rolls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    expression: text("expression").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    total: integer("total").notNull(),
    private: boolean("private").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("dice_rolls_scene_created_idx").on(table.sceneId, table.createdAt)]
);
