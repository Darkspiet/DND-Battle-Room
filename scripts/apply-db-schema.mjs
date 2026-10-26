import './load-config.mjs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to apply the PostgreSQL schema.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query('select pg_advisory_lock(71624431)');
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) });
  console.log('PostgreSQL migrations applied.');
} finally {
  await client.query('select pg_advisory_unlock(71624431)').catch(() => {});
  client.release();
  await pool.end();
}
