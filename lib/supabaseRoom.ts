"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { resolvePlayerColor } from "./playerColors";
import type { GuestProfile, RoomState } from "./types";
import { createEmptyRoom, saveRoom, toMember } from "./storage";

type RoomSnapshotRow = {
  room_code: string;
  state: RoomState;
  updated_at: string;
};

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function getClient() {
  if (!hasSupabaseConfig()) return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    );
  }
  return browserClient;
}

function joinState(room: RoomState, profile: GuestProfile): RoomState {
  const now = Date.now();
  const currentMember = room.members.find((member) => member.id === profile.id);
  const role = room.dmId === profile.id ? "dm" : "player";
  const color = resolvePlayerColor(room.members, profile.id, currentMember?.color);
  const assignedProfile = { ...profile, color };

  return {
    ...room,
    members: currentMember
      ? room.members.map((member) =>
          member.id === profile.id ? { ...member, ...assignedProfile, role: member.role, lastSeen: now } : member
        )
      : [...room.members, toMember(assignedProfile, role, now)]
  };
}

export async function joinSupabaseRoom(roomCode: string, profile: GuestProfile) {
  const supabase = getClient();
  if (!supabase) return null;

  const code = roomCode.toUpperCase();
  const { data, error } = await supabase
    .from("room_snapshots")
    .select("room_code,state,updated_at")
    .eq("room_code", code)
    .maybeSingle<RoomSnapshotRow>();

  if (error) {
    throw error;
  }

  const next = data?.state ? joinState(data.state, profile) : createEmptyRoom(code, profile);
  const saved = await saveSupabaseRoom(next);
  saveRoom(saved);
  return saved;
}

export async function saveSupabaseRoom(room: RoomState) {
  const supabase = getClient();
  if (!supabase) return room;

  const { data, error } = await supabase
    .from("room_snapshots")
    .upsert(
      {
        room_code: room.roomCode,
        state: room,
        updated_at: new Date().toISOString()
      },
      { onConflict: "room_code" }
    )
    .select("room_code,state,updated_at")
    .single<RoomSnapshotRow>();

  if (error) {
    throw error;
  }

  return data.state;
}

export function subscribeToSupabaseRoom(roomCode: string, onRoom: (room: RoomState) => void) {
  const supabase = getClient();
  if (!supabase) return null;

  const channel: RealtimeChannel = supabase
    .channel(`room-snapshot-${roomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_snapshots",
        filter: `room_code=eq.${roomCode.toUpperCase()}`
      },
      (payload) => {
        const row = payload.new as RoomSnapshotRow | null;
        if (row?.state) {
          onRoom(row.state);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
