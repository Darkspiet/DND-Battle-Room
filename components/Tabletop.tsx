"use client";
import { useState } from "react";
import { Battlefield } from "./tabletop/Battlefield";
import { BuildObjectTools } from "./tabletop/BuildObjectTools";
import { BuildTools } from "./tabletop/BuildTools";
import { CombatPanel } from "./tabletop/CombatPanel";
import { DicePanel } from "./tabletop/DicePanel";
import { InitiativeOverlay } from "./tabletop/InitiativeOverlay";
import { LibraryPanel } from "./tabletop/LibraryPanel";
import { RoomMode } from "./tabletop/model";
import { PlayerBar } from "./tabletop/PlayerBar";
import { RoomHeader } from "./tabletop/RoomHeader";
import { RoomLog } from "./tabletop/RoomLog";
import { SelectedToken } from "./tabletop/SelectedToken";
import { TokenList } from "./tabletop/TokenList";
import { TokenTools } from "./tabletop/TokenTools";
import { useBoardInteraction } from "./tabletop/useBoardInteraction";
import { useCombat } from "./tabletop/useCombat";
import { useRoomConnection } from "./tabletop/useRoomConnection";
import { useTokens } from "./tabletop/useTokens";
export function Tabletop({ roomCode }: { roomCode: string }) {
  const [roomMode, setRoomMode] = useState<RoomMode>("play");
  const connection = useRoomConnection(roomCode);
  const tokens = useTokens({ connection });
  const board = useBoardInteraction({ connection, tokens });
  const combat = useCombat({ connection, setRoomMode, board });
  const { room, profile, isDm, syncMode, syncError } = connection;
  const { selectedToken } = tokens;
  const { selectedWall, selectedEffect, setBuildMode } = board;
  const { hasInitiativeOverlay } = combat;
  const hasLibraryTools = isDm && roomMode === "library";
  function selectRoomMode(mode: RoomMode) {
    setRoomMode(mode);
    if (mode === "build") {
      if (isDm) setBuildMode(true);
      return;
    }
    setBuildMode(false);
  }
  if (!profile || !room) {
    return (
      <main className="app-shell table-shell">
        <section className="loading-panel">
          <span className="product-kicker">Opening room</span>
          <h1>Loading tabletop...</h1>
          <p>
            {syncError ||
              "Preparing your profile, room state, map grid, and sync connection."}
          </p>
        </section>
      </main>
    );
  }
  const readyConnection = { ...connection, room, profile };
  return (
    <main
      className="app-shell table-shell"
      data-paused={syncMode === "connecting"}
    >
      <RoomHeader
        roomCode={roomCode}
        roomMode={roomMode}
        selectRoomMode={selectRoomMode}
        connection={readyConnection}
      />
      {syncError ? <p className="sync-warning">{syncError}</p> : null}

      <PlayerBar connection={readyConnection} />

      <BuildTools
        visible={isDm && roomMode === "build"}
        board={board}
        setRoomMode={setRoomMode}
        connection={readyConnection}
      />

      <div className={`workspace map-first mode-${roomMode}`}>
        <aside className="side-panel">
          <DicePanel
            visible={roomMode === "play" || roomMode === "combat"}
            connection={readyConnection}
          />

          {roomMode === "play" ? <TokenTools tokens={tokens} /> : null}

          <LibraryPanel visible={isDm && hasLibraryTools} tokens={tokens} />

          {selectedToken && roomMode === "play" ? (
            <SelectedToken tokens={tokens} connection={readyConnection} />
          ) : null}

          {roomMode === "combat" ? (
            <CombatPanel combat={combat} connection={readyConnection} />
          ) : null}
        </aside>

        <Battlefield
          connection={readyConnection}
          board={board}
          combat={combat}
          roomMode={roomMode}
          tokens={tokens}
        />

        <aside className="right-panel">
          {isDm && roomMode === "build" && (selectedWall || selectedEffect) ? (
            <BuildObjectTools board={board} />
          ) : null}

          {roomMode === "play" || roomMode === "combat" ? (
            <RoomLog connection={readyConnection} />
          ) : null}

          <TokenList
            connection={readyConnection}
            tokens={tokens}
            combat={combat}
          />
        </aside>
      </div>
      {hasInitiativeOverlay ? (
        <InitiativeOverlay combat={combat} connection={readyConnection} />
      ) : null}
    </main>
  );
}
