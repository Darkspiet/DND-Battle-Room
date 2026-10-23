import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { dbPool } from "../db.mjs";
import {
  requireThat,
  object,
  text,
  identifier,
  image,
  color,
  array,
  rateLimit,
} from "../validation.mjs";
import {
  initialRoom,
  member,
  roomView,
  applyCommands,
} from "../roomEngine.mjs";
import { publicProfile, sessionFor, readActor, requireActor } from "./auth.mjs";
function roomSummary(row) {
  return {
    id: row.id,
    roomCode: row.room_code,
    name: row.name,
    dmUserId: row.dm_user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}
export async function listRooms(header) {
  const actor = await requireActor(header, true);
  return (
    await dbPool().query(
      "select * from dm_rooms where dm_user_id=$1 order by updated_at desc limit 100",
      [actor.id],
    )
  ).rows.map(roomSummary);
}
export async function saveRoomMetadata(header, input) {
  const actor = await requireActor(header, true);
  object(input, ["id", "name"]);
  const name = text(input.name, 100).trim() || "Untitled Room";
  if (input.id) {
    const result = await dbPool().query(
      "update dm_rooms set name=$2,updated_at=now() where id=$1 and dm_user_id=$3 returning *",
      [identifier(input.id), name, actor.id],
    );
    requireThat(result.rowCount, "Room not found or not owned by you.", 403);
    return roomSummary(result.rows[0]);
  }
  const client = await dbPool().connect();
  try {
    await client.query("begin");
    await client.query("select id from dm_profiles where id=$1 for update", [
      actor.id,
    ]);
    requireThat(
      Number(
        (
          await client.query(
            "select count(*) from dm_rooms where dm_user_id=$1",
            [actor.id],
          )
        ).rows[0].count,
      ) < 100,
      "Room limit reached.",
    );
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
      code = Array.from(
        { length: 8 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    const result = await client.query(
      "insert into dm_rooms(id,room_code,name,dm_user_id) values($1,$2,$3,$4) returning *",
      ["room_" + randomUUID(), code, name, actor.id],
    );
    await client.query(
      "insert into room_snapshots(room_code,state,revision) values($1,$2,0)",
      [code, JSON.stringify(initialRoom(code, actor))],
    );
    await client.query("commit");
    return roomSummary(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
function codeValue(code) {
  requireThat(
    typeof code === "string" && /^[A-Z0-9-]{3,12}$/.test(code),
    "Invalid room code.",
  );
  return code;
}
async function loadLocked(client, code) {
  const result = await client.query(
    `select s.state,s.revision,r.dm_user_id from room_snapshots s join dm_rooms r on r.room_code=s.room_code where s.room_code=$1 for update of s`,
    [codeValue(code)],
  );
  requireThat(result.rowCount, "Room not found.", 404);
  const room = result.rows[0].state;
  room.dmId = result.rows[0].dm_user_id;
  room.revision = Number(result.rows[0].revision);
  return room;
}
function admitted(room, actor) {
  requireThat(
    actor.id === room.dmId || room.members.some((m) => m.id === actor.id),
    "Join this room first.",
    403,
  );
}
export async function roomStatus(code) {
  codeValue(code);
  return {
    exists: !!(
      await dbPool().query("select 1 from dm_rooms where room_code=$1", [code])
    ).rowCount,
  };
}
export async function joinRoom(header, code, input) {
  object(input, ["nickname", "color", "avatarUrl", "avatarName"]);
  codeValue(code);
  let actor = await readActor(header),
    sessionToken;
  const client = await dbPool().connect();
  try {
    await client.query("begin");
    const room = await loadLocked(client, code);
    if (!actor) {
      const id = "guest_" + randomUUID(),
        name = text(input.nickname, 100, "Adventurer").trim() || "Adventurer";
      const result = await client.query(
        "insert into guest_profiles(id,display_name,color,avatar_url,avatar_name) values($1,$2,$3,$4,$5) returning *",
        [
          id,
          name,
          color(input.color ?? "#3d8bfd"),
          image(input.avatarUrl) ?? null,
          text(input.avatarName, 150, "") || null,
        ],
      );
      actor = { ...publicProfile(result.rows[0]), kind: "guest" };
      sessionToken = await sessionFor(client, id, "guest");
    }
    const current = room.members.find((m) => m.id === actor.id);
    if (!current) {
      room.members = room.members.filter(
        (m) =>
          m.id === room.dmId ||
          room.tokens.some((t) => t.ownerId === m.id) ||
          Date.now() - m.lastSeen < 14 * 86400000,
      );
      requireThat(room.members.length < 100, "Room member limit reached.");
      const used = new Set(room.members.map((m) => m.color.toLowerCase()));
      let assigned = actor.color;
      while (used.has(assigned.toLowerCase()))
        assigned = "#" + randomBytes(3).toString("hex");
      room.members.push(
        member(
          { ...actor, color: assigned },
          actor.id === room.dmId ? "dm" : "player",
        ),
      );
    } else {
      current.role = actor.id === room.dmId ? "dm" : "player";
      current.lastSeen = Date.now();
    }
    room.revision++;
    await client.query(
      "update room_snapshots set state=$2,revision=$3,updated_at=now() where room_code=$1",
      [code, JSON.stringify(room), room.revision],
    );
    await client.query("commit");
    notify(code);
    const profile = room.members.find((m) => m.id === actor.id);
    return { room: roomView(room, actor), profile, sessionToken };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
export async function readRoom(header, code) {
  const actor = await requireActor(header);
  codeValue(code);
  const result = await dbPool().query(
    "select s.state,s.revision,r.dm_user_id from room_snapshots s join dm_rooms r on r.room_code=s.room_code where s.room_code=$1",
    [code],
  );
  requireThat(result.rowCount, "Room not found.", 404);
  const room = result.rows[0].state;
  room.dmId = result.rows[0].dm_user_id;
  room.revision = Number(result.rows[0].revision);
  admitted(room, actor);
  return roomView(room, actor);
}
export async function roomCommand(header, code, input) {
  const actor = await requireActor(header);
  object(input, ["id", "commands", "revision"]);
  const id = identifier(input.id);
  array(input.commands, 100);
  rateLimit("commands:" + actor.id, 240, 60000);
  const client = await dbPool().connect();
  try {
    await client.query("begin");
    const room = await loadLocked(client, code);
    admitted(room, actor);
    const prior = await client.query(
      "select 1 from room_commands where room_code=$1 and actor_id=$2 and command_id=$3",
      [code, actor.id, id],
    );
    if (prior.rowCount) {
      await client.query("rollback");
      return roomView(room, actor);
    }
    if (input.revision !== undefined)
      requireThat(
        input.revision === room.revision,
        "Room changed; refresh and retry this action.",
        409,
      );
    const next = applyCommands(room, actor, input.commands);
    next.revision = room.revision + 1;
    await client.query(
      "update room_snapshots set state=$2,revision=$3,updated_at=now() where room_code=$1",
      [code, JSON.stringify(next), next.revision],
    );
    await client.query(
      "insert into room_commands(room_code,actor_id,command_id) values($1,$2,$3)",
      [code, actor.id, id],
    );
    await client.query("commit");
    notify(code);
    return roomView(next, actor);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
function notify(code) {
  try {
    Promise.resolve(globalThis.dndRoomChanged?.(code)).catch(() => {});
  } catch {
    /* Notifications do not change commit status. */
  }
}
export async function cleanup() {
  await dbPool().query("delete from dm_sessions where expires_at<=now()");
  await dbPool().query("delete from guest_sessions where expires_at<=now()");
  await dbPool().query(
    "delete from room_commands where created_at<now()-interval '1 day'",
  );
  await dbPool().query(
    "delete from guest_profiles g where created_at<now()-interval '30 days' and not exists(select 1 from guest_sessions s where s.profile_id=g.id)",
  );
}
