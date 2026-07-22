import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to apply the self-hosted Postgres schema.");
  process.exit(1);
}

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString });

try {
  await pool.query(schema);
  console.log("Applied db/schema.sql");
} finally {
  await pool.end();
}
