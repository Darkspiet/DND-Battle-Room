"use client";
import type { InitiativeRollMode } from "../../lib/types";
import type { CombatControls } from "./useCombat";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  combat: Pick<
    CombatControls,
    | "initiativePromptEntry"
    | "updateInitiativeEntry"
    | "initiativeRollingId"
    | "rollInitiative"
    | "initiativeManualValues"
    | "setInitiativeManualValues"
    | "submitManualInitiative"
    | "submittedInitiativeCount"
    | "pendingCombatEntries"
    | "combatEntries"
    | "beginCombatRounds"
  >;
  connection: Pick<ReadyRoomConnection, "isDm">;
};
export function InitiativeOverlay({
  combat: combatControls,
  connection,
}: Props) {
  const {
    initiativePromptEntry,
    updateInitiativeEntry,
    initiativeRollingId,
    rollInitiative,
    initiativeManualValues,
    setInitiativeManualValues,
    submitManualInitiative,
    submittedInitiativeCount,
    pendingCombatEntries,
    combatEntries,
    beginCombatRounds,
  } = combatControls;
  const { isDm } = connection;
  return (
    <section
      className="initiative-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="initiative-title"
    >
      <div className="initiative-modal" aria-live="polite">
        <span className="initiative-kicker">DM Started Combat</span>
        <h2 id="initiative-title">Roll for initiative</h2>
        <p>
          {initiativePromptEntry
            ? `Use the app roller or enter the initiative you rolled at the table for ${initiativePromptEntry.name}.`
            : isDm
              ? "Everyone has an initiative entry. Review the order, then begin the first round."
              : "Your initiative is submitted. Waiting for the DM to begin the first round."}
        </p>

        {initiativePromptEntry ? (
          <article className="initiative-focus-card">
            <div>
              <span>Token</span>
              <strong>{initiativePromptEntry.name}</strong>
              <small>{initiativePromptEntry.ownerName}</small>
            </div>
            <div className="initiative-prompt-controls">
              <label>
                Modifier
                <input
                  type="number"
                  value={initiativePromptEntry.dexModifier}
                  onChange={(event) =>
                    updateInitiativeEntry(
                      initiativePromptEntry.id,
                      { dexModifier: Number(event.target.value) },
                      false,
                    )
                  }
                />
              </label>
              <label>
                Roll style
                <select
                  value={
                    initiativePromptEntry.mode === "manual"
                      ? "normal"
                      : initiativePromptEntry.mode
                  }
                  onChange={(event) =>
                    updateInitiativeEntry(
                      initiativePromptEntry.id,
                      { mode: event.target.value as InitiativeRollMode },
                      false,
                    )
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="advantage">Advantage</option>
                  <option value="disadvantage">Disadvantage</option>
                </select>
              </label>
            </div>
            <button
              className={
                initiativeRollingId === initiativePromptEntry.id
                  ? "dice-roll-button rolling"
                  : "dice-roll-button"
              }
              disabled={initiativeRollingId === initiativePromptEntry.id}
              onClick={() => rollInitiative(initiativePromptEntry.id)}
              type="button"
            >
              <span aria-hidden="true">
                {initiativeRollingId === initiativePromptEntry.id
                  ? "20"
                  : "d20"}
              </span>
              {initiativeRollingId === initiativePromptEntry.id
                ? "Rolling..."
                : "Roll d20"}
            </button>
            <div className="manual-initiative-row">
              <label>
                Rolled at table
                <input
                  inputMode="numeric"
                  placeholder="Total"
                  value={initiativeManualValues[initiativePromptEntry.id] ?? ""}
                  onChange={(event) =>
                    setInitiativeManualValues((current) => ({
                      ...current,
                      [initiativePromptEntry.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                className="secondary-action compact"
                disabled={!initiativeManualValues[initiativePromptEntry.id]}
                onClick={() => submitManualInitiative(initiativePromptEntry.id)}
                type="button"
              >
                Submit
              </button>
            </div>
          </article>
        ) : null}

        <div className="initiative-status-grid">
          <span>{submittedInitiativeCount} submitted</span>
          <span>{pendingCombatEntries.length} waiting</span>
          {isDm ? (
            <button
              className="primary-action compact"
              disabled={!combatEntries.length}
              onClick={beginCombatRounds}
              type="button"
            >
              Begin round
            </button>
          ) : null}
        </div>

        <ol className="initiative-submit-list">
          {combatEntries.map((entry) => (
            <li
              className={entry.submitted ? "submitted" : "waiting"}
              key={entry.id}
            >
              <strong>{entry.name}</strong>
              <span>
                {entry.submitted ? `${entry.total} initiative` : "Waiting"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
