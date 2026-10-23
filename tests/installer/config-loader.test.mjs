import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('JSON config loads literal text and keeps installer credentials out of environment', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-config-'));
  try {
    const file = path.join(directory, 'config.json');
    const value = 'The "Dragon" $HOME `room` \\ # ü';
    await writeFile(file, JSON.stringify({ SITE_NAME: value, INSTALL_DB_PASSWORD: 'private' }));
    const result = spawnSync(process.execPath, ['--import', './scripts/load-config.mjs', '-e',
      'console.log(JSON.stringify([process.env.SITE_NAME, process.env.INSTALL_DB_PASSWORD]))'],
    { encoding: 'utf8', env: { ...process.env, DND_CONFIG_FILE: file } });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [value, null]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('malformed JSON errors never echo credential contents', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-config-'));
  try {
    const file = path.join(directory, 'config.json');
    await writeFile(file, '{"DATABASE_URL":"private-database-password"');
    const result = spawnSync(process.execPath, ['--import', './scripts/load-config.mjs', '-e', ''],
      { encoding: 'utf8', env: { ...process.env, DND_CONFIG_FILE: file } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cannot load protected server configuration/);
    assert.doesNotMatch(result.stderr, /private-database-password/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
