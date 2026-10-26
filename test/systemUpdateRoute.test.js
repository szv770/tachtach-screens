import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { authenticator } from 'otplib';
import { createUserStore } from '../src/server/users.js';
import { createSystemUpdateRouter } from '../src/server/routes/systemUpdate.js';
import { enforceRole } from '../src/server/middleware.js';
import { requestAllowed } from '../src/shared/systemUpdate.js';

const PW = 'Correct-Horse-9battery';

async function harness({ installed = true, status = { state: 'idle' }, pending = false } = {}) {
  const box = { doc: null };
  const users = createUserStore({ read: async () => (box.doc ? JSON.parse(box.doc) : null), write: async (d) => { box.doc = JSON.stringify(d); }, readLegacy: async () => null, bcryptRounds: 4 });
  await users.bootstrapAdmin({ passwordHash: await users.hashPassword(PW) });
  const admin = (await users.listUsers())[0];
  const enr = await users.beginTotpEnrollment(admin.id);
  assert.equal(await users.confirmTotp(admin.id, authenticator.generate(enr.secret)), true);
  const editor = await users.createUser({ name: 'Ed', username: 'ed', role: 'editor' });
  await users.setPassword(editor.id, PW);

  const written = []; const activity = []; const h = { status, pending, last: 0, installed };
  const svc = {
    installedInfo: () => (h.installed ? { at: 'x' } : null),
    getUpdateInfo: async () => ({ ok: true }),
    getUpdateStatus: () => ({ state: h.status.state }),
    checkRequestAllowed: () => requestAllowed({ status: h.status, pending: h.pending, lastRequestAt: h.last }),
    noteRequest: () => { h.last = Date.now(); },
    writeRequestFile: (r) => { written.push(r); h.pending = true; },
  };
  let who = admin;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = who ? { ...(who), ...(who === admin ? {} : {}) } : undefined; next(); });
  app.use('/api', (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'sign in' })), enforceRole);
  app.use('/api', createSystemUpdateRouter({ users, activity: { record: async (e) => { activity.push(e); } }, svc }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // A code from the NEXT 30 s step (inside the accepted window), and "time passes" = forget the last used step.
  const freshCode = () => {
    const d = JSON.parse(box.doc); d.users[0].lastTotpStep = 0; box.doc = JSON.stringify(d);
    authenticator.options = { epoch: Date.now() + 30_000 }; const c = authenticator.generate(enr.secret); authenticator.resetOptions(); return c;
  };
  return { call, written, activity, h, users, admin, editor, as: (u) => { who = u; }, freshCode, close: () => server.close(), secret: enr.secret };
}

test('non-admins and signed-out callers are refused everywhere; nothing is written', async () => {
  const t = await harness();
  try {
    for (const who of [t.editor, null]) {
      t.as(who);
      for (const [m, p] of [['GET', '/api/system/update'], ['GET', '/api/system/update/status'], ['POST', '/api/system/update']]) {
        const r = await t.call(m, p, { action: 'update', password: PW });
        assert.ok([401, 403].includes(r.status), `${who?.username} ${m} ${p} -> ${r.status}`);
      }
    }
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});

test('admin can read', async () => {
  const t = await harness();
  try {
    assert.equal((await t.call('GET', '/api/system/update')).status, 200);
    assert.equal((await t.call('GET', '/api/system/update/status')).body.state, 'idle');
  } finally { t.close(); }
});

test('re-auth: no password, wrong password, no code, wrong code are all refused', async () => {
  const t = await harness();
  try {
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update' })).status, 400);
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: 'wrong' })).status, 400);
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW })).body.code, 'bad_code');
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: '000000' })).status, 400);
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: 123456 })).status, 400);
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});

test('action must be exactly update or rollback', async () => {
  const t = await harness();
  try {
    for (const a of [undefined, '', 'reboot', 'UPDATE', ['update'], { x: 1 }, 'update; reboot']) {
      const r = await t.call('POST', '/api/system/update', { action: a, password: PW, code: t.freshCode() });
      assert.equal(r.status, 400, JSON.stringify(a));
    }
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});

test('correct password + fresh code writes one request, logs it, and then the 5-minute limit applies', async () => {
  const t = await harness();
  try {
    const r = await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: t.freshCode(), branch: 'evil', url: 'http://x' });
    assert.equal(r.status, 202);
    assert.deepEqual(t.written, [{ action: 'update', by: t.admin.name }], 'only the action and who asked; nothing else the caller sent');
    assert.equal(t.activity.length, 1);
    assert.match(t.activity[0].action, /Started a software update/);
    const again = await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: t.freshCode() });
    assert.equal(again.status, 429);
    assert.equal(again.body.code, 'rate_limited');
    assert.equal(t.written.length, 1);
    // pending cleared, but within 5 minutes of the last request: still refused
    t.h.pending = false;
    assert.equal((await t.call('POST', '/api/system/update', { action: 'rollback', password: PW, code: t.freshCode() })).status, 429);
    t.h.last = Date.now() - 6 * 60_000;
    const rb = await t.call('POST', '/api/system/update', { action: 'rollback', password: PW, code: t.freshCode() });
    assert.equal(rb.status, 202);
    assert.match(t.activity[1].action, /Rolled back/);
  } finally { t.close(); }
});

test('a used 2-step code cannot be reused', async () => {
  const t = await harness();
  try {
    const code = t.freshCode();
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code })).status, 202);
    t.h.pending = false; t.h.last = 0; // (no freshCode(): that would reset the used-step memory)
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code })).status, 400);
  } finally { t.close(); }
});

test('not set up on this server: friendly 409 and nothing written', async () => {
  const t = await harness({ installed: false });
  try {
    const r = await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: t.freshCode() });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'not_installed');
    assert.match(r.body.error, /update\.sh/);
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});

test('refused while an update is running, without spending password guesses', async () => {
  const t = await harness({ status: { state: 'running' } });
  try {
    const r = await t.call('POST', '/api/system/update', { action: 'update', password: 'wrong' });
    assert.equal(r.status, 429);
    assert.equal(await t.users.isLocked(`user:${t.admin.username}|password`), false);
  } finally { t.close(); }
});

test('lockout: repeated wrong passwords lock the counter, even the right password is then refused', async () => {
  const t = await harness();
  try {
    for (let i = 0; i < 6; i++) assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: `nope${i}` })).status, 400);
    const r = await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: t.freshCode() });
    assert.equal(r.status, 429);
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});

test('lockout: repeated wrong 2-step codes lock too', async () => {
  const t = await harness();
  try {
    for (let i = 0; i < 6; i++) assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: '000000' })).status, 400);
    assert.equal((await t.call('POST', '/api/system/update', { action: 'update', password: PW, code: t.freshCode() })).status, 429);
    assert.equal(t.written.length, 0);
  } finally { t.close(); }
});
