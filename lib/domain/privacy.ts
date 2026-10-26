import type { Actor, SceneRecord } from "./types";

/** Every scene leaving the server must pass through this projection. */
export function sceneForActor(scene: SceneRecord, actor: Actor): SceneRecord {
  return { ...scene, state: { ...scene.state, tokens: scene.state.tokens.map((token) => {
    if (actor.role === "dm") return { ...token, note: token.dmNote ?? token.note };
    const { dmNote: _dmNote, hpPrivate, ...visible } = token;
    void _dmNote;
    if (!token.ownerId) return { ...visible, note: null, hp: null };
    if (hpPrivate && token.ownerId !== actor.id) return { ...visible, hp: null };
    return visible;
  }) } };
}
