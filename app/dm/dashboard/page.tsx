"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createLibraryItem,
  createRoomCode,
  getCurrentDMUser,
  loadDMRooms,
  loadLibraryItems,
  saveDMRoom,
  saveDMProfile,
  saveLibraryItem,
  signOutDM,
  type DMUser
} from "../../../lib/dmData";
import { prepareTokenImage } from "../../../lib/tokenImages";
import { saveGuestProfile } from "../../../lib/storage";
import type { DMRoomSummary, LibraryItem, LibraryItemKind, TokenType } from "../../../lib/types";

const TOKEN_TYPES: TokenType[] = ["character", "npc", "monster", "object"];

export default function DMDashboardPage() {
  const router = useRouter();
  const [dm, setDm] = useState<DMUser | null>(null);
  const [rooms, setRooms] = useState<DMRoomSummary[]>([]);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [roomName, setRoomName] = useState("Friday Encounter");
  const [libraryKind, setLibraryKind] = useState<LibraryItemKind>("token");
  const [librarySearch, setLibrarySearch] = useState("");
  const [profileDraft, setProfileDraft] = useState({ name: "", color: "#b7394b", avatarUrl: "", avatarName: "" });
  const [draft, setDraft] = useState({
    name: "Goblin Scout",
    category: "Creatures",
    icon: "⚔",
    tokenType: "monster" as TokenType,
    size: 1,
    hp: "",
    note: "",
    imageUrl: "",
    imageName: ""
  });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentDMUser().then((user) => {
      if (!user) {
        router.replace("/dm/login");
        return;
      }
      setDm(user);
      setProfileDraft({ name: user.name, color: user.color, avatarUrl: user.avatarUrl ?? "", avatarName: user.avatarName ?? "" });
      saveGuestProfile({ id: user.id, nickname: user.name, color: user.color, avatarUrl: user.avatarUrl, avatarName: user.avatarName });
      Promise.all([loadDMRooms(user.id), loadLibraryItems()]).then(([loadedRooms, loadedLibrary]) => {
        setRooms(loadedRooms);
        setLibrary(loadedLibrary);
      });
    });
  }, [router]);

  const filteredLibrary = useMemo(() => {
    const query = librarySearch.trim().toLowerCase();
    return library
      .filter((item) => item.kind === libraryKind)
      .filter((item) => {
        if (!query) return true;
        return `${item.name} ${item.category} ${item.tokenType}`.toLowerCase().includes(query);
      });
  }, [library, libraryKind, librarySearch]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dm) return;
    const now = Date.now();
    const room: DMRoomSummary = {
      id: `room_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      roomCode: createRoomCode(),
      name: roomName.trim() || "Untitled Room",
      dmUserId: dm.id,
      createdAt: now,
      updatedAt: now
    };
    const saved = await saveDMRoom(room);
    setRooms((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    saveGuestProfile({ id: dm.id, nickname: dm.name, color: dm.color, avatarUrl: dm.avatarUrl, avatarName: dm.avatarName });
    router.push(`/room/${saved.roomCode}`);
  }

  async function renameRoom(room: DMRoomSummary, name: string) {
    const next = { ...room, name: name.trim() || "Untitled Room", updatedAt: Date.now() };
    setRooms((current) => current.map((item) => (item.id === room.id ? next : item)));
    await saveDMRoom(next);
  }

  async function handleLibraryImage(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setError("");
      setDraft((current) => ({ ...current, imageName: image.imageName, imageUrl: image.imageUrl }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that image.");
    }
  }

  async function handleProfileImage(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setError("");
      setProfileDraft((current) => ({ ...current, avatarName: image.imageName, avatarUrl: image.imageUrl }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not use that profile image.");
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dm) return;
    try {
      const saved = await saveDMProfile({
        ...dm,
        name: profileDraft.name.trim() || dm.username,
        color: profileDraft.color,
        avatarUrl: profileDraft.avatarUrl || undefined,
        avatarName: profileDraft.avatarName || undefined
      });
      setDm(saved);
      saveGuestProfile({ id: saved.id, nickname: saved.name, color: saved.color, avatarUrl: saved.avatarUrl, avatarName: saved.avatarName });
      setStatus("DM profile updated.");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the DM profile.");
    }
  }

  async function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dm) return;
    const item = createLibraryItem({
      kind: libraryKind,
      name: draft.name,
      category: draft.category,
      icon: draft.icon,
      imageName: draft.imageName || undefined,
      imageUrl: draft.imageUrl || undefined,
      tokenType: libraryKind === "object" ? "object" : draft.tokenType,
      size: draft.size,
      hp: draft.hp,
      note: draft.note,
      createdBy: dm.id
    });
    const saved = await saveLibraryItem(item);
    setLibrary((current) => [saved, ...current.filter((entry) => entry.id !== saved.id)]);
    setStatus(`${saved.name} is now available in the shared library.`);
  }

  async function logout() {
    await signOutDM();
    router.push("/");
  }

  if (!dm) {
    return (
      <main className="app-shell table-shell">
        <section className="loading-panel">
          <span className="product-kicker">DM Dashboard</span>
          <h1>Loading dashboard...</h1>
          <p>Checking the DM session and shared library.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell dashboard-shell">
      <header className="app-topbar">
        <div className="dashboard-profile-header">
          <div className="dm-profile-mark small" style={{ borderColor: dm.color }}>
            {dm.avatarUrl ? <img alt="" src={dm.avatarUrl} /> : <span>{dm.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div>
          <Link href="/" className="back-link">
            Start
          </Link>
            <h1>{dm.name}</h1>
            <p>@{dm.username} controls {rooms.length} saved rooms and {library.length} shared presets.</p>
          </div>
        </div>
        <div className="room-actions">
          <span className="sync-badge online">DM profile</span>
          <button className="secondary-action" onClick={logout} type="button">
            Sign out
          </button>
        </div>
      </header>

      <section className="dashboard-grid">
        <section className="tool-card rooms-command-card">
          <div className="panel-heading">
            <h2>Rooms Command</h2>
            <span>{rooms.length} saved</span>
          </div>
          <form className="dashboard-form" onSubmit={createRoom}>
            <label>
              Room name
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={48} />
            </label>
            <button className="primary-action" type="submit">
              Create room
            </button>
          </form>
          <div className="room-table" aria-label="Saved DM rooms">
            {rooms.length ? (
              rooms.map((room) => (
                <article key={room.id}>
                  <div className="room-code-block">
                    <strong>{room.roomCode}</strong>
                    <small>Join code</small>
                  </div>
                  <div className="room-main-cell">
                    <input
                      aria-label={`Name for ${room.roomCode}`}
                      defaultValue={room.name}
                      onBlur={(event) => renameRoom(room, event.target.value)}
                    />
                    <small>Updated {new Date(room.updatedAt).toLocaleDateString()}</small>
                  </div>
                  <div className="room-row-actions">
                    <button className="secondary-action compact" onClick={() => navigator.clipboard?.writeText(room.roomCode)} type="button">
                      Copy
                    </button>
                    <Link className="primary-action compact" href={`/room/${room.roomCode}`}>
                      Open
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">Create a room to get a player join code.</p>
            )}
          </div>
        </section>

        <section className="tool-card dm-profile-card">
          <div className="panel-heading">
            <h2>DM Profile</h2>
            <span>Identity</span>
          </div>
          <form className="dashboard-form" onSubmit={saveProfile}>
            <div className="profile-editor-preview">
              <div className="dm-profile-mark" style={{ borderColor: profileDraft.color }}>
                {profileDraft.avatarUrl ? <img alt="" src={profileDraft.avatarUrl} /> : <span>{(profileDraft.name || dm.username).slice(0, 1).toUpperCase()}</span>}
              </div>
              <div>
                <strong>{profileDraft.name || dm.username}</strong>
                <small>@{dm.username}</small>
              </div>
            </div>
            <label>
              Display name
              <input value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} maxLength={40} />
            </label>
            <label>
              Profile color
              <input type="color" value={profileDraft.color} onChange={(event) => setProfileDraft((current) => ({ ...current, color: event.target.value }))} />
            </label>
            <label>
              Profile image
              <input accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleProfileImage(event.target.files?.[0] ?? null)} type="file" />
            </label>
            <button className="secondary-action" type="submit">
              Save profile
            </button>
          </form>
        </section>

        <section className="tool-card library-command-card">
          <div className="panel-heading">
            <h2>Shared Library</h2>
            <span>{library.length} presets</span>
          </div>
          <div className="mode-tabs" aria-label="Library kind">
            <button className={libraryKind === "token" ? "selected" : ""} onClick={() => setLibraryKind("token")} type="button">
              Tokens
            </button>
            <button className={libraryKind === "object" ? "selected" : ""} onClick={() => setLibraryKind("object")} type="button">
              Objects
            </button>
          </div>
          <form className="dashboard-form" onSubmit={savePreset}>
            <label>
              Name
              <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={48} />
            </label>
            <label>
              Category
              <input value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} maxLength={36} />
            </label>
            <div className="dice-row">
              <label>
                Icon
                <input
                  value={draft.icon}
                  onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))}
                  maxLength={4}
                />
              </label>
              <label>
                Size
                <input
                  min={1}
                  max={6}
                  type="number"
                  value={draft.size}
                  onChange={(event) => setDraft((current) => ({ ...current, size: Number(event.target.value) }))}
                />
              </label>
            </div>
            {libraryKind === "token" ? (
              <label>
                Type
                <select value={draft.tokenType} onChange={(event) => setDraft((current) => ({ ...current, tokenType: event.target.value as TokenType }))}>
                  {TOKEN_TYPES.filter((type) => type !== "object").map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              PNG or token image
              <input accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleLibraryImage(event.target.files?.[0] ?? null)} type="file" />
            </label>
            {draft.imageUrl ? (
              <div className="token-preview">
                <img alt="" src={draft.imageUrl} />
                <div>
                  <strong>{draft.imageName}</strong>
                  <button className="secondary-action compact" onClick={() => setDraft((current) => ({ ...current, imageUrl: "", imageName: "" }))} type="button">
                    Remove image
                  </button>
                </div>
              </div>
            ) : null}
            <button className="primary-action" type="submit">
              Save shared {libraryKind}
            </button>
          </form>
          {status ? <p className="empty-state">{status}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="tool-card library-browser">
          <div className="panel-heading">
            <h2>Library Browser</h2>
            <span>{filteredLibrary.length} shown</span>
          </div>
          <input
            aria-label="Filter library"
            placeholder="Filter by name, category, or type"
            value={librarySearch}
            onChange={(event) => setLibrarySearch(event.target.value)}
          />
          <div className="library-grid">
            {filteredLibrary.length ? (
              filteredLibrary.map((item) => (
                <article key={item.id}>
                  {item.imageUrl ? <img alt="" src={item.imageUrl} /> : <span>{item.icon}</span>}
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category} · {item.tokenType} · size {item.size}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">No presets match this filter.</p>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
