"use client";

import type { DMRoomSummary, LibraryItem, LibraryItemKind, TokenType } from "./types";
import { getBrowserSupabaseClient, hasSupabaseConfig } from "./supabaseRoom";

const DM_ROOMS_KEY = "dnd-battle-room-dm-rooms";
const LIBRARY_KEY = "dnd-battle-room-public-library";

export type DMUser = {
  id: string;
  username: string;
  name: string;
  color: string;
  avatarUrl?: string;
  avatarName?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type DMAuthResult = {
  user: DMUser | null;
  needsEmailConfirmation?: boolean;
};

type DMRoomRow = {
  id: string;
  room_code: string;
  name: string;
  dm_user_id: string;
  created_at: string;
  updated_at: string;
};

type DMProfileRow = {
  user_id: string;
  username: string;
  display_name: string;
  color: string;
  avatar_url: string | null;
  avatar_name: string | null;
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

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

function usernameToAuthEmail(username: string) {
  return `${normalizeUsername(username)}@dm.dnd-battle-room.local`;
}

async function requestLocalDMBackend(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = (await response.json()) as { user?: DMUser | null; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "DM backend request failed.");
  }
  return data.user ?? null;
}

async function requestLocalJson<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const data = (await response.json()) as Record<string, T> & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "DM backend request failed.");
  }
  return data[key];
}

function fromProfileRow(row: DMProfileRow): DMUser {
  return {
    id: row.user_id,
    username: row.username,
    name: row.display_name,
    color: row.color,
    avatarUrl: row.avatar_url ?? undefined,
    avatarName: row.avatar_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

function toProfileRow(profile: DMUser) {
  return {
    user_id: profile.id,
    username: normalizeUsername(profile.username),
    display_name: profile.name.trim() || profile.username,
    color: profile.color || "#b7394b",
    avatar_url: profile.avatarUrl ?? null,
    avatar_name: profile.avatarName ?? null,
    updated_at: new Date().toISOString()
  };
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

export async function getCurrentDMUser(): Promise<DMUser | null> {
  if (!hasSupabaseConfig()) {
    return requestLocalDMBackend("/api/dm/session");
  }
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const profile = await loadDMProfile(data.user.id);
  if (profile) return profile;
  const username = normalizeUsername(data.user.user_metadata?.username ?? data.user.email?.split("@")[0] ?? "dm");
  return saveDMProfile({
    id: data.user.id,
    username,
    name: data.user.user_metadata?.name ?? username,
    color: data.user.user_metadata?.color ?? "#b7394b"
  });
}

export async function signInDM(username: string, password: string): Promise<DMAuthResult> {
  const supabase = getBrowserSupabaseClient();
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) throw new Error("Enter a DM username.");
  if (!supabase) {
    return {
      user: await requestLocalDMBackend("/api/dm/signin", {
        method: "POST",
        body: JSON.stringify({ username: normalizedUsername, password })
      })
    };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToAuthEmail(normalizedUsername),
    password
  });
  if (error) throw error;
  if (!data.user) return { user: null };
  return { user: await getCurrentDMUser() };
}

export async function createDMAccount(input: {
  username: string;
  password: string;
  name: string;
  color: string;
  avatarUrl?: string;
  avatarName?: string;
}): Promise<DMAuthResult> {
  const supabase = getBrowserSupabaseClient();
  const username = normalizeUsername(input.username);
  if (username.length < 3) throw new Error("Use at least 3 letters or numbers for the username.");
  if (input.password.length < 4) throw new Error("Use a password with at least 4 characters.");
  const name = input.name.trim() || username;
  if (!supabase) {
    return {
      user: await requestLocalDMBackend("/api/dm/signup", {
        method: "POST",
        body: JSON.stringify({
          username,
          password: input.password,
          name,
          color: input.color,
          avatarUrl: input.avatarUrl,
          avatarName: input.avatarName
        })
      })
    };
  }
  const { data, error } = await supabase.auth.signUp({
    email: usernameToAuthEmail(username),
    password: input.password,
    options: {
      data: {
        username,
        name,
        color: input.color
      }
    }
  });
  if (error) throw error;
  if (!data.user) return { user: null };
  if (!data.session) return { user: null, needsEmailConfirmation: true };
  const user = await saveDMProfile({
    id: data.user.id,
    username,
    name,
    color: input.color,
    avatarUrl: input.avatarUrl,
    avatarName: input.avatarName
  });
  return { user };
}

export async function loadDMProfile(userId: string) {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("dm_profiles")
    .select("user_id,username,display_name,color,avatar_url,avatar_name,created_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle<DMProfileRow>();

  if (error || !data) return null;
  return fromProfileRow(data);
}

export async function saveDMProfile(profile: DMUser) {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
    const user = await requestLocalDMBackend("/api/dm/profile", {
      method: "PUT",
      body: JSON.stringify(profile)
    });
    return user ?? profile;
  }
  const { data, error } = await supabase
    .from("dm_profiles")
    .upsert(toProfileRow(profile), { onConflict: "user_id" })
    .select("user_id,username,display_name,color,avatar_url,avatar_name,created_at,updated_at")
    .single<DMProfileRow>();

  if (error) throw error;
  return {
    ...fromProfileRow(data),
    avatarUrl: profile.avatarUrl ?? fromProfileRow(data).avatarUrl,
    avatarName: profile.avatarName ?? fromProfileRow(data).avatarName
  };
}

export async function signOutDM() {
  const supabase = getBrowserSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
    return;
  }
  await fetch("/api/dm/session", { method: "DELETE" });
}

export async function loadDMRooms(dmUserId: string) {
  const fallback = readJson<DMRoomSummary[]>(DM_ROOMS_KEY, []).filter((room) => room.dmUserId === dmUserId);
  const supabase = getBrowserSupabaseClient();
  if (!supabase) {
    try {
      return await requestLocalJson<DMRoomSummary[]>("/api/dm/rooms", "rooms");
    } catch {
      return fallback;
    }
  }

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
  if (!supabase) {
    try {
      return await requestLocalJson<DMRoomSummary>("/api/dm/rooms", "room", {
        method: "POST",
        body: JSON.stringify(room)
      });
    } catch {
      return room;
    }
  }

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
  if (!supabase) {
    try {
      return await requestLocalJson<LibraryItem[]>("/api/dm/library", "library");
    } catch {
      return fallback;
    }
  }

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
  if (!supabase) {
    try {
      return await requestLocalJson<LibraryItem>("/api/dm/library", "item", {
        method: "POST",
        body: JSON.stringify(item)
      });
    } catch {
      return item;
    }
  }

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
