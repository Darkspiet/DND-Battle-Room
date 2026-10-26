import { describe, expect, it } from "vitest";
import { createDefaultSceneState } from "../../lib/domain/defaults";
import { applySceneCommand, authorizeSceneCommand, DomainError, inverseSceneCommand, sceneCommandScope } from "../../lib/domain/sceneReducer";
import type { Actor, SceneToken } from "../../lib/domain/types";

const dm: Actor = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "DM",
  role: "dm",
  campaignId: "00000000-0000-4000-8000-000000000010"
};
const player: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Player",
  role: "player",
  campaignId: dm.campaignId
};
const token: SceneToken = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "Rook",
  icon: "R",
  kind: "character",
  ownerId: player.id,
  color: "#b83c52",
  x: 2,
  y: 3,
  size: 1,
  conditions: []
};

describe("scene reducer", () => {
  it("lets a player move only their assigned token", () => {
    const state = { ...createDefaultSceneState(), tokens: [token] };
    expect(() =>
      authorizeSceneCommand(player, state, { type: "token.move", tokenId: token.id, x: 4, y: 5 })
    ).not.toThrow();
    expect(() =>
      authorizeSceneCommand({ ...player, id: dm.id }, state, { type: "token.move", tokenId: token.id, x: 4, y: 5 })
    ).toThrow(DomainError);
    expect(() => authorizeSceneCommand(player, state, { type: "token.delete", tokenId: token.id })).not.toThrow();
  });

  it("clamps movement to the board", () => {
    const state = { ...createDefaultSceneState(), tokens: [{ ...token, size: 2 }] };
    const moved = applySceneCommand(state, { type: "token.move", tokenId: token.id, x: 999, y: 999 });
    expect(moved.tokens[0]).toMatchObject({ x: state.grid.columns - 2, y: state.grid.rows - 2 });
  });

  it("replaces duplicate condition keys", () => {
    const state = { ...createDefaultSceneState(), tokens: [token] };
    const first = applySceneCommand(state, {
      type: "condition.add",
      tokenId: token.id,
      condition: {
        id: "00000000-0000-4000-8000-000000000004",
        key: "poisoned",
        label: "Poisoned",
        icon: "Flask",
        color: "#44aa55",
        animation: "embers"
      }
    });
    const second = applySceneCommand(first, {
      type: "condition.add",
      tokenId: token.id,
      condition: {
        id: "00000000-0000-4000-8000-000000000005",
        key: "poisoned",
        label: "Venom",
        icon: "Flask",
        color: "#55bb66",
        animation: "pulse"
      }
    });
    expect(second.tokens[0].conditions).toHaveLength(1);
    expect(second.tokens[0].conditions[0].label).toBe("Venom");
  });

  it("allows every validated scene command for the DM", () => {
    expect(() =>
      authorizeSceneCommand(dm, createDefaultSceneState(), { type: "grid.update", patch: { rows: 20 } })
    ).not.toThrow();
  });

  it("creates build-only inverse commands without restoring unrelated scene state", () => {
    const state = { ...createDefaultSceneState(), tokens: [token] };
    const drawing = {
      id: "00000000-0000-4000-8000-000000000006",
      kind: "wall" as const,
      color: "#ffffff",
      width: 6,
      points: [{ x: 0, y: 0 }, { x: 64, y: 0 }]
    };
    const command = { type: "drawing.add" as const, drawing };
    const changed = applySceneCommand(state, command);
    const inverse = inverseSceneCommand(state, command);
    expect(sceneCommandScope(command)).toBe("build");
    expect(inverse).not.toBeNull();
    const restored = applySceneCommand({ ...changed, tokens: [{ ...token, name: "Changed later" }] }, inverse!);
    expect(restored.drawings).toEqual([]);
    expect(restored.tokens[0].name).toBe("Changed later");
  });
});
