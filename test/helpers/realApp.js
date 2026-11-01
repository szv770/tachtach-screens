// Test helper: the REAL Express app (src/server/app.js, real middleware order and body parsers),
// scratch data only, with signed-in fake people. Import it BEFORE anything that touches data/:
//   const h = await import('./helpers/realApp.js'); const app = await h.startApp();
// Why: the F1 hole (red-team 2026-11-01) lived in the middleware ORDER, which unit tests of canDo()
// with a hand-made body can never see. Tests that guard a permission must go through this.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

export async function startApp({ env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-realapp-'));
  process.env.TACHTACH_DATA_DIR = dir;
  process.env.TRUST_PROXY = '1'; // each fake call gets its own client address, so the 60/min mutation limiter never trips
  Object.assign(process.env, env);
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => (ms === 2000 ? { unref() {}, ref() {} } : realSetTimeout(fn, ms, ...a));
  let app;
  try {
    const { createApp } = await import('../../src/server/app.js');
    app = createApp();
  } finally { globalThis.setTimeout = realSetTimeout; }
  const { default: users } = await import('../../src/server/users.js');
  const storage = await import('../../src/server/storage.js');
  await users.bootstrapAdmin({ passwordHash: await users.hashPassword('Abcdefghij12') });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;

  let n = 0;
  function request({ method = 'GET', url, body, token, local = false, headers = {} }) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
      const h = { host: `127.0.0.1:${port}`, ...headers };
      if (data) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(data); }
      if (!local) h['x-forwarded-for'] = `10.1.${(n >> 8) & 255}.${n++ & 255}`; // not the kiosk: a proxy header is present
      if (token) {
        const nonce = crypto.randomBytes(8).toString('hex');
        const csrf = `${nonce}.${crypto.createHmac('sha256', token).update(nonce).digest('hex')}`;
        h.cookie = `tachtach_session=${token}; _csrf=${csrf}`;
        h['x-csrf-token'] = csrf;
      }
      const q = http.request({ port, host: '127.0.0.1', path: url, method, headers: h }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try { json = JSON.parse(buf.toString('utf8')); } catch { /* not json */ }
          resolve({ status: res.statusCode, body: json, text: buf.toString('utf8'), headers: res.headers, buf });
        });
      });
      q.on('error', reject);
      q.end(data);
    });
  }

  /** A signed-in person: { call(method, url, body), token, user }. preset 'admin' = the admin role. */
  async function login(preset, overrides, name = `T ${preset}`) {
    let user;
    if (preset === 'admin') {
      user = (await users.listUsers()).find((u) => u.role === 'admin');
    } else {
      user = await users.createUser({ name: `${name} ${++n}`, role: 'editor', preset, overrides });
    }
    const token = await users.createSession(user.id);
    const call = (method, url, body) => request({ method, url, body, token });
    return { user, token, call, get: (u) => call('GET', u), post: (u, b) => call('POST', u, b ?? {}), put: (u, b) => call('PUT', u, b), del: (u) => call('DELETE', u) };
  }

  const kiosk = (url) => request({ method: 'GET', url, local: true });
  const close = async () => { await new Promise((r) => setTimeout(r, 150)); server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); };
  return { dir, port, login, kiosk, request, close, storage, users };
}
