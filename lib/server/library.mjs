import { randomUUID } from "node:crypto";
import { dbPool } from "../db.mjs";
import {
  requireThat,
  object,
  text,
  identifier,
  image,
  number,
  oneOf,
} from "../validation.mjs";
import { requireActor } from "./auth.mjs";
function libraryItem(row) {
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
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}
export async function listLibrary(header) {
  await requireActor(header, true);
  return (
    await dbPool().query(
      "select * from public_library_items order by updated_at desc limit 50",
    )
  ).rows.map(libraryItem);
}
export async function saveLibrary(header, input) {
  const actor = await requireActor(header, true);
  object(input, [
    "id",
    "kind",
    "name",
    "category",
    "icon",
    "imageUrl",
    "imageName",
    "tokenType",
    "size",
    "hp",
    "note",
  ]);
  const values = [
    oneOf(input.kind, ["token", "object"]),
    text(input.name, 100).trim() || "Preset",
    text(input.category, 100, ""),
    text(input.icon, 32, "●"),
    image(input.imageUrl) ?? null,
    text(input.imageName, 150, "") || null,
    oneOf(input.tokenType, ["character", "npc", "monster", "object"]),
    number(input.size ?? 1, 1, 6),
    text(input.hp, 150, "") || null,
    text(input.note, 4000, "") || null,
  ];
  requireThat(
    Number.isInteger(values[7]),
    "Preset size must be a whole number.",
  );
  if (input.id) {
    const result = await dbPool().query(
      `update public_library_items set kind=$2,name=$3,category=$4,icon=$5,image_url=$6,image_name=$7,token_type=$8,size=$9,hp=$10,note=$11,updated_at=now() where id=$1 and created_by=$12 returning *`,
      [identifier(input.id), ...values, actor.id],
    );
    requireThat(result.rowCount, "Preset not found or not owned by you.", 403);
    return libraryItem(result.rows[0]);
  }
  const result = await dbPool().query(
    `insert into public_library_items(id,kind,name,category,icon,image_url,image_name,token_type,size,hp,note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    ["preset_" + randomUUID(), ...values, actor.id],
  );
  return libraryItem(result.rows[0]);
}
