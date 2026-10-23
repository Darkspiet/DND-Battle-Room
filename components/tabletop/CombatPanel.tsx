"use client";
import type { InitiativeRollMode } from "../../lib/types";
import { INITIATIVE_MODES, splitConditions } from "./model";
import type { CombatControls } from "./useCombat";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  combat: Pick<
    CombatControls,
    | "combatPhase"
    | "combat"
    | "startCombat"
    | "combatEntries"
    | "beginCombatRounds"
    | "advanceTurn"
    | "endCombat"
    | "activeEntry"
    | "submittedInitiativeCount"
    | "pendingCombatEntries"
    | "activeCombatTokenId"
    | "updateInitiativeEntry"
    | "rollInitiative"
    | "moveInitiativeEntry"
    | "removeInitiativeEntry"
    | "clearCombat"
    | "ownCombatEntries"
  >;
  connection: Pick<ReadyRoomConnection, "isDm" | "profile">;
};
export function CombatPanel({ combat: combatControls, connection }: Props) {
  const {
    combatPhase,
    combat,
    startCombat,
    combatEntries,
    beginCombatRounds,
    advanceTurn,
    endCombat,
    activeEntry,
    submittedInitiativeCount,
    pendingCombatEntries,
    activeCombatTokenId,
    updateInitiativeEntry,
    rollInitiative,
    moveInitiativeEntry,
    removeInitiativeEntry,
    clearCombat,
    ownCombatEntries,
  } = combatControls;
  const { isDm, profile } = connection;
  return (
    <section className="tool-card combat-panel">
      <div className="panel-heading">
        <h2>Combat Controls</h2>
        <span>
          {combatPhase === "active"
            ? `Round ${combat?.round}`
            : combatPhase === "initiative"
              ? "Rolling"
              : "Setup"}
        </span>
      </div>
      {isDm ? (
        <div className="combat-actions">
          <button
            className="primary-action compact"
            onClick={startCombat}
            type="button"
          >
            {combatPhase === "idle" ? "Start combat" : "Restart initiative"}
          </button>
          <button
            className="secondary-action compact"
            disabled={!combatEntries.length || combatPhase !== "initiative"}
            onClick={beginCombatRounds}
            type="button"
          >
            Begin round
          </button>
          <button
            className="secondary-action compact"
            disabled={!combatEntries.length || combatPhase !== "active"}
            onClick={() => advanceTurn(-1)}
            type="button"
          >
            Previous
          </button>
          <button
            className="secondary-action compact"
            disabled={!combatEntries.length || combatPhase !== "active"}
            onClick={() => advanceTurn(1)}
            type="button"
          >
            Next turn
          </button>
          <button
            className="secondary-action compact"
            disabled={combatPhase === "idle"}
            onClick={endCombat}
            type="button"
          >
            End combat
          </button>
        </div>
      ) : null}
      {combatPhase === "active" && activeEntry ? (
        <article className="active-turn-card">
          <span>Current turn</span>
          <strong>{activeEntry.name}</strong>
          <small>
            {activeEntry.total} initiative{" "}
            {activeEntry.conditions.length
              ? `· ${activeEntry.conditions.join(", ")}`
              : ""}
          </small>
        </article>
      ) : combatPhase === "initiative" ? (
        <article className="active-turn-card">
          <span>Initiative rolling</span>
          <strong>
            {submittedInitiativeCount}/{combatEntries.length} submitted
          </strong>
          <small>
            {pendingCombatEntries.length
              ? `${pendingCombatEntries.length} still waiting`
              : "Ready to begin the first round"}
          </small>
        </article>
      ) : (
        <p className="empty-state">
          Start combat or add tokens to build a turn order.
        </p>
      )}
      {combatEntries.length ? (
        <ol className="initiative-list combat-list">
          {combatEntries.map((entry, index) => {
            const canEditEntry = isDm || entry.ownerId === profile.id;
            return (
              <li
                className={
                  activeCombatTokenId === entry.tokenId ? "current" : ""
                }
                key={entry.id}
              >
                <div className="initiative-rank">{index + 1}</div>
                <div className="initiative-main">
                  <strong>{entry.name}</strong>
                  <small>{entry.ownerName}</small>
                  <div className="initiative-controls">
                    <label>
                      Mode
                      <select
                        disabled={!canEditEntry}
                        value={entry.mode}
                        onChange={(event) =>
                          updateInitiativeEntry(
                            entry.id,
                            { mode: event.target.value as InitiativeRollMode },
                            false,
                          )
                        }
                      >
                        {INITIATIVE_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Dex
                      <input
                        disabled={!canEditEntry}
                        type="number"
                        value={entry.dexModifier}
                        onChange={(event) =>
                          updateInitiativeEntry(entry.id, {
                            dexModifier: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Total
                      <input
                        disabled={!canEditEntry}
                        type="number"
                        value={entry.total}
                        onChange={(event) =>
                          updateInitiativeEntry(entry.id, {
                            mode: "manual",
                            roll: Number(event.target.value),
                            total: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Conditions
                    <input
                      disabled={!canEditEntry}
                      placeholder="blessed, prone"
                      value={entry.conditions.join(", ")}
                      onChange={(event) =>
                        updateInitiativeEntry(
                          entry.id,
                          { conditions: splitConditions(event.target.value) },
                          false,
                        )
                      }
                    />
                  </label>
                </div>
                <div className="initiative-actions">
                  <button
                    disabled={!canEditEntry || entry.mode === "manual"}
                    onClick={() => rollInitiative(entry.id)}
                    type="button"
                  >
                    Roll
                  </button>
                  {isDm ? (
                    <>
                      <button
                        disabled={index === 0}
                        onClick={() => moveInitiativeEntry(entry.id, -1)}
                        type="button"
                      >
                        Up
                      </button>
                      <button
                        disabled={index === combatEntries.length - 1}
                        onClick={() => moveInitiativeEntry(entry.id, 1)}
                        type="button"
                      >
                        Down
                      </button>
                      <button
                        onClick={() => removeInitiativeEntry(entry.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {isDm ? (
        <button
          className="secondary-action compact danger"
          disabled={!combatEntries.length}
          onClick={clearCombat}
          type="button"
        >
          Clear initiative
        </button>
      ) : ownCombatEntries.length ? (
        <p className="empty-state">
          Your position is shown in the turn order. The DM controls turn
          advancement.
        </p>
      ) : (
        <p className="empty-state">
          Ask the DM to add your token to initiative.
        </p>
      )}
    </section>
  );
}
