"use client";
import Link from "next/link";
import { RoomMode } from "./model";
import type { ReadyRoomConnection } from "./useRoomConnection";
type Props = {
  roomCode: string;
  roomMode: RoomMode;
  selectRoomMode: (mode: RoomMode) => void;
  connection: Pick<ReadyRoomConnection, "isDm" | "syncMode">;
};
export function RoomHeader({
  roomCode,
  roomMode,
  selectRoomMode,
  connection,
}: Props) {
  const { isDm, syncMode } = connection;
  return (
    <header className="app-topbar room-header">
      <div>
        <Link href="../.." className="back-link">
          Room lobby
        </Link>
        <h1>Room {roomCode}</h1>
        <p>
          {isDm
            ? "You are the DM. You can edit the map and all tokens."
            : "You are a player. You control your own tokens."}
        </p>
      </div>
      <div className="room-actions">
        {isDm ? (
          <nav className="dm-mode-rail" aria-label="DM room modes">
            <button
              className={roomMode === "play" ? "selected" : ""}
              onClick={() => selectRoomMode("play")}
              type="button"
            >
              <span>Table</span>
              <small>Tokens</small>
            </button>
            <button
              className={roomMode === "combat" ? "selected" : ""}
              onClick={() => selectRoomMode("combat")}
              type="button"
            >
              <span>Combat</span>
              <small>Turns</small>
            </button>
            <button
              className={roomMode === "build" ? "selected" : ""}
              onClick={() => selectRoomMode("build")}
              type="button"
            >
              <span>Build</span>
              <small>Map</small>
            </button>
            <button
              className={roomMode === "library" ? "selected" : ""}
              onClick={() => selectRoomMode("library")}
              type="button"
            >
              <span>Library</span>
              <small>Presets</small>
            </button>
          </nav>
        ) : null}
        <span
          className={
            syncMode === "server" || syncMode === "websocket"
              ? "sync-badge online"
              : "sync-badge"
          }
        >
          {syncMode === "websocket"
            ? "Realtime sync"
            : syncMode === "server"
              ? "Server sync"
              : "Editing paused"}
        </span>
        <button
          className="secondary-action"
          onClick={() => navigator.clipboard?.writeText(window.location.href)}
          type="button"
        >
          Copy invite
        </button>
      </div>
    </header>
  );
}
