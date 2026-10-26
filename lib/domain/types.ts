export type AccountRole = "dm";
export type ActorRole = "dm" | "player";
export type AssetKind = "avatar" | "map" | "token" | "audio" | "world";
export type LibraryVisibility = "private" | "shared";
export type GridKind = "square";
export type TokenKind = "character" | "npc" | "monster" | "object";

export type DMUser = {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  color: string;
  avatarAssetId?: string | null;
};

export type PlayerDestination = { kind: "world" } | { kind: "scene"; sceneId: string };

export type CampaignPlayer = {
  id: string;
  campaignId: string;
  nickname: string;
  color: string;
  avatarAssetId?: string | null;
  destination: PlayerDestination;
  joinedAt: string;
  lastSeenAt: string;
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  joinCode: string;
  joinEnabled: boolean;
  ownerId: string;
  sceneCount: number;
  playerCount: number;
  updatedAt: string;
};

export type WorldLocation = {
  id: string;
  campaignId: string;
  sceneId: string;
  name: string;
  description: string;
  x: number;
  y: number;
  revealed: boolean;
  thumbnailAssetId?: string | null;
};

export type WorldConnection = {
  id: string;
  campaignId: string;
  sourceLocationId: string;
  targetLocationId: string;
  label: string;
  revealed: boolean;
};

export type WorldMapSettings = {
  campaignId: string;
  backgroundAssetId?: string | null;
  x: number;
  y: number;
  scale: number;
  opacity: number;
};

export type GridCalibration = {
  originX: number;
  originY: number;
  pixelsPerCell: number;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
};

export type SceneGrid = {
  kind: GridKind;
  rows: number;
  columns: number;
  cellSize: number;
  feetPerCell: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  showGrid: boolean;
  backgroundAssetId?: string | null;
  calibration?: GridCalibration | null;
};

export type ConditionAnimation = "none" | "pulse" | "aura" | "embers";

export type TokenCondition = {
  id: string;
  key: string;
  label: string;
  icon: string;
  color: string;
  durationRounds?: number | null;
  animation: ConditionAnimation;
};

export type SceneToken = {
  id: string;
  name: string;
  icon: string;
  kind: TokenKind;
  ownerId?: string | null;
  ownerName?: string | null;
  assetId?: string | null;
  color: string;
  x: number;
  y: number;
  size: number;
  hp?: string | null;
  note?: string | null;
  /** Stored only on the server; projected out of every player response. */
  dmNote?: string | null;
  hpPrivate?: boolean;
  conditions: TokenCondition[];
};

export type SceneDrawing = {
  id: string;
  kind: "freehand" | "wall";
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

export type SceneEffect = {
  id: string;
  shape: "circle" | "cone" | "cube" | "line";
  label: string;
  color: string;
  opacity: number;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  sizeFeet: number;
  widthFeet?: number | null;
};

export type InitiativeRollMode = "manual" | "normal" | "advantage" | "disadvantage";
export type CombatPhase = "idle" | "initiative" | "active";
export type InitiativeSource = "app" | "manual" | "dm";

export type InitiativeEntry = {
  id: string;
  tokenId: string;
  name: string;
  ownerId?: string | null;
  ownerName?: string | null;
  dexModifier: number;
  roll?: number | null;
  total: number;
  mode: InitiativeRollMode;
  conditions: string[];
  submitted: boolean;
  source?: InitiativeSource | null;
  skipped?: boolean;
  createdAt: number;
};

export type SceneCombat = {
  active: boolean;
  phase: CombatPhase;
  round: number;
  currentTurnIndex: number;
  entries: InitiativeEntry[];
  startedAt?: number | null;
};

export type SceneState = {
  grid: SceneGrid;
  tokens: SceneToken[];
  drawings: SceneDrawing[];
  effects: SceneEffect[];
  combat: SceneCombat;
};

export type SceneRecord = {
  id: string;
  campaignId: string;
  name: string;
  version: number;
  state: SceneState;
  updatedAt: string;
};

export type AudioTrack = {
  id: string;
  campaignId: string;
  title: string;
  assetId?: string | null;
  externalUrl?: string | null;
  provider?: string | null;
};

export type AudioPlaybackState = {
  campaignId: string;
  trackId?: string | null;
  playing: boolean;
  positionMs: number;
  startedAt?: string | null;
  loop: boolean;
  revision: number;
};

export type SceneCommand =
  | { type: "token.create"; token: SceneToken }
  | { type: "token.move"; tokenId: string; x: number; y: number }
  | {
      type: "token.update";
      tokenId: string;
      patch: Partial<
        Pick<SceneToken, "name" | "icon" | "kind" | "ownerId" | "ownerName" | "assetId" | "color" | "size" | "hp" | "note">
      >;
    }
  | { type: "token.delete"; tokenId: string }
  | { type: "condition.add"; tokenId: string; condition: TokenCondition }
  | { type: "condition.remove"; tokenId: string; conditionId: string }
  | { type: "drawing.add"; drawing: SceneDrawing }
  | { type: "drawing.update"; drawingId: string; patch: Partial<Pick<SceneDrawing, "color" | "width" | "points">> }
  | { type: "drawing.delete"; drawingId: string }
  | { type: "effect.add"; effect: SceneEffect }
  | {
      type: "effect.update";
      effectId: string;
      patch: Partial<
        Pick<SceneEffect, "shape" | "label" | "color" | "opacity" | "origin" | "target" | "sizeFeet" | "widthFeet">
      >;
    }
  | { type: "effect.delete"; effectId: string }
  | { type: "build.clear" }
  | { type: "build.restore"; drawings: SceneDrawing[]; effects: SceneEffect[] }
  | { type: "grid.update"; patch: Partial<SceneGrid> }
  | { type: "combat.update"; combat: SceneCombat };

export type Actor = {
  id: string;
  name: string;
  role: ActorRole;
  campaignId: string;
};

export type LibraryItem = {
  id: string;
  ownerId: string;
  visibility: LibraryVisibility;
  kind: "token" | "object" | "effect";
  name: string;
  category: string;
  assetId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DiceRollRecord = {
  id: string;
  actorId: string;
  actorName: string;
  expression: string;
  total: number;
  output: string;
  private: boolean;
  createdAt: string;
};

export type AssetRecord = {
  id: string;
  kind: AssetKind;
  campaignId?: string | null;
  ownerId: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  storageKey: string;
  createdAt: string;
};
