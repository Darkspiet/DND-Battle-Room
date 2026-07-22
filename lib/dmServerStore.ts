import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import type { DMUser } from "./dmData";
import type { DMRoomSummary, LibraryItem, LibraryItemKind, TokenType } from "./types";

type StoredDMProfile = DMUser & {
  passwordHash: string;
  passwordSalt: string;
};

type StoredSession = {
  profileId: string;
  createdAt: number;
};

type DMDatabase = {
  profiles: StoredDMProfile[];
  sessions: Record<string, StoredSession>;
  rooms?: DMRoomSummary[];
  library?: LibraryItem[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "dm-backend.json");
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 14;
const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE / 1000;

let pool: Pool | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function emptyDatabase(): DMDatabase {
  return { profiles: [], sessions: {}, rooms: [], library: [] };
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

function publicProfile(profile: StoredDMProfile): DMUser {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...user } = profile;
  return user;
}

function publicProfileFromRow(row: {
  id: string;
  username: string;
  display_name: string;
  color: string;
  avatar_url: string | null;
  avatar_name: string | null;
  created_at: Date | string | number;
  updated_at: Date | string | number;
}): DMUser {
  return {
    id: row.id,
    username: row.username,
    name: row.display_name,
    color: row.color,
    avatarUrl: row.avatar_url ?? undefined,
    avatarName: row.avatar_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

async function readDatabase() {
  try {
    const stored = await readFile(DB_PATH, "utf8");
    return JSON.parse(stored) as DMDatabase;
  } catch {
    return emptyDatabase();
  }
}

async function writeDatabase(database: DMDatabase) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DB_PATH, JSON.stringify(database, null, 2));
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex")
  };
}

function passwordMatches(password: string, profile: StoredDMProfile) {
  const attempted = Buffer.from(hashPassword(password, profile.passwordSalt).hash, "hex");
  const stored = Buffer.from(profile.passwordHash, "hex");
  return attempted.length === stored.length && timingSafeEqual(attempted, stored);
}

function createSession(database: DMDatabase, profileId: string) {
  const token = randomBytes(32).toString("hex");
  database.sessions[token] = {
    profileId,
    createdAt: Date.now()
  };
  return token;
}

function hashSessionToken(token: string) {
  return scryptSync(token, "dnd-battle-room-session", 64).toString("hex");
}

function pruneSessions(database: DMDatabase) {
  const cutoff = Date.now() - SESSION_MAX_AGE;
  for (const [token, session] of Object.entries(database.sessions)) {
    if (session.createdAt < cutoff) {
      delete database.sessions[token];
    }
  }
}

export async function createLocalDMAccount(input: {
  username: string;
  password: string;
  name: string;
  color: string;
  avatarUrl?: string;
  avatarName?: string;
}) {
  const username = normalizeUsername(input.username);
  if (username.length < 3) throw new Error("Use at least 3 letters or numbers for the username.");
  if (input.password.length < 4) throw new Error("Use a password with at least 4 characters.");
  const db = getPool();
  if (db) {
    const now = Date.now();
    const password = hashPassword(input.password);
    const id = `dm_${randomBytes(8).toString("hex")}`;
    const sessionToken = randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(sessionToken);
    const client = await db.connect();
    try {
      await client.query("begin");
      const inserted = await client.query(
        `insert into dm_profiles
          (id, username, display_name, color, avatar_url, avatar_name, password_hash, password_salt, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9 / 1000.0), to_timestamp($9 / 1000.0))
         returning id, username, display_name, color, avatar_url, avatar_name, created_at, updated_at`,
        [
          id,
          username,
          input.name.trim() || username,
          input.color || "#b7394b",
          input.avatarUrl ?? null,
          input.avatarName ?? null,
          password.hash,
          password.salt,
          now
        ]
      );
      await client.query(
        "insert into dm_sessions (token_hash, profile_id, expires_at) values ($1, $2, now() + ($3 || ' seconds')::interval)",
        [tokenHash, id, SESSION_MAX_AGE_SECONDS]
      );
      await client.query("commit");
      return { user: publicProfileFromRow(inserted.rows[0]), sessionToken };
    } catch (caught) {
      await client.query("rollback");
      if (caught instanceof Error && "code" in caught && caught.code === "23505") {
        throw new Error("That DM username is already taken.");
      }
      throw caught;
    } finally {
      client.release();
    }
  }

  const database = await readDatabase();
  pruneSessions(database);
  if (database.profiles.some((profile) => profile.username === username)) {
    throw new Error("That DM username is already taken.");
  }

  const now = Date.now();
  const password = hashPassword(input.password);
  const profile: StoredDMProfile = {
    id: `dm_${randomBytes(8).toString("hex")}`,
    username,
    name: input.name.trim() || username,
    color: input.color || "#b7394b",
    avatarUrl: input.avatarUrl,
    avatarName: input.avatarName,
    createdAt: now,
    updatedAt: now,
    passwordHash: password.hash,
    passwordSalt: password.salt
  };
  database.profiles.push(profile);
  const sessionToken = createSession(database, profile.id);
  await writeDatabase(database);
  return { user: publicProfile(profile), sessionToken };
}

export async function signInLocalDMAccount(usernameInput: string, password: string) {
  const username = normalizeUsername(usernameInput);
  const db = getPool();
  if (db) {
    const profile = await db.query(
      `select id, username, display_name, color, avatar_url, avatar_name, password_hash, password_salt, created_at, updated_at
       from dm_profiles
       where username = $1`,
      [username]
    );
    const row = profile.rows[0];
    if (!row || !passwordMatches(password, { ...publicProfileFromRow(row), passwordHash: row.password_hash, passwordSalt: row.password_salt })) {
      throw new Error("DM username or password is incorrect.");
    }
    const sessionToken = randomBytes(32).toString("hex");
    await db.query("delete from dm_sessions where expires_at < now()");
    await db.query(
      "insert into dm_sessions (token_hash, profile_id, expires_at) values ($1, $2, now() + ($3 || ' seconds')::interval)",
      [hashSessionToken(sessionToken), row.id, SESSION_MAX_AGE_SECONDS]
    );
    return { user: publicProfileFromRow(row), sessionToken };
  }

  const database = await readDatabase();
  pruneSessions(database);
  const profile = database.profiles.find((item) => item.username === username);
  if (!profile || !passwordMatches(password, profile)) {
    throw new Error("DM username or password is incorrect.");
  }

  const sessionToken = createSession(database, profile.id);
  await writeDatabase(database);
  return { user: publicProfile(profile), sessionToken };
}

export async function getLocalDMBySession(sessionToken?: string) {
  if (!sessionToken) return null;
  const db = getPool();
  if (db) {
    await db.query("delete from dm_sessions where expires_at < now()");
    const result = await db.query(
      `select p.id, p.username, p.display_name, p.color, p.avatar_url, p.avatar_name, p.created_at, p.updated_at
       from dm_sessions s
       join dm_profiles p on p.id = s.profile_id
       where s.token_hash = $1 and s.expires_at > now()`,
      [hashSessionToken(sessionToken)]
    );
    return result.rows[0] ? publicProfileFromRow(result.rows[0]) : null;
  }

  const database = await readDatabase();
  pruneSessions(database);
  const session = database.sessions[sessionToken];
  if (!session) {
    await writeDatabase(database);
    return null;
  }
  const profile = database.profiles.find((item) => item.id === session.profileId);
  await writeDatabase(database);
  return profile ? publicProfile(profile) : null;
}

export async function updateLocalDMProfile(sessionToken: string | undefined, update: Partial<DMUser>) {
  if (!sessionToken) throw new Error("Sign in before updating the DM profile.");
  const db = getPool();
  if (db) {
    const user = await getLocalDMBySession(sessionToken);
    if (!user) throw new Error("Sign in before updating the DM profile.");
    const result = await db.query(
      `update dm_profiles
       set display_name = $2,
           color = $3,
           avatar_url = $4,
           avatar_name = $5,
           updated_at = now()
       where id = $1
       returning id, username, display_name, color, avatar_url, avatar_name, created_at, updated_at`,
      [
        user.id,
        update.name?.trim() || user.name,
        update.color || user.color,
        update.avatarUrl ?? null,
        update.avatarName ?? null
      ]
    );
    return publicProfileFromRow(result.rows[0]);
  }

  const database = await readDatabase();
  pruneSessions(database);
  const session = database.sessions[sessionToken];
  if (!session) throw new Error("Sign in before updating the DM profile.");
  const index = database.profiles.findIndex((profile) => profile.id === session.profileId);
  if (index < 0) throw new Error("DM profile was not found.");

  database.profiles[index] = {
    ...database.profiles[index],
    name: update.name?.trim() || database.profiles[index].name,
    color: update.color || database.profiles[index].color,
    avatarUrl: update.avatarUrl,
    avatarName: update.avatarName,
    updatedAt: Date.now()
  };
  await writeDatabase(database);
  return publicProfile(database.profiles[index]);
}

export async function clearLocalDMSession(sessionToken?: string) {
  if (!sessionToken) return;
  const db = getPool();
  if (db) {
    await db.query("delete from dm_sessions where token_hash = $1", [hashSessionToken(sessionToken)]);
    return;
  }
  const database = await readDatabase();
  delete database.sessions[sessionToken];
  await writeDatabase(database);
}

function roomFromRow(row: {
  id: string;
  room_code: string;
  name: string;
  dm_user_id: string;
  created_at: Date | string | number;
  updated_at: Date | string | number;
}): DMRoomSummary {
  return {
    id: row.id,
    roomCode: row.room_code,
    name: row.name,
    dmUserId: row.dm_user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime()
  };
}

export async function loadServerDMRooms(dmUserId: string) {
  const db = getPool();
  if (!db) {
    const database = await readDatabase();
    return (database.rooms ?? []).filter((room) => room.dmUserId === dmUserId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const result = await db.query(
    `select id, room_code, name, dm_user_id, created_at, updated_at
     from dm_rooms
     where dm_user_id = $1
     order by updated_at desc`,
    [dmUserId]
  );
  return result.rows.map(roomFromRow);
}

export async function saveServerDMRoom(room: DMRoomSummary) {
  const db = getPool();
  if (!db) {
    const database = await readDatabase();
    const rooms = database.rooms ?? [];
    database.rooms = [room, ...rooms.filter((item) => item.id !== room.id && item.roomCode !== room.roomCode)];
    await writeDatabase(database);
    return room;
  }
  const result = await db.query(
    `insert into dm_rooms (id, room_code, name, dm_user_id, created_at, updated_at)
     values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0))
     on conflict (id) do update set
       room_code = excluded.room_code,
       name = excluded.name,
       dm_user_id = excluded.dm_user_id,
       updated_at = excluded.updated_at
     returning id, room_code, name, dm_user_id, created_at, updated_at`,
    [room.id, room.roomCode, room.name, room.dmUserId, room.createdAt, room.updatedAt]
  );
  return roomFromRow(result.rows[0]);
}

function libraryFromRow(row: {
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
  created_at: Date | string | number;
  updated_at: Date | string | number;
}): LibraryItem {
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

export async function loadServerLibraryItems() {
  const db = getPool();
  if (!db) {
    const database = await readDatabase();
    return [...(database.library ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const result = await db.query(
    `select id, kind, name, category, icon, image_url, image_name, token_type, size, hp, note, created_by, created_at, updated_at
     from public_library_items
     order by updated_at desc`
  );
  return result.rows.map(libraryFromRow);
}

export async function saveServerLibraryItem(item: LibraryItem) {
  const db = getPool();
  if (!db) {
    const database = await readDatabase();
    const library = database.library ?? [];
    database.library = [item, ...library.filter((entry) => entry.id !== item.id)];
    await writeDatabase(database);
    return item;
  }
  const result = await db.query(
    `insert into public_library_items
      (id, kind, name, category, icon, image_url, image_name, token_type, size, hp, note, created_by, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13 / 1000.0), to_timestamp($14 / 1000.0))
     on conflict (id) do update set
       kind = excluded.kind,
       name = excluded.name,
       category = excluded.category,
       icon = excluded.icon,
       image_url = excluded.image_url,
       image_name = excluded.image_name,
       token_type = excluded.token_type,
       size = excluded.size,
       hp = excluded.hp,
       note = excluded.note,
       created_by = excluded.created_by,
       updated_at = excluded.updated_at
     returning id, kind, name, category, icon, image_url, image_name, token_type, size, hp, note, created_by, created_at, updated_at`,
    [
      item.id,
      item.kind,
      item.name,
      item.category,
      item.icon,
      item.imageUrl ?? null,
      item.imageName ?? null,
      item.tokenType,
      item.size,
      item.hp ?? null,
      item.note ?? null,
      item.createdBy ?? null,
      item.createdAt,
      item.updatedAt
    ]
  );
  return libraryFromRow(result.rows[0]);
}
