import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Scratch data dir (the real data/ is never touched); must be set before storage.js loads.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-lock-'));
process.env.TACHTACH_DATA_DIR = dir;
const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
await import('../src/server/asyncErrors.js');
const { default: users } = await import('../src/server/users.js');
const { default: authRouter, IP_LIMIT } = await import('../src/server/routes/auth.js');
const { TRUST_PROXY_SETTING } = await import('../src/server/clientIp.js');

const PW = 'correct horse battery staple';
const app = express();
app.set('trust proxy', TRUST_PROXY_SETTING);
app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// every request comes "through the tunnel" from one shared school address
const post = (p, body, cookie = '') => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const q = http.request({ port: server.address().port, host: '127.0.0.1', path: p, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-forwarded-for': '203.0.113.7', cookie } }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null, setCookie: res.headers['set-cookie'] || [] }));
  });
  q.on('error', reject); q.end(data);
});

test('M5: a shared address cannot lock the real admin out; brute force still stops at the ceiling', async () => {
  const hash = await users.hashPassword(PW);
  await users.bootstrapAdmin({ passwordHash: hash, username: 'admin', name: 'Admin' });
  await users.createUser({ name: 'Second', username: 'second' }); // two people, so a username is asked
  const admin = (await users.listUsers()).find((u) => u.username === 'admin');

  // a student on the same Wi-Fi spams made-up names: 40 failures (the old limit was 20 -> 1 hour lock)
  for (let i = 0; i < 40; i++) assert.equal((await post('/login', { username: 'kid' + i, password: 'x' })).status, 401);
  const ok = await post('/login', { username: 'admin', password: PW });
  assert.equal(ok.status, 200, 'the right password still gets in after 40 stray failures');

  // one person guessing one account is stopped quickly (per person + address)
  for (let i = 0; i < 8; i++) await post('/login', { username: 'second', password: 'guess' + i });
  assert.equal((await post('/login', { username: 'second', password: 'guess-next' })).status, 429);

  // a sustained flood reaches the address ceiling; then even the right password is refused ...
  for (let i = 0; i < IP_LIMIT.max; i++) await post('/login', { username: 'bot' + i, password: 'x' });
  assert.equal((await post('/login', { username: 'admin', password: PW })).status, 429);
  // ... except from a browser that already proved 2-step for that person (trusted-device cookie)
  const token = await users.trustDevice(admin.id);
  await users.updateUser(admin.id, { totpEnabled: true }).catch(() => {});
  const withDevice = await post('/login', { username: 'admin', password: PW }, `tachtach_trusted_device=${token}`);
  assert.notEqual(withDevice.status, 429);
  assert.equal((await post('/login', { username: 'admin', password: 'wrong' }, `tachtach_trusted_device=${token}`)).status, 401, 'a wrong password is still wrong');
});
