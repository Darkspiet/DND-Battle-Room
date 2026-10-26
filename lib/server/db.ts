import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../db/schema";

declare global {
  var dndDatabasePool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. DND Battle Room no longer falls back to browser or JSON storage.");
  }
  const pool = new Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5000, query_timeout: 10000, statement_timeout: 10000 });
  pool.on("error", () => console.error("PostgreSQL connection lost; reconnecting on the next request."));
  return pool;
}

export const pool = globalThis.dndDatabasePool ?? createPool();
globalThis.dndDatabasePool = pool;

export const db = drizzle({ client: pool, schema });
