"use client";

import { FormEvent, useEffect, useState } from "react";
import { addRecentRoom, getGuestProfile, getRecentRooms, saveGuestProfile } from "../lib/storage";
import type { GuestProfile } from "../lib/types";

function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function HomePage() {
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [nickname, setNickname] = useState("Adventurer");
  const [roomCode, setRoomCode] = useState("");
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  useEffect(() => {
    const loaded = getGuestProfile();
    setProfile(loaded);
    setNickname(loaded.nickname);
    setRecentRooms(getRecentRooms());
  }, []);

  useEffect(() => {
    if (profile) {
      saveGuestProfile({ ...profile, nickname });
    }
  }, [nickname, profile]);

  function saveAndGo(code: string) {
    const cleanCode = code.trim().toUpperCase();
    const currentProfile = profile ?? getGuestProfile();
    saveGuestProfile({ ...currentProfile, nickname: nickname.trim() || "Adventurer" });
    addRecentRoom(cleanCode);
    window.location.assign(`room/${cleanCode}`);
  }

  function createRoom() {
    saveAndGo(createRoomCode());
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomCode.trim()) return;
    saveAndGo(roomCode);
  }

  return (
    <main className="app-shell lobby-shell">
      <header className="app-topbar">
        <div>
          <span className="product-kicker">DND Battle Room</span>
          <h1>Session Lobby</h1>
        </div>
        <div className="topbar-status">
          <span>Guest mode</span>
          <strong style={{ color: profile?.color }}>{nickname.slice(0, 1).toUpperCase()}</strong>
        </div>
      </header>

      <section className="lobby-layout">
        <aside className="lobby-brief">
          <h2>Start a fight map in seconds.</h2>
          <p>
            Create a room as DM, invite your players, place character chips, draw quick
            map notes, and roll dice with visible public results or hidden private rolls.
          </p>
          <div className="feature-strip">
            <span>Grid map</span>
            <span>Player chips</span>
            <span>Dice log</span>
            <span>Realtime sync</span>
          </div>
        </aside>

        <form className="lobby-grid" onSubmit={joinRoom}>
          <section className="tool-card identity-card">
            <div className="panel-heading">
              <h2>Your Profile</h2>
              <span>Shown in rooms</span>
            </div>
            <label>
              Nickname
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={28} />
            </label>
          </section>

          <section className="tool-card action-card primary-card">
            <div className="panel-heading">
              <h2>Create Room</h2>
              <span>Become DM</span>
            </div>
            <p>Creates a new room code and opens the tabletop immediately.</p>
            <button className="primary-action" onClick={createRoom} type="button">
              Create new room
            </button>
          </section>

          <section className="tool-card action-card">
            <div className="panel-heading">
              <h2>Join Room</h2>
              <span>Use invite code</span>
            </div>
            <label>
              Room code
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                placeholder="Example: A1B2C3"
                maxLength={12}
              />
            </label>
            <button className="secondary-action" disabled={!roomCode.trim()} type="submit">
              Join room
            </button>
          </section>

          {recentRooms.length ? (
            <section className="tool-card recent-rooms">
              <div className="panel-heading">
                <h2>Recent Rooms</h2>
                <span>Stored on this device</span>
              </div>
              <div>
                {recentRooms.map((code) => (
                  <button key={code} onClick={() => saveAndGo(code)} type="button">
                    {code}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </form>
      </section>
    </main>
  );
}
