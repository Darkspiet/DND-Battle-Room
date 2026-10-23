import { Pool } from 'pg';
export function dbPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required in every runtime mode. Configure PostgreSQL before starting.');
  if (!globalThis.dndPool) {
    globalThis.dndPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, query_timeout: 15000, statement_timeout: 15000 });
    // pg removes failed idle clients; an outage must reject requests rather than crash Node.
    globalThis.dndPool.on('error', () => {});
  }
  return globalThis.dndPool;
}
export async function databaseReady() {
  await dbPool().query('select id from dm_profiles limit 0');
  await dbPool().query('select revision from room_snapshots limit 0');
}
