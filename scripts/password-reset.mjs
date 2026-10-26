import './load-config.mjs';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { sessionDigest, normalizeUsername } from '../lib/authCredentials.mjs';
if (!process.env.DATABASE_URL || !process.argv[2]) throw new Error('Usage: node scripts/password-reset.mjs USERNAME (with DATABASE_URL configured).');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  const code = `RESET-${randomBytes(24).toString('base64url')}`;
  const result = await pool.query(`insert into password_reset_tokens (token_hash, user_id, expires_at)
    select $1, id, now() + interval '1 hour' from users where username = $2 returning id`, [sessionDigest(code), normalizeUsername(process.argv[2])]);
  if (!result.rowCount) throw new Error('DM account not found.');
  console.log('One-use reset code (expires in one hour): ' + code);
} finally { await pool.end(); }
