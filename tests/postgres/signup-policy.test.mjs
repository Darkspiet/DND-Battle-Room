import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('signup policy, expiry, issuance limits and concurrent single-use redemption', { skip: !process.env.TEST_DATABASE_URL }, () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(new URL(url).pathname.includes('_test'), 'Only disposable test databases are allowed.');
  const script = `
    import assert from 'node:assert/strict';
    import { randomUUID } from 'node:crypto';
    import { signUpDM, createDMInvite } from './lib/server/auth.ts';
    import { hashOpaqueToken } from './lib/server/session.ts';
    import { pool } from './lib/server/db.ts';
    const username = 'open-' + randomUUID().slice(0, 12);
    const account = { username, password: 'Local policy test passphrase', displayName: 'Policy test', color: '#b83c52' };
    try {
      delete process.env.DM_SIGNUP_MODE;
      await assert.rejects(signUpDM(account), (e) => e.code === 'INVITE_REQUIRED');
      process.env.DM_SIGNUP_MODE = 'typo';
      await assert.rejects(signUpDM(account), (e) => e.code === 'INVITE_REQUIRED');
      process.env.DM_SIGNUP_MODE = 'open';
      const result = await signUpDM(account);
      assert.equal(result.user.role, 'dm');
      assert.equal(result.user.username, username);
      assert.ok(result.token);
      process.env.DM_SIGNUP_MODE = 'invite';
      const race = await createDMInvite(result.user.id);
      const outcomes = await Promise.allSettled([1,2].map((i) => signUpDM({ ...account, username: username+'-'+i, inviteCode: race.code })));
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter((r) => r.status === 'rejected' && r.reason.code === 'INVITE_REQUIRED').length, 1);
      const expired = await createDMInvite(result.user.id);
      await pool.query("update dm_invites set expires_at=now()-interval '1 second' where token_hash=$1", [hashOpaqueToken(expired.code)]);
      await assert.rejects(signUpDM({ ...account, username: username+'-expired', inviteCode: expired.code }), (e) => e.code === 'INVITE_REQUIRED');
      for (let i=0; i<20; i++) await createDMInvite(result.user.id);
      await assert.rejects(createDMInvite(result.user.id), (e) => e.code === 'INVITE_LIMIT');
    } finally {
      await pool.query('delete from users where username=$1 or username=$2 or username=$3', [username, username+'-1', username+'-2']);
      await pool.end();
    }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8', timeout: 60000
  });
  assert.equal(result.status, 0, result.stderr);
});
