"use client";
import { useState } from "react";
import { createUuid } from "../../lib/domain/id";
import type { Actor, SceneCommand, SceneToken } from "../../lib/domain/types";
export function PlayerTokenControls({ actor, tokens, disabled, onCommand }: {
  actor: Actor; tokens: SceneToken[]; disabled: boolean; onCommand: (command: SceneCommand) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(command: SceneCommand) {
    setBusy(true); setError("");
    try { await onCommand(command); } catch { setError("Could not save your token. Reconnect and try again."); }
    finally { setBusy(false); }
  }
  return <details className="player-token-controls">
    <summary>My tokens</summary>
    <div className="stack-form">
      <button disabled={disabled || busy} className="button secondary-button" type="button" onClick={() => void submit({ type: "token.create", token: { id: createUuid(), name: "New token", icon: "⚔", kind: "character", ownerId: actor.id, ownerName: actor.name, color: "#b83c52", x: 1, y: 1, size: 1, conditions: [] } })}>Create token</button>
      {tokens.filter((token) => token.ownerId === actor.id).map((token) => <form key={token.id + token.name + token.hp + token.note} className="stack-form" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void submit({ type: "token.update", tokenId: token.id, patch: { name: String(data.get("name")), hp: String(data.get("hp")), note: String(data.get("note")) } });
      }}>
        <label>Token name<input name="name" defaultValue={token.name} maxLength={80} required /></label>
        <label>HP / status<input name="hp" defaultValue={token.hp ?? ""} maxLength={32} /></label>
        <label>Note<input name="note" defaultValue={token.note ?? ""} maxLength={500} /></label>
        <button disabled={disabled || busy} className="button secondary-button" type="submit">Save token</button>
        <button disabled={disabled || busy} className="button ghost-button" type="button" onClick={() => void submit({ type: "token.delete", tokenId: token.id })}>Delete {token.name}</button>
      </form>)}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}
