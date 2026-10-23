import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { Pool } from 'pg';

// Run after the production build. Never start against a live database or port 3000.
const enabled = process.env.RUN_TRANSPORT_TESTS === '1';
const origin = 'http://127.0.0.1:3101';
let child;
async function start() {
  child = spawn(process.execPath, ['server.mjs'], { windowsHide: true, env: {
    ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: 'production',
    APP_URL: origin, HOSTNAME: '127.0.0.1', PORT: '3101', DND_CONFIG_FILE: '', TRUST_PROXY: 'none'
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('Test server stopped: ' + output.slice(-1000));
    try { if ((await fetch(origin + '/api/health')).ok) return; } catch {}
    await delay(250);
  }
  throw new Error('Test server readiness timed out.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exit = once(child, 'exit'); child.kill(); await exit;
}
const request = (route, method = 'GET', data, cookie, extra = {}) => fetch(origin + route, {
  method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...extra },
  body: data === undefined ? undefined : JSON.stringify(data)
});
function rejectUpgrade(status, cookie, wsOrigin = origin) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(origin.replace('http', 'ws') + '/ws', { origin: wsOrigin, headers: cookie ? { Cookie: cookie } : {} });
    ws.on('open', () => { ws.close(); reject(new Error('Unauthorized upgrade accepted')); });
    ws.on('unexpected-response', (_, response) => { response.resume(); ws.terminate(); try { assert.equal(response.statusCode, status); resolve(); } catch(error) { reject(error); } });
    ws.on('error', () => {});
  });
}
function receive(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', handler); reject(new Error('WebSocket response timed out')); }, 5000);
    function handler(data) { clearTimeout(timer); resolve(JSON.parse(data.toString())); }
    ws.once('message', handler);
  });
}
test('production HTTP and WebSocket enforce sessions, origins, commands, privacy and restart persistence', { skip: !enabled, timeout: 90000 }, async () => {
  assert.ok(process.env.TEST_DATABASE_URL && new URL(process.env.TEST_DATABASE_URL).pathname.includes('test'), 'Dedicated TEST_DATABASE_URL required');
  let ws;
  try {
    await start();
    assert.equal((await request('/api/rooms/ABC', 'PUT', { room: {} })).status, 405);
    assert.equal((await request('/api/dm/rooms')).status, 401);
    assert.equal((await request('/api/dm/signup', 'POST', {}, undefined, { Origin: 'https://attacker.invalid' })).status, 403);
    await rejectUpgrade(401);
    await rejectUpgrade(403, undefined, 'https://attacker.invalid');
    const signup = await request('/api/dm/signup', 'POST', { username: 'transport-' + randomUUID().slice(0,8), name: 'Transport DM', password: "literal ' ; $ password" });
    assert.equal(signup.status, 200);
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    assert.match(signup.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(signup.headers.get('set-cookie'), /SameSite=Lax/i);
    const metadata = await (await request('/api/dm/rooms', 'POST', { name: 'Transport room' }, cookie)).json();
    const code = metadata.room.roomCode;
    const roomPath = '/api/rooms/' + code;
    assert.equal((await request(roomPath)).status, 401);
    assert.equal((await request(roomPath, 'POST', { nickname: 'Spoof', id: 'dm-admin' })).status, 400);
    const joined = await request(roomPath, 'POST', { nickname: 'Guest' });
    const guestCookie = joined.headers.get('set-cookie').split(';')[0];
    assert.equal(joined.status, 200);
    const command = { id: randomUUID(), commands: [{ type: 'token.create', payload: { token: { name: 'Hidden monster', hp: 'PRIVATE HP', note: 'PRIVATE NOTE' } } }] };
    assert.equal((await request(roomPath + '/commands', 'POST', command, cookie)).status, 200);
    const guestRoom = await (await request(roomPath, 'GET', undefined, guestCookie)).text();
    assert.doesNotMatch(guestRoom, /PRIVATE HP|PRIVATE NOTE/);
    assert.equal((await request(roomPath + '/commands', 'POST', { id: randomUUID(), commands: [{type: 'grid.update', payload: {patch: { rows: 30 }}}] }, guestCookie)).status, 403);
    ws = new WebSocket(origin.replace('http', 'ws') + '/ws', { origin, headers: { Cookie: guestCookie } });
    await once(ws, 'open');
    let pending = receive(ws); ws.send(JSON.stringify({type: 'join_room', roomCode: code}));
    assert.equal((await pending).type, 'room_snapshot');
    pending = receive(ws); ws.send(JSON.stringify({type: 'room_patch', roomCode: code, room: {dmId: 'fake'}}));
    assert.equal((await pending).status, 400);
    pending = receive(ws); ws.send('{'); assert.equal((await pending).status, 400);
    assert.equal((await request('/api/health')).status, 200);
    ws.close(); await once(ws, 'close'); ws = undefined;
    await stop(); await start();
    const restored = await (await request(roomPath, 'GET', undefined, cookie)).json();
    assert.equal(restored.tokens[0].hp, 'PRIVATE HP');
    assert.equal(restored.tokens[0].note, 'PRIVATE NOTE');
    // Simulate a real outage in this disposable database, including failed idle pg clients.
    const dbUrl=new URL(process.env.TEST_DATABASE_URL);
    const dbName=decodeURIComponent(dbUrl.pathname.slice(1));
    const quotedName='"'+dbName.replaceAll('"','""')+'"';
    dbUrl.pathname='/postgres';
    const admin=new Pool({connectionString:dbUrl.href});
    try {
      await admin.query('ALTER DATABASE '+quotedName+' ALLOW_CONNECTIONS false');
      await admin.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1',[dbName]);
      assert.equal((await request('/api/health')).status,503);
      assert.equal((await request(roomPath+'/commands','POST',{id:randomUUID(),commands:[{type:'dice.roll',payload:{expression:'d20',private:false}}]},cookie)).status,503);
      assert.equal(child.exitCode,null,'Database outage must not crash the app');
    } finally {
      await admin.query('ALTER DATABASE '+quotedName+' ALLOW_CONNECTIONS true');
      await admin.end();
    }
    assert.equal((await request('/api/health')).status,200);
    assert.equal((await (await request(roomPath,'GET',undefined,cookie)).json()).tokens.length,1);
    // Headers supplied by clients cannot bypass the server's peer-based auth rate limit.
    for (let i = 0; i < 20; i++) assert.equal((await request('/api/dm/signin', 'POST', {}, undefined, {'x-dnd-client-ip': String(i), 'x-forwarded-for': '10.0.0.'+i})).status, 400);
    assert.equal((await request('/api/dm/signin', 'POST', {})).status, 429);
    ws = new WebSocket(origin.replace('http','ws')+'/ws',{origin,headers:{Cookie:cookie}});
    await once(ws,'open');
    assert.equal((await request('/api/dm/session','DELETE',undefined,cookie)).status,200);
    pending=receive(ws); ws.send(JSON.stringify({type:'join_room',roomCode:code}));
    assert.equal((await pending).status,401);
    await once(ws,'close'); ws=undefined;

  } finally { if(ws) ws.terminate(); await stop(); }
});
