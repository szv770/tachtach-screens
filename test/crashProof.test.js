import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// Scratch data dir: set before the storage module is loaded. The real data/ is never touched.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-crash-'));
process.env.TACHTACH_DATA_DIR = dir;
const { readJSON, writeJSON } = await import('../src/server/storage.js');
await import('../src/server/asyncErrors.js');
const { default: express } = await import('express');
const { setupCheck } = await import('../src/server/middleware.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ port, host: '127.0.0.1', path: p }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', reject);
});
const serve = (app) => new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });

test('H2: a rejected async route or middleware answers 500 and the process keeps serving', async () => {
  const seen = [];
  const onRej = (e) => seen.push(e);
  process.on('unhandledRejection', onRej);
  const app = express();
  app.use('/mw', async () => { throw new Error('boom mw'); });
  app.get('/route', async () => { await null; throw new Error('boom route'); });
  app.get('/ok', async (_q, res) => { await null; res.json({ ok: true }); });
  app.use((err, _q, res, _n) => res.status(500).json({ error: 'x' }));
  const s = await serve(app);
  try {
    const port = s.address().port;
    assert.equal((await get(port, '/mw')).status, 500);
    assert.equal((await get(port, '/route')).status, 500);
    assert.equal((await get(port, '/ok')).status, 200);
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(seen, [], 'nothing was left as an unhandled rejection');
  } finally { process.off('unhandledRejection', onRej); s.close(); }
});

test('H2: readJSON falls back to the .bak when the file is damaged, and a damaged file never replaces the good .bak', async () => {
  await writeJSON('t.json', { v: 1 });
  await writeJSON('t.json', { v: 2 }); // .bak = v1
  fs.writeFileSync(path.join(dir, 't.json'), '{"v": '); // power-cut truncation
  assert.deepEqual(await readJSON('t.json'), { v: 1 });
  await writeJSON('t.json', { v: 3 }); // existing file is corrupt: must not overwrite .bak with it
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 't.json.bak'), 'utf8')), { v: 1 });
  assert.deepEqual(await readJSON('t.json'), { v: 3 });
  fs.writeFileSync(path.join(dir, 'solo.json'), '{"v"');
  await assert.rejects(readJSON('solo.json'), SyntaxError);
  assert.equal(await readJSON('missing.json'), null);
});

test('H2: secret files get a 0600 .bak too', { skip: process.platform === 'win32' }, async () => {
  await writeJSON('users.json', { a: 1 });
  await writeJSON('users.json', { a: 2 });
  assert.equal(fs.statSync(path.join(dir, 'users.json.bak')).mode & 0o777, 0o600);
});

test('H2: setupCheck with an unreadable users.json fails closed (503) instead of throwing', async () => {
  fs.rmSync(path.join(dir, 'users.json.bak'), { force: true });
  fs.writeFileSync(path.join(dir, 'users.json'), '{"users": [');
  const app = express();
  app.use(setupCheck);
  app.get('/screen', (_q, res) => res.send('SECRET'));
  app.get('/login', (_q, res) => res.send('login'));
  app.use((err, _q, res, _n) => res.status(500).send('err'));
  const s = await serve(app);
  try {
    const port = s.address().port;
    const r = await get(port, '/screen');
    assert.equal(r.status, 503);
    assert.ok(!/SECRET/.test(r.body) && !/setup\.js/.test(r.body));
    assert.equal((await get(port, '/login')).status, 200);
  } finally { s.close(); }
});
