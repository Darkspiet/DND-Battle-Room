import { assignPlayerColor, resolvePlayerColor } from "./playerColors";
import type { GuestProfile, RoomMember, RoomState, Token } from "./types";

type Store = Map<string, RoomState>;

declare global {
  // eslint-disable-next-line no-var
  var dndRoomStore: Store | undefined;
}

const store = globalThis.dndRoomStore ?? new Map<string, RoomState>();
globalThis.dndRoomStore = store;

export function toRoomMember(profile: GuestProfile, role: RoomMember["role"], now = Date.now()): RoomMember {
  return {
    ...profile,
    role,
    joinedAt: now,
    lastSeen: now
  };
}

export function createServerRoom(roomCode: string, profile: GuestProfile): RoomState {
  const now = Date.now();
  const assignedProfile = { ...profile, color: assignPlayerColor([]) };
  return {
    roomCode,
    createdAt: now,
    dmId: assignedProfile.id,
    members: [toRoomMember(assignedProfile, "dm", now)],
    grid: {
      rows: 18,
      columns: 26,
      cellSize: 44,
      background: "#f4efe3",
      feetPerCell: 5
    },
    tokens: [],
    drawings: [],
    effects: [],
    rolls: [],
    initiative: []
  };
}

export function getServerRoom(roomCode: string) {
  return store.get(roomCode.toUpperCase()) ?? null;
}

export function setServerRoom(room: RoomState) {
  store.set(room.roomCode.toUpperCase(), room);
  return room;
}

export function joinServerRoom(roomCode: string, profile: GuestProfile) {
  const code = roomCode.toUpperCase();
  const existing = getServerRoom(code);

  if (!existing) {
    return setServerRoom(createServerRoom(code, profile));
  }

  const now = Date.now();
  const role = existing.dmId === profile.id ? "dm" : "player";
  const currentMember = existing.members.find((member) => member.id === profile.id);
  const color = resolvePlayerColor(existing.members, profile.id, currentMember?.color);
  const assignedProfile = { ...profile, color };
  const room = {
    ...existing,
    members: currentMember
      ? existing.members.map((member) =>
          member.id === profile.id ? { ...member, ...assignedProfile, role: member.role, lastSeen: now } : member
        )
      : [...existing.members, toRoomMember(assignedProfile, role, now)]
  };

  return setServerRoom(room);
}

export function canControlServerToken(room: RoomState, profileId: string, token: Token) {
  return room.dmId === profileId || token.ownerId === profileId;
}

export function moveServerToken(roomCode: string, profileId: string, tokenId: string, x: number, y: number) {
  const room = getServerRoom(roomCode);
  if (!room) return { room: null, token: null, error: "Room not found" };

  const token = room.tokens.find((item) => item.id === tokenId);
  if (!token) return { room, token: null, error: "Token not found" };
  if (!canControlServerToken(room, profileId, token)) {
    return { room, token: null, error: "You cannot move that token" };
  }

  const nextToken = {
    ...token,
    x: Math.max(0, Math.min(room.grid.columns - token.size, Math.floor(x))),
    y: Math.max(0, Math.min(room.grid.rows - token.size, Math.floor(y)))
  };
  const nextRoom = setServerRoom({
    ...room,
    tokens: room.tokens.map((item) => (item.id === tokenId ? nextToken : item))
  });

  return { room: nextRoom, token: nextToken, error: null };
}
