"use client";

import Link from "next/link";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { rollDice } from "../lib/dice";
import { createEntityId, getGuestProfile, loadRoom, saveRoom } from "../lib/storage";
import { hasSupabaseConfig, joinSupabaseRoom, saveSupabaseRoom, subscribeToSupabaseRoom } from "../lib/supabaseRoom";
import { prepareTokenImage } from "../lib/tokenImages";
import type { DiceRoll, DrawingLine, GuestProfile, RoomState, Token, TokenType } from "../lib/types";

type Props = {
  roomCode: string;
};

const QUICK_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const TOKEN_TYPES: TokenType[] = ["character", "npc", "monster", "object"];

function roomApiPath(roomCode: string) {
  return `../../api/rooms/${roomCode}`;
}

export function Tabletop({ roomCode }: Props) {
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [diceExpression, setDiceExpression] = useState("d20");
  const [privateRoll, setPrivateRoll] = useState(false);
  const [diceError, setDiceError] = useState("");
  const [draggingToken, setDraggingToken] = useState<string | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draftLine, setDraftLine] = useState<DrawingLine | null>(null);
  const [newToken, setNewToken] = useState({
    name: "Hero",
    icon: "⚔",
    imageName: "",
    imageUrl: "",
    type: "character" as TokenType
  });
  const [imageError, setImageError] = useState("");
  const [syncMode, setSyncMode] = useState<"connecting" | "supabase" | "server" | "local">("connecting");
  const [syncError, setSyncError] = useState("");
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const loadedProfile = getGuestProfile();
    setProfile(loadedProfile);
    const localRoom = loadRoom(roomCode, loadedProfile);
    setRoom(localRoom);

    if (hasSupabaseConfig()) {
      joinSupabaseRoom(roomCode, loadedProfile)
        .then((supabaseRoom) => {
          if (!supabaseRoom) throw new Error("Supabase is not configured.");
          setSyncMode("supabase");
          setSyncError("");
          setRoom(supabaseRoom);
        })
        .catch((error) => {
          setSyncError(error instanceof Error ? error.message : "Supabase sync failed.");
          setSyncMode("local");
        });
      return;
    }

    fetch(roomApiPath(roomCode), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loadedProfile)
    })
      .then((response) => {
        if (!response.ok) throw new Error("Server room join failed");
        return response.json() as Promise<RoomState>;
      })
      .then((serverRoom) => {
        setSyncMode("server");
        setSyncError("");
        setRoom(serverRoom);
        saveRoom(serverRoom);
      })
      .catch(() => {
        setSyncError("Development server sync is unavailable. Using local browser storage.");
        setSyncMode("local");
      });
  }, [roomCode]);

  useEffect(() => {
    if (!profile || syncMode !== "supabase") return;
    const unsubscribe = subscribeToSupabaseRoom(roomCode, (supabaseRoom) => {
      setRoom(supabaseRoom);
      saveRoom(supabaseRoom);
    });

    return () => {
      unsubscribe?.();
    };
  }, [profile, roomCode, syncMode]);

  useEffect(() => {
    if (!profile || syncMode !== "server") return;
    const interval = window.setInterval(() => {
      fetch(roomApiPath(roomCode))
        .then((response) => {
          if (!response.ok) throw new Error("Server room fetch failed");
          return response.json() as Promise<RoomState>;
        })
        .then((serverRoom) => {
          setRoom(serverRoom);
          saveRoom(serverRoom);
        })
        .catch(() => setSyncMode("local"));
    }, 1200);

    return () => window.clearInterval(interval);
  }, [profile, roomCode, syncMode]);

  const currentMember = room?.members.find((member) => member.id === profile?.id);
  const isDm = currentMember?.role === "dm";
  const boardWidth = room ? room.grid.columns * room.grid.cellSize : 0;
  const boardHeight = room ? room.grid.rows * room.grid.cellSize : 0;
  const selectedToken = room?.tokens.find((token) => token.id === selectedTokenId) ?? null;

  useEffect(() => {
    const channel = new BroadcastChannel(`dnd-room-${roomCode}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<RoomState>) => {
      setRoom(event.data);
    };
    return () => channel.close();
  }, [roomCode]);

  useEffect(() => {
    if (!room) return;
    saveRoom(room);
  }, [room]);

  function updateRoom(updater: (current: RoomState) => RoomState) {
    setRoom((current) => {
      if (!current) return current;
      const next = updater(current);
      saveRoom(next);
      channelRef.current?.postMessage(next);
      if (syncMode === "server") {
        fetch(roomApiPath(roomCode), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next)
        }).catch(() => setSyncMode("local"));
      }
      if (syncMode === "supabase") {
        saveSupabaseRoom(next).catch((error) => {
          setSyncError(error instanceof Error ? error.message : "Supabase save failed.");
          setSyncMode("local");
        });
      }
      return next;
    });
  }

  function canControl(token: Token) {
    return Boolean(profile && (isDm || token.ownerId === profile.id));
  }

  function addToken() {
    if (!profile || !room) return;
    const owner = isDm ? profile : profile;
    const token: Token = {
      id: createEntityId("token"),
      name: newToken.name.trim() || "Token",
      icon: newToken.icon.trim() || "●",
      imageName: newToken.imageName || undefined,
      imageUrl: newToken.imageUrl || undefined,
      type: newToken.type,
      ownerId: owner.id,
      ownerName: owner.nickname,
      color: owner.color,
      x: 0,
      y: 0,
      size: 1
    };
    updateRoom((current) => ({ ...current, tokens: [...current.tokens, token] }));
    setSelectedTokenId(token.id);
  }

  async function handleNewTokenImage(file: File | null) {
    if (!file) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      setNewToken((current) => ({ ...current, ...image }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not use that image.");
    }
  }

  async function handleSelectedTokenImage(file: File | null) {
    if (!file || !selectedToken || !canControl(selectedToken)) return;
    try {
      const image = await prepareTokenImage(file);
      setImageError("");
      updateToken(selectedToken.id, image);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Could not use that image.");
    }
  }

  function deleteToken(tokenId: string) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.filter((token) => token.id !== tokenId),
      initiative: current.initiative.filter((entry) => entry.tokenId !== tokenId)
    }));
  }

  function updateToken(tokenId: string, patch: Partial<Token>) {
    updateRoom((current) => ({
      ...current,
      tokens: current.tokens.map((token) => (token.id === tokenId && canControl(token) ? { ...token, ...patch } : token))
    }));
  }

  function moveToken(event: PointerEvent<HTMLDivElement>, token: Token) {
    if (!room) return;
    if (!canControl(token)) return;
    const board = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!board) return;
    const x = Math.max(0, Math.min(room.grid.columns - token.size, Math.floor((event.clientX - board.left) / room.grid.cellSize)));
    const y = Math.max(0, Math.min(room.grid.rows - token.size, Math.floor((event.clientY - board.top) / room.grid.cellSize)));
    updateToken(token.id, { x, y });
  }

  function startDraw(event: PointerEvent<HTMLDivElement>) {
    if (!profile || !room) return;
    if (!drawMode || !isDm) return;
    const point = getBoardPoint(event);
    setDraftLine({
      id: createEntityId("line"),
      ownerId: profile.id,
      color: profile.color,
      points: [point]
    });
  }

  function continueDraw(event: PointerEvent<HTMLDivElement>) {
    if (!draftLine) return;
    const point = getBoardPoint(event);
    setDraftLine((line) => (line ? { ...line, points: [...line.points, point] } : line));
  }

  function endDraw() {
    if (!draftLine) return;
    const line = draftLine;
    setDraftLine(null);
    if (line.points.length > 1) {
      updateRoom((current) => ({ ...current, drawings: [...current.drawings, line] }));
    }
  }

  function getBoardPoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(boardWidth, event.clientX - rect.left)),
      y: Math.max(0, Math.min(boardHeight, event.clientY - rect.top))
    };
  }

  function doRoll(expression = diceExpression) {
    if (!profile) return;
    try {
      const result = rollDice(expression);
      const roll: DiceRoll = {
        id: createEntityId("roll"),
        userId: profile.id,
        userName: profile.nickname,
        expression: result.expression,
        total: result.total,
        parts: result.parts,
        private: privateRoll,
        createdAt: Date.now()
      };
      setDiceError("");
      updateRoom((current) => ({ ...current, rolls: [roll, ...current.rolls].slice(0, 80) }));
    } catch (error) {
      setDiceError(error instanceof Error ? error.message : "Invalid roll.");
    }
  }

  function visibleRolls() {
    if (!room || !profile) return [];
    return room.rolls.filter((roll) => !roll.private || roll.userId === profile.id || isDm);
  }

  function latestRollFor(userId: string) {
    return visibleRolls().find((roll) => roll.userId === userId);
  }

  function addInitiative(token: Token) {
    updateRoom((current) => {
      const existing = current.initiative.filter((entry) => entry.tokenId !== token.id);
      return {
        ...current,
        initiative: [...existing, { id: createEntityId("init"), tokenId: token.id, name: token.name, score: 10 }].sort(
          (a, b) => b.score - a.score
        )
      };
    });
  }

  if (!profile || !room) {
    return (
      <main className="app-shell table-shell">
        <section className="loading-panel">
          <span className="product-kicker">Opening room</span>
          <h1>Loading tabletop...</h1>
          <p>Preparing your profile, room state, map grid, and sync connection.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell table-shell">
      <header className="app-topbar room-header">
        <div>
          <Link href="../.." className="back-link">
            Room lobby
          </Link>
          <h1>Room {roomCode}</h1>
          <p>{isDm ? "You are the DM. You can edit the map and all tokens." : "You are a player. You control your own tokens."}</p>
        </div>
        <div className="room-actions">
          <span className={syncMode === "server" || syncMode === "supabase" ? "sync-badge online" : "sync-badge"}>
            {syncMode === "supabase"
              ? "Supabase realtime"
              : syncMode === "server"
                ? "Dev server sync"
                : syncMode === "local"
                  ? "Local only"
                  : "Connecting"}
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
      {syncError ? <p className="sync-warning">{syncError}</p> : null}

      <section className="player-bar" aria-label="Players in room">
        {room.members.map((member) => {
          const latest = latestRollFor(member.id);
          return (
            <article className="profile-chip" key={member.id} style={{ borderColor: member.color }}>
              <div className="avatar" style={{ background: member.color }}>
                {member.nickname.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{member.nickname}</strong>
                <span>{member.role.toUpperCase()}</span>
                {latest ? (
                  <small>
                    {latest.private ? "Private " : ""}
                    {latest.expression}: {latest.total}
                  </small>
                ) : (
                  <small>No roll yet</small>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <div className="workspace">
        <aside className="side-panel">
          <section className="tool-card">
            <div className="panel-heading">
              <h2>Dice</h2>
              <span>{privateRoll ? "Private" : "Public"}</span>
            </div>
            <div className="quick-dice">
              {QUICK_DICE.map((die) => (
                <button key={die} onClick={() => doRoll(die)} type="button">
                  {die}
                </button>
              ))}
            </div>
            <div className="dice-row">
              <input value={diceExpression} onChange={(event) => setDiceExpression(event.target.value)} />
              <button onClick={() => doRoll()} type="button">
                Roll
              </button>
            </div>
            <label className="inline-check">
              <input checked={privateRoll} onChange={(event) => setPrivateRoll(event.target.checked)} type="checkbox" />
              Private roll
            </label>
            {diceError ? <p className="error-text">{diceError}</p> : null}
          </section>

          <section className="tool-card">
            <div className="panel-heading">
              <h2>Tokens</h2>
              <span>Create chip</span>
            </div>
            <input
              aria-label="Token name"
              value={newToken.name}
              onChange={(event) => setNewToken((current) => ({ ...current, name: event.target.value }))}
            />
            <div className="dice-row">
              <input
                aria-label="Token icon"
                value={newToken.icon}
                onChange={(event) => setNewToken((current) => ({ ...current, icon: event.target.value }))}
                maxLength={4}
              />
              <select
                value={newToken.type}
                onChange={(event) => setNewToken((current) => ({ ...current, type: event.target.value as TokenType }))}
              >
                {TOKEN_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <button className="primary-action compact" onClick={addToken} type="button">
              Add token
            </button>
            <label>
              Token picture
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => handleNewTokenImage(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            {newToken.imageUrl ? (
              <div className="token-preview">
                <img alt={`${newToken.name || "New token"} preview`} src={newToken.imageUrl} />
                <div>
                  <strong>{newToken.imageName}</strong>
                  <button
                    className="secondary-action compact"
                    onClick={() => setNewToken((current) => ({ ...current, imageName: "", imageUrl: "" }))}
                    type="button"
                  >
                    Remove picture
                  </button>
                </div>
              </div>
            ) : null}
            {imageError ? <p className="error-text">{imageError}</p> : null}
          </section>

          {selectedToken ? (
            <section className="tool-card">
              <div className="panel-heading">
                <h2>Selected Token</h2>
                <span>{canControl(selectedToken) ? "Editable" : "Locked"}</span>
              </div>
              <label>
                Name
                <input
                  disabled={!canControl(selectedToken)}
                  value={selectedToken.name}
                  onChange={(event) => updateToken(selectedToken.id, { name: event.target.value })}
                />
              </label>
              <div className="dice-row">
                <label>
                  Icon
                  <input
                    disabled={!canControl(selectedToken)}
                    maxLength={4}
                    value={selectedToken.icon}
                    onChange={(event) => updateToken(selectedToken.id, { icon: event.target.value })}
                  />
                </label>
                <label>
                  Size
                  <input
                    disabled={!canControl(selectedToken)}
                    min={1}
                    max={4}
                    type="number"
                    value={selectedToken.size}
                    onChange={(event) => updateToken(selectedToken.id, { size: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label>
                HP / status
                <input
                  disabled={!canControl(selectedToken)}
                  placeholder="23/31, prone, blessed"
                  value={selectedToken.hp ?? ""}
                  onChange={(event) => updateToken(selectedToken.id, { hp: event.target.value })}
                />
              </label>
              <label>
                Note
                <input
                  disabled={!canControl(selectedToken)}
                  placeholder={isDm ? "Hidden encounter note" : "Character note"}
                  value={selectedToken.note ?? ""}
                  onChange={(event) => updateToken(selectedToken.id, { note: event.target.value })}
                />
              </label>
              <label>
                Token picture
                <input
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={!canControl(selectedToken)}
                  onChange={(event) => handleSelectedTokenImage(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
              {selectedToken.imageUrl ? (
                <div className="token-preview">
                  <img alt={`${selectedToken.name} preview`} src={selectedToken.imageUrl} />
                  <div>
                    <strong>{selectedToken.imageName ?? "Custom picture"}</strong>
                    {canControl(selectedToken) ? (
                      <button
                        className="secondary-action compact"
                        onClick={() => updateToken(selectedToken.id, { imageName: undefined, imageUrl: undefined })}
                        type="button"
                      >
                        Remove picture
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="empty-state">No custom picture. The chip is using its icon.</p>
              )}
              {canControl(selectedToken) ? (
                <button className="secondary-action compact danger" onClick={() => deleteToken(selectedToken.id)} type="button">
                  Delete selected
                </button>
              ) : null}
            </section>
          ) : null}

          {isDm ? (
            <section className="tool-card">
              <div className="panel-heading">
                <h2>Map</h2>
                <span>DM tools</span>
              </div>
              <label>
                Columns
                <input
                  min={8}
                  max={60}
                  type="number"
                  value={room.grid.columns}
                  onChange={(event) =>
                    updateRoom((current) => ({
                      ...current,
                      grid: { ...current.grid, columns: Number(event.target.value) }
                    }))
                  }
                />
              </label>
              <label>
                Rows
                <input
                  min={8}
                  max={50}
                  type="number"
                  value={room.grid.rows}
                  onChange={(event) =>
                    updateRoom((current) => ({ ...current, grid: { ...current.grid, rows: Number(event.target.value) } }))
                  }
                />
              </label>
              <label>
                Cell size
                <input
                  min={28}
                  max={72}
                  type="number"
                  value={room.grid.cellSize}
                  onChange={(event) =>
                    updateRoom((current) => ({
                      ...current,
                      grid: { ...current.grid, cellSize: Number(event.target.value) }
                    }))
                  }
                />
              </label>
              <label>
                Background
                <input
                  type="color"
                  value={room.grid.background}
                  onChange={(event) =>
                    updateRoom((current) => ({
                      ...current,
                      grid: { ...current.grid, background: event.target.value }
                    }))
                  }
                />
              </label>
              <button className={drawMode ? "primary-action compact" : "secondary-action compact"} onClick={() => setDrawMode(!drawMode)} type="button">
                Draw mode
              </button>
              <button
                className="secondary-action compact"
                onClick={() => updateRoom((current) => ({ ...current, drawings: [] }))}
                type="button"
              >
                Clear drawings
              </button>
            </section>
          ) : null}

          <section>
            <div className="panel-heading">
              <h2>Initiative</h2>
              <span>Turn order</span>
            </div>
            {room.initiative.length ? (
              <ol className="initiative-list">
                {room.initiative.map((entry) => (
                  <li key={entry.id}>
                    <span>{entry.name}</span>
                    <input
                      disabled={!isDm}
                      value={entry.score}
                      type="number"
                      onChange={(event) =>
                        updateRoom((current) => ({
                          ...current,
                          initiative: current.initiative
                            .map((item) => (item.id === entry.id ? { ...item, score: Number(event.target.value) } : item))
                            .sort((a, b) => b.score - a.score)
                        }))
                      }
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">Add tokens to initiative from the token list.</p>
            )}
          </section>
        </aside>

        <section className="map-wrap" aria-label="Battle map">
          <div className="map-toolbar">
            <span>{room.grid.columns} x {room.grid.rows}</span>
            <span>{room.tokens.length} tokens</span>
            <span>{drawMode ? "Drawing mode" : "Token mode"}</span>
          </div>
          <div
            className={drawMode ? "board draw-active" : "board"}
            onPointerDown={startDraw}
            onPointerMove={continueDraw}
            onPointerUp={endDraw}
            style={{
              width: boardWidth,
              height: boardHeight,
              backgroundColor: room.grid.background,
              backgroundImage: `linear-gradient(to right, rgba(20, 20, 20, .18) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 20, 20, .18) 1px, transparent 1px)`,
              backgroundSize: `${room.grid.cellSize}px ${room.grid.cellSize}px`
            }}
          >
            <svg className="drawing-layer" height={boardHeight} width={boardWidth}>
              {[...room.drawings, ...(draftLine ? [draftLine] : [])].map((line) => (
                <polyline
                  fill="none"
                  key={line.id}
                  points={line.points.map((point) => `${point.x},${point.y}`).join(" ")}
                  stroke={line.color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                />
              ))}
            </svg>

            {room.tokens.map((token) => (
              <div
                className={canControl(token) ? "token controllable" : "token"}
                key={token.id}
                onPointerDown={(event) => {
                  if (drawMode) return;
                  setSelectedTokenId(token.id);
                  setDraggingToken(token.id);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.stopPropagation();
                }}
                onPointerMove={(event) => {
                  if (draggingToken === token.id) moveToken(event, token);
                }}
                onPointerUp={() => setDraggingToken(null)}
                style={{
                  borderColor: token.color,
                  height: token.size * room.grid.cellSize - 8,
                  left: token.x * room.grid.cellSize + 4,
                  top: token.y * room.grid.cellSize + 4,
                  width: token.size * room.grid.cellSize - 8
                }}
                title={`${token.name} (${token.ownerName})`}
              >
                {token.imageUrl ? (
                  <img className="token-image" alt={token.name} draggable={false} src={token.imageUrl} />
                ) : (
                  <span>{token.icon}</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="right-panel">
          <section className="tool-card">
            <div className="panel-heading">
              <h2>Room Log</h2>
              <span>Latest rolls</span>
            </div>
            {visibleRolls().length ? (
              <div className="roll-log">
                {visibleRolls().map((roll) => (
                  <article key={roll.id}>
                    <strong>{roll.userName}</strong>
                    <span>
                      {roll.private ? "Private " : ""}
                      {roll.expression}: {roll.total}
                    </span>
                    <small>{roll.parts}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">Dice results will appear here.</p>
            )}
          </section>

          <section className="tool-card">
            <div className="panel-heading">
              <h2>Token List</h2>
              <span>{room.tokens.length} total</span>
            </div>
            {room.tokens.length ? (
              <div className="token-list">
                {room.tokens.map((token) => (
                  <article key={token.id} style={{ borderColor: token.color }}>
                    <div>
                    <strong>
                      {token.imageUrl ? <img className="token-list-image" alt="" draggable={false} src={token.imageUrl} /> : token.icon} {token.name}
                    </strong>
                      <small>
                        {token.type} · {token.ownerName}
                        {token.hp ? ` · ${token.hp}` : ""}
                      </small>
                    </div>
                    <div className="token-actions">
                      <button onClick={() => setSelectedTokenId(token.id)} type="button">
                        Edit
                      </button>
                      {isDm ? (
                        <button onClick={() => addInitiative(token)} type="button">
                          Init
                        </button>
                      ) : null}
                      {canControl(token) ? (
                        <button onClick={() => deleteToken(token.id)} type="button">
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">Create a token from the left panel to place it on the grid.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
