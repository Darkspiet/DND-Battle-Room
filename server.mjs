import './scripts/load-config.mjs';
import { Pool } from 'pg';
process.env.NODE_ENV = 'production';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for production PostgreSQL storage.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try { await pool.query('select 1 from users limit 0'); }
catch { throw new Error('PostgreSQL is unavailable or the schema is missing. Check configuration and apply migrations.'); }
finally { await pool.end(); }
await import('./dist/server.js');
