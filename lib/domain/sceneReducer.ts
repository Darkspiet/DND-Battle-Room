import type { Actor, SceneCommand, SceneState } from "./types";

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function findToken(state: SceneState, tokenId: string) {
  const token = state.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new DomainError("TOKEN_NOT_FOUND", "That token no longer exists.");
  return token;
}

export function authorizeSceneCommand(actor: Actor, state: SceneState, command: SceneCommand) {
  if (actor.role === "dm") return;
  if (command.type === "token.create") {
    if (command.token.ownerId !== actor.id || command.token.ownerName !== actor.name)
      throw new DomainError("FORBIDDEN", "New tokens must belong to your guest session.");
    return;
  }
  if (!["token.move", "token.update", "token.delete", "condition.add", "condition.remove"].includes(command.type) || !("tokenId" in command))
    throw new DomainError("FORBIDDEN", "Only the DM can change that part of the scene.");
  const token = findToken(state, command.tokenId);
  if (token.ownerId !== actor.id) throw new DomainError("FORBIDDEN", "You can only change your own tokens.");
  if (command.type === "token.update" && ("ownerId" in command.patch || "ownerName" in command.patch))
    throw new DomainError("FORBIDDEN", "Only the DM can reassign tokens.");
}

export function sceneCommandScope(command: SceneCommand): "build" | "scene" {
  return command.type.startsWith("drawing.") ||
    command.type.startsWith("effect.") ||
    command.type.startsWith("build.") ||
    command.type === "grid.update"
    ? "build"
    : "scene";
}

export function inverseSceneCommand(state: SceneState, command: SceneCommand): SceneCommand | null {
  switch (command.type) {
    case "drawing.add":
      return { type: "drawing.delete", drawingId: command.drawing.id };
    case "drawing.update": {
      const drawing = state.drawings.find((candidate) => candidate.id === command.drawingId);
      return drawing
        ? {
            type: "drawing.update",
            drawingId: drawing.id,
            patch: { color: drawing.color, width: drawing.width, points: drawing.points }
          }
        : null;
    }
    case "drawing.delete": {
      const drawing = state.drawings.find((candidate) => candidate.id === command.drawingId);
      return drawing ? { type: "drawing.add", drawing } : null;
    }
    case "effect.add":
      return { type: "effect.delete", effectId: command.effect.id };
    case "effect.update": {
      const effect = state.effects.find((candidate) => candidate.id === command.effectId);
      return effect ? { type: "effect.update", effectId: effect.id, patch: { ...effect } } : null;
    }
    case "effect.delete": {
      const effect = state.effects.find((candidate) => candidate.id === command.effectId);
      return effect ? { type: "effect.add", effect } : null;
    }
    case "build.clear":
      return { type: "build.restore", drawings: state.drawings, effects: state.effects };
    case "build.restore":
      return { type: "build.restore", drawings: state.drawings, effects: state.effects };
    case "grid.update": {
      const patch = Object.fromEntries(
        Object.keys(command.patch).map((key) => [key, state.grid[key as keyof SceneState["grid"]]])
      ) as Partial<SceneState["grid"]>;
      return { type: "grid.update", patch };
    }
    default:
      return null;
  }
}

export function applySceneCommand(state: SceneState, command: SceneCommand): SceneState {
  switch (command.type) {
    case "token.create":
      if (state.tokens.some((token) => token.id === command.token.id)) throw new DomainError("CONFLICT", "That token already exists.");
      return { ...state, tokens: [...state.tokens, command.token] };
    case "token.move": {
      const token = findToken(state, command.tokenId);
      const x = Math.max(0, Math.min(state.grid.columns - token.size, command.x));
      const y = Math.max(0, Math.min(state.grid.rows - token.size, command.y));
      return { ...state, tokens: state.tokens.map((candidate) => candidate.id === token.id ? { ...candidate, x, y } : candidate) };
    }
    case "token.update":
      findToken(state, command.tokenId);
      return { ...state, tokens: state.tokens.map((token) => token.id === command.tokenId ? { ...token, ...command.patch } : token) };
    case "token.delete":
      return {
        ...state,
        tokens: state.tokens.filter((token) => token.id !== command.tokenId),
        combat: { ...state.combat, entries: state.combat.entries.filter((entry) => entry.tokenId !== command.tokenId) }
      };
    case "condition.add":
      findToken(state, command.tokenId);
      return {
        ...state,
        tokens: state.tokens.map((token) => token.id === command.tokenId
          ? { ...token, conditions: [...token.conditions.filter((condition) => condition.key !== command.condition.key), command.condition] }
          : token)
      };
    case "condition.remove":
      return {
        ...state,
        tokens: state.tokens.map((token) => token.id === command.tokenId
          ? { ...token, conditions: token.conditions.filter((condition) => condition.id !== command.conditionId) }
          : token)
      };
    case "drawing.add":
      return { ...state, drawings: [...state.drawings, command.drawing] };
    case "drawing.update":
      return {
        ...state,
        drawings: state.drawings.map((drawing) =>
          drawing.id === command.drawingId ? { ...drawing, ...command.patch } : drawing
        )
      };
    case "drawing.delete":
      return { ...state, drawings: state.drawings.filter((drawing) => drawing.id !== command.drawingId) };
    case "effect.add":
      return { ...state, effects: [...state.effects, command.effect] };
    case "effect.update":
      return {
        ...state,
        effects: state.effects.map((effect) =>
          effect.id === command.effectId ? { ...effect, ...command.patch } : effect
        )
      };
    case "effect.delete":
      return { ...state, effects: state.effects.filter((effect) => effect.id !== command.effectId) };
    case "build.clear":
      return { ...state, drawings: [], effects: [] };
    case "build.restore":
      return { ...state, drawings: command.drawings, effects: command.effects };
    case "grid.update":
      return { ...state, grid: { ...state.grid, ...command.patch } };
    case "combat.update":
      return { ...state, combat: command.combat };
  }
}
