import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, validateCredentials } from '../../lib/authCredentials.mjs';
import { bootstrapDM } from '../../scripts/bootstrap-dm.mjs';

test('account hashing remains compatible with arbitrary password characters', async () => {
  const password = `spaces ' " $ \\ # @ : / % ü 🔥`;
  const first = await hashPassword(password);
  assert.equal((await hashPassword(password, first.salt)).hash, first.hash);
  assert.notEqual((await hashPassword(password + 'x', first.salt)).hash, first.hash);
  assert.notEqual((await hashPassword(password)).salt, first.salt);
  assert.equal(validateCredentials('  My-DM  ', password), 'my-dm');
  assert.throws(() => validateCredentials('a'.repeat(33), password));
});

test('bootstrap uses a transaction and hashed credentials, and preserves an existing account', async () => {
  const calls = [];
  let profiles = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.startsWith('select username')) return { rowCount: profiles.length, rows: profiles };
      if (sql.startsWith('insert')) profiles.push({ username: values[1] });
      return { rowCount: 0, rows: [] };
    }, release() {}
  };
  const pool = { async connect() { return client; } };
  const input = { username: 'gamemaster', password: `very long ' $ \\ password`, name: 'Master' };
  assert.equal(await bootstrapDM(pool, input), true);
  const inserted = calls.find(call => call.sql.startsWith('insert'));
  assert.equal(inserted.values[1], input.username);
  assert.notEqual(inserted.values[4], input.password);
  assert.equal((await hashPassword(input.password, inserted.values[5])).hash, inserted.values[4]);
  profiles.push({ username: 'another-dm' });
  assert.equal(await bootstrapDM(pool, input), false);
  assert.equal(calls.filter(call => call.sql.startsWith('insert')).length, 1);
  await assert.rejects(bootstrapDM(pool, { ...input, username: 'unknown' }));
  await assert.rejects(bootstrapDM(pool, { ...input, password: 'short' }));
});
