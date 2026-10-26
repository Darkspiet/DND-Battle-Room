import './load-config.mjs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword, validateCredentials } from '../lib/authCredentials.mjs';

export async function bootstrapDM(pool, { username, password, name }) {
  username = validateCredentials(username, password);
  if (password.length < 12) throw new Error('The initial DM password must contain at least 12 characters.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('lock table users in exclusive mode');
    const existing = await client.query('select username from users');
    if (existing.rowCount) {
      if (!existing.rows.some(row => row.username === username)) throw new Error('Database already has DM accounts; refusing to bootstrap another account.');
      await client.query('rollback');
      return false;
    }
    const credential = await hashPassword(password);
    await client.query(`insert into users (id, username, display_name, color, password_hash, role)
      values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), username, name.trim() || username, '#b7394b', `scrypt-v1:${credential.salt}:${credential.hash}`, 'dm']);
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1] ?? '').href) {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const [username, password, name] = input.split('\0');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const created = await bootstrapDM(pool, { username, password, name });
    console.log(created ? 'Initial DM created.' : 'Existing DM preserved.');
  } catch {
    console.error('DM bootstrap failed; check username, password policy, and database access.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
