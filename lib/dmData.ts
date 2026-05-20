"use client";

import type { DMRoomSummary, LibraryItem, LibraryItemKind, TokenType } from "./types";
import { getBrowserSupabaseClient, hasSupabaseConfig } from "./supabaseRoom";

const DM_USER_KEY = "dnd-battle-room-local-dm";
const DM_ROOMS_KEY = "dnd-battle-room-dm-rooms";
const LIBRARY_KEY = "dnd-battle-room-public-library";

export type DMUser = {
  id: string;
  email: string;
  name: string;
  isLocalFallback?: boolean;
};

type DMRoomRow = {
  id: string;
  room_code: string;
  name: string;
  dm_user_id: string;
  created_at: string;
  updated_at: string;
};

type LibraryItemRow = {
  id: string;
  kind: LibraryItemKind;
  name: string;
  category: string;
  icon: string;
  image_url: string | null;
  image_name: string | null;
  token_type: TokenType;
  size: number;
  hp: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

export function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function fromRoomRow(row: DMRoomRow): DMRoomSummary {
  return {
    id: row.id,
    roomCode: row.room_code,
    name: row.name,
    dmUserId: row.dm_user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

function toRoomRow(room: DMRoomSummary) {
  return {
    id: room.id,
    room_code: room.roomCode,
    name: room.name,
    dm_user_id: room.dmUserId,
    created_at: new Date(room.createdAt).toISOString(),
    updated_at: new Date(room.updatedAt).toISOString()
  };
}

function fromLibraryRow(row: LibraryItemRow): LibraryItem {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: row.category,
    icon: row.icon,
    imageUrl: row.image_url ?? undefined,
    imageName: row.image_name ?? undefined,
    tokenType: row.token_type,
    size: row.size,
    hp: row.hp ?? undefined,
    note: row.note ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

function toLibraryRow(item: LibraryItem) {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    category: item.category,
    icon: item.icon,
    image_url: item.imageUrl ?? null,
    image_name: item.imageName ?? null,
    token_type: item.tokenType,
    size: item.size,
    hp: item.hp ?? null,
    note: item.note ?? null,
    created_by: item.createdBy ?? null,
    created_at: new Date(item.createdAt).toISOString(),
    updated_at: new Date(item.updatedAt).toISOString()
  };
}

export function getLocalDMUser(): DMUser {
  const stored = readJson<DMUser | null>(DM_USER_KEY, null);
  if (stored) return stored;
  const next = {
    id: createId("dm"),
    email: "local-dm@battle-room.invalid",
    name: "Local DM",
    isLocalFallback: true
  };
  writeJson(DM_USER_KEY, next);
  return next;
}

export function saveLocalDMUser(user: DMUser) {
  writeJson(DM_USER_KEY, user);
}

export async function getCurrentDMUser(): Promise<DMUser | null> {
  if (!hasSupabaseConfig()) return getLocalDMUser();
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return getLocalDMUser();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "dm@battle-room.invalid",
    name: data.user.user_metadata?.name ?? data.user.email?.split("@")[0] ?? "Dungeon Master"
  };
}

export async function signOutDM() {
  const supabase = getBrowserSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function loadDMRooms(dmUserId: string) {
  const fallback = readJson<DMRoomSummary[]>(DM_ROOMS_KEY, []).filter((room) => room.dmUserId === dmUserId);
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("dm_rooms")
    .select("id,room_code,name,dm_user_id,created_at,updated_at")
    .eq("dm_user_id", dmUserId)
    .order("updated_at", { ascending: false });

  if (error) return fallback;
  return (data as DMRoomRow[]).map(fromRoomRow);
}

export async function saveDMRoom(room: DMRoomSummary) {
  const local = readJson<DMRoomSummary[]>(DM_ROOMS_KEY, []);
  writeJson(DM_ROOMS_KEY, [room, ...local.filter((item) => item.id !== room.id && item.roomCode !== room.roomCode)]);

  const supabase = getBrowserSupabaseClient();
  if (!supabase) return room;

  const { data, error } = await supabase
    .from("dm_rooms")
    .upsert(toRoomRow(room), { onConflict: "id" })
    .select("id,room_code,name,dm_user_id,created_at,updated_at")
    .single<DMRoomRow>();

  if (error) return room;
  return fromRoomRow(data);
}

export async function loadLibraryItems() {
  const fallback = readJson<LibraryItem[]>(LIBRARY_KEY, []);
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return fallback;

  const { data, error } = await supabase
    .from("public_library_items")
    .select("id,kind,name,category,icon,image_url,image_name,token_type,size,hp,note,created_by,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (error) return fallback;
  return (data as LibraryItemRow[]).map(fromLibraryRow);
}

export async function saveLibraryItem(item: LibraryItem) {
  const local = readJson<LibraryItem[]>(LIBRARY_KEY, []);
  writeJson(LIBRARY_KEY, [item, ...local.filter((entry) => entry.id !== item.id)]);

  const supabase = getBrowserSupabaseClient();
  if (!supabase) return item;

  const { data, error } = await supabase
    .from("public_library_items")
    .upsert(toLibraryRow(item), { onConflict: "id" })
    .select("id,kind,name,category,icon,image_url,image_name,token_type,size,hp,note,created_by,created_at,updated_at")
    .single<LibraryItemRow>();

  if (error) return item;
  return fromLibraryRow(data);
}

export function createLibraryItem(input: {
  kind: LibraryItemKind;
  name: string;
  category?: string;
  icon?: string;
  imageUrl?: string;
  imageName?: string;
  tokenType?: TokenType;
  size?: number;
  hp?: string;
  note?: string;
  createdBy?: string;
}): LibraryItem {
  const now = Date.now();
  return {
    id: createId(input.kind === "object" ? "object_preset" : "token_preset"),
    kind: input.kind,
    name: input.name.trim() || (input.kind === "object" ? "Map Object" : "Token Preset"),
    category: input.category?.trim() || (input.kind === "object" ? "Props" : "Creatures"),
    icon: input.icon?.trim() || (input.kind === "object" ? "□" : "●"),
    imageUrl: input.imageUrl,
    imageName: input.imageName,
    tokenType: input.tokenType ?? (input.kind === "object" ? "object" : "monster"),
    size: Math.max(1, Math.min(6, input.size ?? 1)),
    hp: input.hp?.trim() || undefined,
    note: input.note?.trim() || undefined,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now
  };
}
