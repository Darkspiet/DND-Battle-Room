"use client";

import type { GuestProfile, RoomMember, RoomState } from "./types";

const PROFILE_KEY = "dnd-battle-room-profile";
const ROOM_PREFIX = "dnd-battle-room:";
const RECENT_ROOMS_KEY = "dnd-battle-room-recents";
const FALLBACK_COLORS = ["#e85d75", "#2fbf71", "#3d8bfd", "#f2b84b", "#9b6ef3", "#16a3a3"];

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function getGuestProfile(): GuestProfile {
  if (typeof window === "undefined") {
    return { id: "server", nickname: "Adventurer", color: FALLBACK_COLORS[0] };
  }

  const stored = window.localStorage.getItem(PROFILE_KEY);
  if (stored) {
    return JSON.parse(stored) as GuestProfile;
  }

  const profile = {
    id: createId("guest"),
    nickname: "Adventurer",
    color: FALLBACK_COLORS[Math.floor(Math.random() * FALLBACK_COLORS.length)]
  };
  saveGuestProfile(profile);
  return profile;
}

export function saveGuestProfile(profile: GuestProfile) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
}

export function createEmptyRoom(roomCode: string, profile: GuestProfile): RoomState {
  const now = Date.now();
  return {
    roomCode,
    createdAt: now,
    dmId: profile.id,
    members: [toMember(profile, "dm", now)],
    grid: {
      rows: 18,
      columns: 26,
      cellSize: 44,
      background: "#f4efe3"
    },
    tokens: [],
    drawings: [],
    rolls: [],
    initiative: []
  };
}

export function toMember(profile: GuestProfile, role: RoomMember["role"], now = Date.now()): RoomMember {
  return {
    ...profile,
    role,
    joinedAt: now,
    lastSeen: now
  };
}

export function loadRoom(roomCode: string, profile: GuestProfile): RoomState {
  const key = `${ROOM_PREFIX}${roomCode}`;
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem(key);
  if (!stored) {
    const next = createEmptyRoom(roomCode, profile);
    saveRoom(next);
    return next;
  }

  const parsed = JSON.parse(stored) as RoomState;
  const role = parsed.dmId === profile.id ? "dm" : "player";
  const existing = parsed.members.find((member) => member.id === profile.id);
  const members = existing
    ? parsed.members.map((member) =>
        member.id === profile.id ? { ...member, ...profile, role: member.role, lastSeen: Date.now() } : member
      )
    : [...parsed.members, toMember(profile, role)];

  const next = { ...parsed, members };
  saveRoom(next);
  return next;
}

export function saveRoom(room: RoomState) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${ROOM_PREFIX}${room.roomCode}`, JSON.stringify(room));
  }
}

export function createEntityId(prefix: string) {
  return createId(prefix);
}

export function addRecentRoom(roomCode: string) {
  if (typeof window === "undefined") return;
  const code = roomCode.toUpperCase();
  const current = getRecentRooms();
  window.localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify([code, ...current.filter((item) => item !== code)].slice(0, 6)));
}

export function getRecentRooms(): string[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(RECENT_ROOMS_KEY);
  return stored ? (JSON.parse(stored) as string[]) : [];
}
