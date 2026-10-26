import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const [name, database, expected] of [
  ['missing database', undefined, 'DATABASE_URL is required'],
  ['unavailable database', 'postgresql://test:test@127.0.0.1:1/missing', 'PostgreSQL is unavailable']
]) {
  test(`production refuses ${name} before starting HTTP`, () => {
    const env = { ...process.env, NODE_ENV: 'production', APP_URL: 'https://example.com' };
    delete env.DND_CONFIG_FILE;
    delete env.DATABASE_URL;
    if (database) env.DATABASE_URL = database;
    const result = spawnSync(process.execPath, ['server.mjs'], { env, encoding: 'utf8', timeout: 20000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(expected));
    assert.doesNotMatch(result.stdout, /listening on/);
  });
}

// Regression for the root privilege boundary: app files are service-user writable.
test('privileged service template comes from protected release staging', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('install.sh', 'utf8');
  assert.match(source, /install -m 644 "\$WORK\/source\/deploy\/dnd-battle-room\.service" \/etc\/systemd\/system/);
  assert.doesNotMatch(source, /install[^\n]*"\$APP_DIR\/deploy/);
});
