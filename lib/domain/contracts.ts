import { z } from "zod";

const id = z.string().uuid();
const color = z.string().min(4).max(32);
const point = z.object({ x: z.number().finite(), y: z.number().finite() });

export const signInSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.-]{3,32}$/),
  password: z.string().min(1).max(512)
});

export const signUpSchema = signInSchema.extend({
  password: z.string().refine((value) => [...value].length >= 12 && [...value].length <= 128 && Boolean(value.trim()) && new TextEncoder().encode(value).length <= 512, "Use a password of 12–128 characters."),
  displayName: z.string().trim().min(2).max(48),
  color: color.default("#b83c52")
});

export const passwordResetSchema = z.object({
  resetCode: z.string().trim().min(8).max(128),
  password: z.string().min(12).max(128)
});

export const passwordResetCreateSchema = z.object({ userId: id });

export const dmProfilePatchSchema = z.object({
  displayName: z.string().trim().min(2).max(48).optional(),
  color: color.optional(),
  avatarAssetId: id.nullable().optional()
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default("")
});

export const campaignPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  joinEnabled: z.boolean().optional()
});

export const worldMapPatchSchema = z.object({
  backgroundAssetId: id.nullable().optional(),
  x: z.number().finite().min(-100_000).max(100_000).optional(),
  y: z.number().finite().min(-100_000).max(100_000).optional(),
  scale: z.number().finite().min(0.02).max(20).optional(),
  opacity: z.number().finite().min(0.05).max(1).optional()
});

export const assetUrlImportSchema = z.object({
  url: z.string().url().max(2_000),
  kind: z.enum(["avatar", "map", "token", "world"]),
  campaignId: id.nullable().optional()
});

export const playerJoinSchema = z.object({
  nickname: z.string().trim().min(2).max(40),
  color: color.optional(),
  character: z
    .object({
      name: z.string().trim().min(1).max(80),
      icon: z.string().trim().min(1).max(4)
    })
    .optional()
});

export const locationCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  revealed: z.boolean().default(false)
});

export const locationPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  revealed: z.boolean().optional()
});

export const connectionCreateSchema = z.object({
  sourceLocationId: id,
  targetLocationId: id,
  label: z.string().trim().max(80).default(""),
  revealed: z.boolean().default(false)
});

export const playerDestinationSchema = z.object({
  playerIds: z.array(id).min(1),
  destination: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("world") }),
    z.object({ kind: z.literal("scene"), sceneId: id })
  ])
});

const condition = z.object({
  id,
  key: z.string().trim().min(1).max(48),
  label: z.string().trim().min(1).max(48),
  icon: z.string().trim().min(1).max(48),
  color,
  durationRounds: z.number().int().min(1).max(999).nullable().optional(),
  animation: z.enum(["none", "pulse", "aura", "embers"])
});

const token = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(4),
  kind: z.enum(["character", "npc", "monster", "object"]),
  ownerId: id.nullable().optional(),
  ownerName: z.string().trim().max(80).nullable().optional(),
  assetId: id.nullable().optional(),
  color,
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  size: z.number().int().min(1).max(8),
  hp: z.string().trim().max(32).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  conditions: z.array(condition).max(24)
});

const drawing = z.object({
  id,
  kind: z.enum(["freehand", "wall"]),
  color,
  width: z.number().min(1).max(40),
  points: z.array(point).min(2).max(4000)
});

const effect = z.object({
  id,
  shape: z.enum(["circle", "cone", "cube", "line"]),
  label: z.string().trim().max(80),
  color,
  opacity: z.number().min(0.05).max(1),
  origin: point,
  target: point,
  sizeFeet: z.number().min(5).max(1_000),
  widthFeet: z.number().min(5).max(200).nullable().optional()
});

const gridPatch = z.object({
  kind: z.literal("square").optional(),
  rows: z.number().int().min(4).max(200).optional(),
  columns: z.number().int().min(4).max(200).optional(),
  cellSize: z.number().int().min(24).max(160).optional(),
  feetPerCell: z.number().int().min(1).max(100).optional(),
  color: z.string().max(64).optional(),
  backgroundColor: color.optional(),
  backgroundOpacity: z.number().min(0.05).max(1).optional(),
  showGrid: z.boolean().optional(),
  backgroundAssetId: id.nullable().optional(),
  calibration: z
    .object({
      originX: z.number().finite(),
      originY: z.number().finite(),
      pixelsPerCell: z.number().min(2).max(1000),
      imageScale: z.number().min(0.05).max(10),
      imageOffsetX: z.number().finite(),
      imageOffsetY: z.number().finite()
    })
    .nullable()
    .optional()
});

const combat = z.object({
  active: z.boolean(),
  phase: z.enum(["idle", "initiative", "active"]),
  round: z.number().int().min(1).max(9999),
  currentTurnIndex: z.number().int().min(0),
  startedAt: z.number().int().positive().nullable().optional(),
  entries: z
    .array(
      z.object({
        id,
        tokenId: id,
        name: z.string().trim().min(1).max(80),
        ownerId: id.nullable().optional(),
        ownerName: z.string().trim().max(80).nullable().optional(),
        dexModifier: z.number().int().min(-20).max(30),
        roll: z.number().int().min(1).max(20).nullable().optional(),
        total: z.number().int().min(-100).max(200),
        mode: z.enum(["manual", "normal", "advantage", "disadvantage"]),
        conditions: z.array(z.string().max(48)).max(24),
        submitted: z.boolean(),
        source: z.enum(["app", "manual", "dm"]).nullable().optional(),
        skipped: z.boolean().optional(),
        createdAt: z.number().int().positive()
      })
    )
    .max(200)
});

export const sceneCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token.create"), token }),
  z.object({ type: z.literal("token.move"), tokenId: id, x: z.number().int().min(0), y: z.number().int().min(0) }),
  z.object({
    type: z.literal("token.update"),
    tokenId: id,
    patch: token
      .pick({
        name: true,
        icon: true,
        kind: true,
        ownerId: true,
        ownerName: true,
        assetId: true,
        color: true,
        size: true,
        hp: true,
        note: true
      })
      .partial()
  }),
  z.object({ type: z.literal("token.delete"), tokenId: id }),
  z.object({ type: z.literal("condition.add"), tokenId: id, condition }),
  z.object({ type: z.literal("condition.remove"), tokenId: id, conditionId: id }),
  z.object({ type: z.literal("drawing.add"), drawing }),
  z.object({
    type: z.literal("drawing.update"),
    drawingId: id,
    patch: drawing.pick({ color: true, width: true, points: true }).partial()
  }),
  z.object({ type: z.literal("drawing.delete"), drawingId: id }),
  z.object({ type: z.literal("effect.add"), effect }),
  z.object({
    type: z.literal("effect.update"),
    effectId: id,
    patch: effect
      .pick({
        shape: true,
        label: true,
        color: true,
        opacity: true,
        origin: true,
        target: true,
        sizeFeet: true,
        widthFeet: true
      })
      .partial()
  }),
  z.object({ type: z.literal("effect.delete"), effectId: id }),
  z.object({ type: z.literal("build.clear") }),
  z.object({
    type: z.literal("build.restore"),
    drawings: z.array(drawing).max(2_000),
    effects: z.array(effect).max(500)
  }),
  z.object({ type: z.literal("grid.update"), patch: gridPatch }),
  z.object({ type: z.literal("combat.update"), combat })
]);

export const sceneCommandEnvelopeSchema = z.object({
  commandId: id,
  sceneId: id,
  baseVersion: z.number().int().min(0),
  command: sceneCommandSchema
});

export const diceRollSchema = z.object({
  campaignId: id,
  sceneId: id,
  expression: z.string().trim().min(1).max(80),
  private: z.boolean().default(false)
});

export const libraryItemCreateSchema = z.object({
  kind: z.enum(["token", "object", "effect"]),
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80).default("General"),
  visibility: z.enum(["private", "shared"]).default("private"),
  assetId: id.nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({})
});

export const libraryItemPatchSchema = libraryItemCreateSchema.partial();

export const initiativeSubmitSchema = z.object({
  campaignId: id,
  sceneId: id,
  tokenId: id,
  baseVersion: z.number().int().min(0),
  initiative: z.number().int().min(-100).max(200),
  dexModifier: z.number().int().min(-20).max(30).default(0)
});

export const initiativeRollSchema = z.object({
  campaignId: id,
  sceneId: id,
  tokenId: id,
  baseVersion: z.number().int().min(0),
  dexModifier: z.number().int().min(-20).max(30).default(0),
  mode: z.enum(["normal", "advantage", "disadvantage"]).default("normal")
});

export const audioTrackCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    assetId: id.nullable().optional(),
    externalUrl: z.string().url().max(2000).nullable().optional(),
    provider: z.string().trim().max(40).nullable().optional()
  })
  .refine((value) => Boolean(value.assetId || value.externalUrl), {
    message: "Choose an uploaded audio file or external link."
  });

export const audioStateSchema = z.object({
  trackId: id.nullable().optional(),
  playing: z.boolean().optional(),
  positionMs: z.number().int().min(0).optional(),
  loop: z.boolean().optional()
});
