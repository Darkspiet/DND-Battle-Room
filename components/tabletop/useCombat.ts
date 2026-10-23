"use client";
import type * as React from "react";
import { useState } from "react";
import { createEntityId } from "../../lib/storage";
import type { InitiativeEntry, Token } from "../../lib/types";
import { RoomMode, sortInitiativeEntries } from "./model";
import type { BoardInteraction } from "./useBoardInteraction";
import type { RoomConnection } from "./useRoomConnection";
type Options = {
  connection: Pick<
    RoomConnection,
    "room" | "profile" | "isDm" | "updateRoom" | "sendCommands"
  >;
  setRoomMode: React.Dispatch<React.SetStateAction<RoomMode>>;
  board: Pick<BoardInteraction, "setBuildMode">;
};
// Combat form state and actions; the server still authorizes and rolls every command.
export function useCombat({ connection, setRoomMode, board }: Options) {
  const { room, profile, isDm, updateRoom, sendCommands } = connection;
  const { setBuildMode } = board;
  const [initiativeManualValues, setInitiativeManualValues] = useState<
    Record<string, string>
  >({});
  const [initiativeRollingId, setInitiativeRollingId] = useState<string | null>(
    null,
  );
  const combat = room?.combat;
  const combatPhase = combat?.phase ?? (combat?.active ? "active" : "idle");
  const combatEntries = combat?.entries ?? [];
  const activeEntry = combatEntries[combat?.currentTurnIndex ?? 0] ?? null;
  const activeCombatTokenId =
    combatPhase === "active" ? (activeEntry?.tokenId ?? null) : null;
  const ownCombatEntries = profile
    ? combatEntries.filter((entry) => entry.ownerId === profile.id)
    : [];
  const pendingCombatEntries = combatEntries.filter(
    (entry) => !entry.submitted,
  );
  const initiativePromptEntry = isDm
    ? (pendingCombatEntries[0] ?? null)
    : (ownCombatEntries.find((entry) => !entry.submitted) ?? null);
  const hasInitiativeOverlay = combatPhase === "initiative";
  const submittedInitiativeCount = combatEntries.filter(
    (entry) => entry.submitted,
  ).length;
  function createInitiativeEntry(token: Token): InitiativeEntry {
    return {
      id: createEntityId("init"),
      tokenId: token.id,
      name: token.name,
      ownerId: token.ownerId,
      ownerName: token.ownerName,
      dexModifier: 0,
      total: 0,
      mode: "normal",
      conditions: [],
      submitted: false,
      createdAt: Date.now(),
    };
  }
  function addCombatEntry(token: Token) {
    updateRoom((current) => {
      if (current.combat.entries.some((entry) => entry.tokenId === token.id))
        return current;
      return {
        ...current,
        combat: {
          ...current.combat,
          entries: [...current.combat.entries, createInitiativeEntry(token)],
        },
      };
    });
    if (isDm) setRoomMode("combat");
  }
  function startCombat() {
    if (!isDm) return;
    updateRoom((current) => {
      const entriesByToken = new Map(
        current.combat.entries.map((entry) => [entry.tokenId, entry]),
      );
      const entries = current.tokens
        .filter((token) => token.type !== "object")
        .map((token) => {
          const existing = entriesByToken.get(token.id);
          return {
            ...(existing ?? createInitiativeEntry(token)),
            tokenId: token.id,
            name: token.name,
            ownerId: token.ownerId,
            ownerName: token.ownerName,
            roll: undefined,
            total: 0,
            submitted: false,
            submittedAt: undefined,
            submittedBy: undefined,
            source: undefined,
          };
        });
      return {
        ...current,
        combat: {
          ...current.combat,
          active: false,
          phase: "initiative",
          round: 1,
          currentTurnIndex: 0,
          startedAt: Date.now(),
          entries,
        },
      };
    });
    setBuildMode(false);
    setRoomMode("play");
  }
  function beginCombatRounds() {
    if (!isDm) return;
    updateRoom((current) => ({
      ...current,
      combat: {
        ...current.combat,
        active: true,
        phase: "active",
        round: current.combat.round || 1,
        currentTurnIndex: 0,
        entries: sortInitiativeEntries(current.combat.entries),
      },
    }));
    setRoomMode("play");
  }
  function endCombat() {
    if (!isDm) return;
    updateRoom((current) => ({
      ...current,
      combat: {
        ...current.combat,
        active: false,
        phase: "idle",
        currentTurnIndex: 0,
      },
    }));
  }
  function clearCombat() {
    if (!isDm) return;
    updateRoom((current) => ({
      ...current,
      combat: {
        active: false,
        phase: "idle",
        round: 1,
        currentTurnIndex: 0,
        entries: [],
      },
      initiative: [],
    }));
  }
  function submitInitiative(
    entryId: string,
    _source: "app" | "manual" | "dm",
    manualTotal?: number,
  ) {
    sendCommands([
      {
        type: "initiative.submit",
        payload: {
          id: entryId,
          ...(manualTotal === undefined ? {} : { manualTotal }),
        },
      },
    ]);
  }
  function rollInitiative(entryId: string) {
    setInitiativeRollingId(entryId);
    window.setTimeout(() => {
      submitInitiative(entryId, isDm ? "dm" : "app");
      setInitiativeRollingId((current) =>
        current === entryId ? null : current,
      );
    }, 700);
  }
  function submitManualInitiative(entryId: string) {
    const total = Number(initiativeManualValues[entryId]);
    if (!Number.isFinite(total)) return;
    submitInitiative(entryId, isDm ? "dm" : "manual", total);
  }
  function updateInitiativeEntry(
    entryId: string,
    patch: Partial<InitiativeEntry>,
    shouldSort = true,
  ) {
    updateRoom((current) => {
      const entries = current.combat.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const next = { ...entry, ...patch };
        if (
          patch.dexModifier !== undefined &&
          next.mode !== "manual" &&
          next.roll !== undefined
        ) {
          next.total = next.roll + next.dexModifier;
        }
        return next;
      });
      return {
        ...current,
        combat: {
          ...current.combat,
          currentTurnIndex: Math.max(
            0,
            Math.min(
              current.combat.currentTurnIndex,
              Math.max(0, entries.length - 1),
            ),
          ),
          entries: shouldSort ? sortInitiativeEntries(entries) : entries,
        },
      };
    });
  }
  function removeInitiativeEntry(entryId: string) {
    if (!isDm) return;
    updateRoom((current) => {
      const entries = current.combat.entries.filter(
        (entry) => entry.id !== entryId,
      );
      return {
        ...current,
        combat: {
          ...current.combat,
          currentTurnIndex: Math.max(
            0,
            Math.min(
              current.combat.currentTurnIndex,
              Math.max(0, entries.length - 1),
            ),
          ),
          entries,
        },
      };
    });
  }
  function moveInitiativeEntry(entryId: string, direction: -1 | 1) {
    if (!isDm) return;
    updateRoom((current) => {
      const index = current.combat.entries.findIndex(
        (entry) => entry.id === entryId,
      );
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.combat.entries.length)
        return current;
      const entries = [...current.combat.entries];
      const [entry] = entries.splice(index, 1);
      entries.splice(target, 0, entry);
      return {
        ...current,
        combat: {
          ...current.combat,
          currentTurnIndex:
            current.combat.currentTurnIndex === index
              ? target
              : current.combat.currentTurnIndex,
          entries,
        },
      };
    });
  }
  function advanceTurn(direction: 1 | -1) {
    if (!isDm) return;
    updateRoom((current) => {
      const count = current.combat.entries.length;
      if (!count) return current;
      let nextIndex = current.combat.currentTurnIndex + direction;
      let nextRound = current.combat.round || 1;
      if (nextIndex >= count) {
        nextIndex = 0;
        nextRound += 1;
      }
      if (nextIndex < 0) {
        nextIndex = count - 1;
        nextRound = Math.max(1, nextRound - 1);
      }
      return {
        ...current,
        combat: {
          ...current.combat,
          active: true,
          phase: "active",
          currentTurnIndex: nextIndex,
          round: nextRound,
        },
      };
    });
  }
  return {
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
    addCombatEntry,
    initiativePromptEntry,
    initiativeRollingId,
    initiativeManualValues,
    setInitiativeManualValues,
    submitManualInitiative,
    hasInitiativeOverlay,
  };
}
export type CombatControls = ReturnType<typeof useCombat>;
