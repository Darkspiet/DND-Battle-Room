export type Role = "dm" | "player";

export type GuestProfile = {
  id: string;
  nickname: string;
  color: string;
  avatarUrl?: string;
  avatarName?: string;
};

export type RoomMember = GuestProfile & {
  role: Role;
  joinedAt: number;
  lastSeen: number;
};

export type GridSettings = {
  rows: number;
  columns: number;
  cellSize: number;
  background: string;
  feetPerCell?: number;
  backgroundImage?: BattleMapBackground;
};

export type BattleMapBackground = {
  source: "upload" | "url";
  imageUrl: string;
  imageName?: string;
  positionX: number;
  positionY: number;
  scale: number;
  opacity: number;
};

export type TokenType = "character" | "npc" | "monster" | "object";

export type Token = {
  id: string;
  name: string;
  icon: string;
  imageUrl?: string;
  imageName?: string;
  ownerId: string;
  ownerName: string;
  color: string;
  type: TokenType;
  x: number;
  y: number;
  size: number;
  hp?: string;
  note?: string;
  hpPrivate?: boolean;
};

export type DMRoomSummary = {
  id: string;
  roomCode: string;
  name: string;
  dmUserId: string;
  createdAt: number;
  updatedAt: number;
};

export type LibraryItemKind = "token" | "object";

export type LibraryItem = {
  id: string;
  kind: LibraryItemKind;
  name: string;
  category: string;
  icon: string;
  imageUrl?: string;
  imageName?: string;
  tokenType: TokenType;
  size: number;
  hp?: string;
  note?: string;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
};

export type DrawingLine = {
  id: string;
  kind?: "freehand" | "wall";
  ownerId: string;
  color: string;
  points: Array<{ x: number; y: number }>;
};

export type AreaEffectShape = "circle" | "cone" | "cube" | "line";

export type AreaEffectTemplate = {
  id: string;
  shape: AreaEffectShape;
  ownerId: string;
  color: string;
  opacity: number;
  label?: string;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  sizeFeet: number;
  widthFeet?: number;
  createdAt: number;
};

export type DiceRoll = {
  id: string;
  userId: string;
  userName: string;
  expression: string;
  total: number;
  parts: string;
  private: boolean;
  createdAt: number;
};

export type InitiativeRollMode = "manual" | "normal" | "advantage" | "disadvantage";
export type CombatPhase = "idle" | "initiative" | "active";
export type InitiativeSource = "app" | "manual" | "dm";

export type InitiativeEntry = {
  id: string;
  tokenId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  dexModifier: number;
  roll?: number;
  total: number;
  mode: InitiativeRollMode;
  conditions: string[];
  submitted: boolean;
  submittedAt?: number;
  submittedBy?: string;
  source?: InitiativeSource;
  skipped?: boolean;
  createdAt: number;
};

export type LegacyInitiativeEntry = {
  id: string;
  tokenId: string;
  name: string;
  score: number;
};

export type CombatState = {
  active: boolean;
  phase: CombatPhase;
  round: number;
  currentTurnIndex: number;
  entries: InitiativeEntry[];
  startedAt?: number;
};

export type RoomState = {
  revision: number;
  roomCode: string;
  createdAt: number;
  dmId: string;
  members: RoomMember[];
  grid: GridSettings;
  tokens: Token[];
  drawings: DrawingLine[];
  effects: AreaEffectTemplate[];
  rolls: DiceRoll[];
  combat: CombatState;
  initiative?: LegacyInitiativeEntry[];
};
