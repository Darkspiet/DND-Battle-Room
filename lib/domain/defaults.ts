import type { SceneState, TokenCondition } from "./types";
import { createUuid } from "./id";

export const PLAYER_COLORS = ["#d85b6a", "#2fa66d", "#4d86e8", "#d8a33d", "#9b72e8", "#22a7a7"];

export const CONDITION_PRESETS: Omit<TokenCondition, "id">[] = [
  { key: "blinded", label: "Blinded", icon: "EyeOff", color: "#8d99a8", animation: "aura" },
  { key: "charmed", label: "Charmed", icon: "Heart", color: "#df6fa8", animation: "pulse" },
  { key: "frightened", label: "Frightened", icon: "Skull", color: "#8066c7", animation: "pulse" },
  { key: "grappled", label: "Grappled", icon: "Link", color: "#b7864b", animation: "aura" },
  { key: "invisible", label: "Invisible", icon: "Ghost", color: "#7bc4c9", animation: "aura" },
  { key: "paralyzed", label: "Paralyzed", icon: "Pause", color: "#e2b94f", animation: "pulse" },
  { key: "poisoned", label: "Poisoned", icon: "FlaskConical", color: "#62a85a", animation: "embers" },
  { key: "prone", label: "Prone", icon: "ArrowDownToLine", color: "#c47d4c", animation: "none" },
  { key: "restrained", label: "Restrained", icon: "Unplug", color: "#b27254", animation: "aura" },
  { key: "stunned", label: "Stunned", icon: "Zap", color: "#e0b83d", animation: "pulse" },
  { key: "unconscious", label: "Unconscious", icon: "Moon", color: "#6f7783", animation: "none" },
  { key: "concentration", label: "Concentration", icon: "Brain", color: "#4c91d9", animation: "pulse" }
];

export function createDefaultSceneState(): SceneState {
  return {
    grid: {
      kind: "square",
      rows: 18,
      columns: 26,
      cellSize: 64,
      feetPerCell: 5,
      color: "rgba(235, 226, 205, 0.26)",
      backgroundColor: "#11151b",
      backgroundOpacity: 0.96,
      showGrid: true,
      backgroundAssetId: null,
      calibration: null
    },
    tokens: [],
    drawings: [],
    effects: [],
    combat: {
      active: false,
      phase: "idle",
      round: 1,
      currentTurnIndex: 0,
      entries: []
    }
  };
}

export function createCondition(preset: Omit<TokenCondition, "id">): TokenCondition {
  return { ...preset, id: createUuid() };
}
