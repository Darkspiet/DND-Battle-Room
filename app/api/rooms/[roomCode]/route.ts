import { NextRequest, NextResponse } from "next/server";
import { assignPlayerColor, resolvePlayerColor } from "../../../../lib/playerColors";
import type { GuestProfile, RoomMember, RoomState } from "../../../../lib/types";

type Store = Map<string, RoomState>;

declare global {
  var dndRoomStore: Store | undefined;
}

const store = globalThis.dndRoomStore ?? new Map<string, RoomState>();
globalThis.dndRoomStore = store;

function toMember(profile: GuestProfile, role: RoomMember["role"], now = Date.now()): RoomMember {
  return {
    ...profile,
    role,
    joinedAt: now,
    lastSeen: now
  };
}

function createRoom(roomCode: string, profile: GuestProfile): RoomState {
  const now = Date.now();
  const assignedProfile = { ...profile, color: assignPlayerColor([]) };
  return {
    roomCode,
    createdAt: now,
    dmId: assignedProfile.id,
    members: [toMember(assignedProfile, "dm", now)],
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

async function getCode(params: Promise<{ roomCode: string }>) {
  const { roomCode } = await params;
  return roomCode.toUpperCase();
}

export async function GET(_request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const roomCode = await getCode(context.params);
  const room = store.get(roomCode);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(room);
}

export async function POST(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const roomCode = await getCode(context.params);
  let profile: GuestProfile;

  try {
    profile = (await request.json()) as GuestProfile;
  } catch {
    return NextResponse.json({ error: "Missing guest profile" }, { status: 400 });
  }

  if (!profile.id || !profile.nickname || !profile.color) {
    return NextResponse.json({ error: "Invalid guest profile" }, { status: 400 });
  }

  const existing = store.get(roomCode);

  if (!existing) {
    const room = createRoom(roomCode, profile);
    store.set(roomCode, room);
    return NextResponse.json(room);
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
      : [...existing.members, toMember(assignedProfile, role, now)]
  };

  store.set(roomCode, room);
  return NextResponse.json(room);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const roomCode = await getCode(context.params);
  const room = (await request.json()) as RoomState;

  if (room.roomCode !== roomCode) {
    return NextResponse.json({ error: "Room code mismatch" }, { status: 400 });
  }

  store.set(roomCode, room);
  return NextResponse.json(room);
}
