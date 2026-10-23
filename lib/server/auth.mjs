import { randomBytes, randomUUID } from "node:crypto";
import { dbPool } from "../db.mjs";
import {
  hashPassword,
  passwordMatches,
  validateCredentials,
  normalizeUsername,
  sessionDigest,
} from "../authCredentials.mjs";
import {
  ApiError,
  requireThat,
  object,
  text,
  image,
  color,
} from "../validation.mjs";
export const SESSION_SECONDS = 14 * 24 * 60 * 60;
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.APP_URL?.startsWith("https://") ?? false,
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
    path: "/",
  };
}
export function publicProfile(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.display_name,
    color: row.color,
    avatarUrl: row.avatar_url ?? undefined,
    avatarName: row.avatar_name ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at ?? row.created_at).getTime(),
  };
}
function cookieValue(header, name) {
  return String(header ?? "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export async function readActor(header, dmOnly = false) {
  for (const kind of dmOnly ? ["dm"] : ["dm", "guest"]) {
    const token = cookieValue(
      header,
      kind === "dm" ? "dnd-dm-session" : "dnd-guest-session",
    );
    if (!token || !/^[a-f0-9]{64}$/.test(token)) continue;
    const table = kind === "dm" ? "dm_sessions" : "guest_sessions",
      profiles = kind === "dm" ? "dm_profiles" : "guest_profiles";
    // Table identifiers are selected exclusively from constants, never user input.
    const result = await dbPool().query(
      `select p.* from ${table} s join ${profiles} p on p.id=s.profile_id where s.token_hash=$1 and s.expires_at>now()`,
      [sessionDigest(token)],
    );
    if (result.rowCount) return { ...publicProfile(result.rows[0]), kind };
  }
  return null;
}
export async function requireActor(header, dmOnly = false) {
  const actor = await readActor(header, dmOnly);
  requireThat(
    actor,
    dmOnly ? "Sign in as DM first." : "Join this room or sign in first.",
    401,
  );
  return actor;
}
export async function sessionFor(client, id, kind) {
  const token = randomBytes(32).toString("hex"),
    table = kind === "dm" ? "dm_sessions" : "guest_sessions";
  await client.query(`delete from ${table} where expires_at<=now()`);
  await client.query(
    `delete from ${table} where profile_id=$1 and token_hash in (select token_hash from ${table} where profile_id=$1 order by expires_at desc offset 9)`,
    [id],
  );
  await client.query(
    `insert into ${table}(token_hash,profile_id,expires_at) values($1,$2,now()+interval '14 days')`,
    [sessionDigest(token), id],
  );
  return token;
}
function profileInput(input) {
  const out = {};
  if (input.name !== undefined)
    out.display_name = text(input.name, 100).trim() || "DM";
  if (input.color !== undefined) out.color = color(input.color);
  if (input.avatarUrl !== undefined)
    out.avatar_url = image(input.avatarUrl) ?? null;
  if (input.avatarName !== undefined)
    out.avatar_name = text(input.avatarName, 150, "") || null;
  return out;
}
export async function createAccount(input) {
  object(input, [
    "username",
    "password",
    "name",
    "color",
    "avatarUrl",
    "avatarName",
  ]);
  let username;
  try {
    username = validateCredentials(input.username, input.password);
  } catch (error) {
    throw new ApiError(400, error.message);
  }
  const credential = await hashPassword(input.password),
    data = profileInput(input),
    id = "dm_" + randomUUID();
  const client = await dbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into dm_profiles(id,username,display_name,color,avatar_url,avatar_name,password_hash,password_salt) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [
        id,
        username,
        data.display_name ?? username,
        data.color ?? "#b7394b",
        data.avatar_url ?? null,
        data.avatar_name ?? null,
        credential.hash,
        credential.salt,
      ],
    );
    const sessionToken = await sessionFor(client, id, "dm");
    await client.query("commit");
    return { user: publicProfile(result.rows[0]), sessionToken };
  } catch (error) {
    await client.query("rollback");
    if (error.code === "23505")
      throw new ApiError(409, "That DM username is already taken.");
    throw error;
  } finally {
    client.release();
  }
}
export async function signIn(input) {
  object(input, ["username", "password"]);
  const username = normalizeUsername(text(input.username, 100));
  const password = text(input.password, 512);
  requireThat(Buffer.byteLength(password) <= 512, "Password is too long.");
  const result = await dbPool().query(
    "select * from dm_profiles where username=$1",
    [username],
  );
  const profile = result.rows[0];
  // Do comparable KDF work for unknown accounts without exposing database details.
  const valid = await passwordMatches(
    password,
    profile ?? {
      password_salt: "00000000000000000000000000000000",
      password_hash: "00".repeat(64),
    },
  );
  requireThat(profile && valid, "DM username or password is incorrect.", 401);
  const client = await dbPool().connect();
  try {
    return {
      user: publicProfile(profile),
      sessionToken: await sessionFor(client, profile.id, "dm"),
    };
  } finally {
    client.release();
  }
}
export async function signOut(header) {
  const token = cookieValue(header, "dnd-dm-session");
  if (token && /^[a-f0-9]{64}$/.test(token))
    await dbPool().query("delete from dm_sessions where token_hash=$1", [
      sessionDigest(token),
    ]);
}
export async function updateProfile(header, input) {
  const actor = await requireActor(header, true);
  object(input, [
    "id",
    "username",
    "name",
    "color",
    "avatarUrl",
    "avatarName",
    "createdAt",
    "updatedAt",
  ]);
  const data = profileInput(input);
  const result = await dbPool().query(
    `update dm_profiles set display_name=$2,color=$3,avatar_url=$4,avatar_name=$5,updated_at=now() where id=$1 returning *`,
    [
      actor.id,
      data.display_name ?? actor.name,
      data.color ?? actor.color,
      data.avatar_url === undefined
        ? (actor.avatarUrl ?? null)
        : data.avatar_url,
      data.avatar_name === undefined
        ? (actor.avatarName ?? null)
        : data.avatar_name,
    ],
  );
  return publicProfile(result.rows[0]);
}
