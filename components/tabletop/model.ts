import type {
  AreaEffectShape,
  CombatPhase,
  InitiativeEntry,
  InitiativeRollMode,
  RoomState,
  TokenType,
} from "../../lib/types";
export const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
export const TOKEN_TYPES: TokenType[] = [
  "character",
  "npc",
  "monster",
  "object",
];
export const BUILD_COLORS = [
  "#111827",
  "#b7394b",
  "#2563eb",
  "#227447",
  "#eab308",
  "#7c3aed",
  "#f97316",
  "#ffffff",
];
export const EFFECT_SHAPES: AreaEffectShape[] = [
  "circle",
  "cone",
  "cube",
  "line",
];
export const QUICK_EFFECT_SIZES = [5, 10, 15, 20, 30, 60];
export const INITIATIVE_MODES: InitiativeRollMode[] = [
  "normal",
  "advantage",
  "disadvantage",
  "manual",
];
export const DEFAULT_BACKGROUND_IMAGE_SETTINGS = {
  positionX: 0,
  positionY: 0,
  scale: 100,
  opacity: 100,
};
export type RoomMode = "play" | "combat" | "build" | "library";
export type BuildTool = "draw" | "wall" | "effects" | "background";
export type BuildUndo = (current: RoomState) => RoomState;
export type BoardPoint = {
  x: number;
  y: number;
};
export type SelectedBuildObject = {
  type: "wall" | "effect";
  id: string;
} | null;
export type BuildObjectDrag =
  | {
      type: "wall";
      id: string;
      start: BoardPoint;
      points: BoardPoint[];
      moved: boolean;
    }
  | {
      type: "effect";
      id: string;
      start: BoardPoint;
      origin: BoardPoint;
      target: BoardPoint;
      moved: boolean;
    };
export type TokenMovePayload = {
  tokenId: string;
  x: number;
  y: number;
  seq: number;
};
export function roomApiPath(roomCode: string) {
  return `../../api/rooms/${roomCode}`;
}
export function roomWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
export function normalizeRoomState(room: RoomState): RoomState {
  const combat = room.combat ?? {
    active: false,
    phase: "idle" as CombatPhase,
    round: 1,
    currentTurnIndex: 0,
    entries: (room.initiative ?? []).map((entry, index) => {
      const token = room.tokens.find((item) => item.id === entry.tokenId);
      return {
        id: entry.id,
        tokenId: entry.tokenId,
        name: entry.name,
        ownerId: token?.ownerId ?? room.dmId,
        ownerName: token?.ownerName ?? "DM",
        dexModifier: 0,
        roll: entry.score,
        total: entry.score,
        mode: "manual" as InitiativeRollMode,
        conditions: [],
        submitted: true,
        source: "manual" as const,
        createdAt: room.createdAt + index,
      };
    }),
  };
  return {
    ...room,
    effects: room.effects ?? [],
    combat: {
      active: combat.active,
      phase: (combat.phase ??
        (combat.active ? "active" : "idle")) as CombatPhase,
      round: combat.round || 1,
      currentTurnIndex: Math.max(
        0,
        Math.min(
          combat.currentTurnIndex ?? 0,
          Math.max(0, combat.entries.length - 1),
        ),
      ),
      entries: combat.entries.map((entry, index) => ({
        ...entry,
        ownerId:
          entry.ownerId ??
          room.tokens.find((token) => token.id === entry.tokenId)?.ownerId ??
          room.dmId,
        ownerName:
          entry.ownerName ??
          room.tokens.find((token) => token.id === entry.tokenId)?.ownerName ??
          "DM",
        dexModifier: entry.dexModifier ?? 0,
        total: entry.total ?? entry.roll ?? 0,
        mode: entry.mode ?? "manual",
        conditions: entry.conditions ?? [],
        submitted:
          entry.submitted ?? (entry.roll !== undefined || entry.total > 0),
        source: entry.source,
        createdAt: entry.createdAt ?? room.createdAt + index,
      })),
    },
  };
}
export function sortInitiativeEntries(entries: InitiativeEntry[]) {
  return [...entries].sort(
    (a, b) =>
      b.total - a.total ||
      b.dexModifier - a.dexModifier ||
      a.createdAt - b.createdAt,
  );
}
export function splitConditions(input: string) {
  return input
    .split(",")
    .map((condition) => condition.trim())
    .filter(Boolean);
}
