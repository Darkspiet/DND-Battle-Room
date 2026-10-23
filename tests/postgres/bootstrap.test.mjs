import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { bootstrapDM } from '../../scripts/bootstrap-dm.mjs';
import { hashPassword } from '../../lib/authCredentials.mjs';

test('real PostgreSQL provisioning, schema, first login credentials and retries', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const suffix = randomBytes(6).toString('hex');
  const role = `installer_${suffix}`;
  const database = `installer_${suffix}`;
  const password = `long ' " \\ $ # @ : / % ü password`;
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-postgres-'));
  let app;
  try {
    const file = path.join(directory, 'config.json');
    const values = ['The Dragon', 'battles.example.com', 'gamemaster', 'Game Master', database, role, password];
    const made = spawnSync(process.env.PYTHON || 'python3', ['scripts/installer-config.py', 'create', file], { input: values.join('\0') + '\0', encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    const sql = spawnSync(process.env.PYTHON || 'python3', ['scripts/installer-config.py', 'sql', file], { encoding: 'utf8' });
    assert.equal(sql.status, 0, sql.stderr);
    await admin.query(sql.stdout);
    await admin.query(`CREATE DATABASE "${database}" OWNER "${role}"`);
    const config = JSON.parse(await readFile(file, 'utf8'));
    const connection = new URL(config.DATABASE_URL);
    const adminUrl = new URL(process.env.TEST_DATABASE_URL);
    connection.hostname = adminUrl.hostname;
    connection.port = adminUrl.port;
    app = new Pool({ connectionString: connection.href });
    const schema = await readFile('db/schema.sql', 'utf8');
    await app.query(schema);
    await app.query(schema);
    const dm = { username: 'gamemaster', password, name: 'Game Master' };
    assert.equal(await bootstrapDM(app, dm), true);
    assert.equal(await bootstrapDM(app, { ...dm, password: 'different password' }), false);
    const row = (await app.query('select * from dm_profiles')).rows[0];
    assert.equal(row.password_hash, (await hashPassword(password, row.password_salt)).hash);
    assert.notEqual(row.password_hash, (await hashPassword('different password', row.password_salt)).hash);
    assert.equal((await app.query('select count(*) from dm_sessions')).rows[0].count, '0');
  } finally {
    if (app) await app.end();
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS "${role}"`);
    await admin.end();
    await rm(directory, { recursive: true, force: true });
  }
});
