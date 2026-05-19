import { NextRequest, NextResponse } from "next/server";
import { getServerRoom, joinServerRoom, setServerRoom } from "../../../../lib/roomStore";
import type { GuestProfile, RoomState } from "../../../../lib/types";

async function getCode(params: Promise<{ roomCode: string }>) {
  const { roomCode } = await params;
  return roomCode.toUpperCase();
}

export async function GET(_request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const roomCode = await getCode(context.params);
  const room = getServerRoom(roomCode);

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

  return NextResponse.json(joinServerRoom(roomCode, profile));
}

export async function PUT(request: NextRequest, context: { params: Promise<{ roomCode: string }> }) {
  const roomCode = await getCode(context.params);
  const room = (await request.json()) as RoomState;

  if (room.roomCode !== roomCode) {
    return NextResponse.json({ error: "Room code mismatch" }, { status: 400 });
  }

  return NextResponse.json(setServerRoom(room));
}
