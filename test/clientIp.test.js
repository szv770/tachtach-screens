import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { TRUST_PROXY_SETTING, normalizeIp, ipKey, userKey } from '../src/server/clientIp.js';
import { createUserStore } from '../src/server/users.js';

function appWithTrust() {
  const app = express();
  app.set('trust proxy', TRUST_PROXY_SETTING);
  return app;
}
/** A request as Express would see it from a given TCP peer with given headers. */
function reqFrom(app, peer, headers = {}) {
  const r = Object.create(app.request);
  r.app = app;
  r.headers = headers;
  r.socket = r.connection = { remoteAddress: peer };
  return r;
}

test('LAN peer: a forged X-Forwarded-For is ignored', () => {
  const app = appWithTrust();
  assert.equal(reqFrom(app, '192.168.1.50', { 'x-forwarded-for': '1.2.3.4' }).ip, '192.168.1.50');
  assert.equal(reqFrom(app, '192.168.1.50', { 'x-forwarded-for': '127.0.0.1, 9.9.9.9' }).ip, '192.168.1.50');
  assert.equal(reqFrom(app, '10.0.0.7', { 'x-forwarded-proto': 'https' }).protocol, 'http');
});

test('behind the tunnel: loopback peer + cloudflared XFF yields the real client', () => {
  const app = appWithTrust();
  assert.equal(reqFrom(app, '127.0.0.1', { 'x-forwarded-for': '203.0.113.9' }).ip, '203.0.113.9');
  assert.equal(reqFrom(app, '::1', { 'x-forwarded-for': '203.0.113.9' }).ip, '203.0.113.9');
  assert.equal(reqFrom(app, '::ffff:127.0.0.1', { 'x-forwarded-for': '203.0.113.9' }).ip, '203.0.113.9');
  // a remote client that pre-seeds XFF: Cloudflare appends the true address, right-most wins
  assert.equal(reqFrom(app, '127.0.0.1', { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }).ip, '203.0.113.9');
  assert.equal(reqFrom(app, '127.0.0.1', { 'x-forwarded-proto': 'https', 'x-forwarded-for': '203.0.113.9' }).protocol, 'https');
});

test('real in-process server: loopback peer with XFF', async () => {
  const app = appWithTrust();
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  const srv = http.createServer(app).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const { port } = srv.address();
  const got = await new Promise((resolve, reject) => {
    http.get({ port, host: '127.0.0.1', path: '/ip', headers: { 'x-forwarded-for': '198.51.100.4' } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(JSON.parse(b)));
    }).on('error', reject);
  });
  srv.close();
  assert.equal(got.ip, '198.51.100.4');
});

test('key derivation normalises addresses and clamps names', () => {
  assert.equal(normalizeIp('::ffff:192.168.1.5'), '192.168.1.5');
  assert.equal(normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(normalizeIp('2001:db8:1:2:ffff::1'), normalizeIp('2001:db8:1:2:1::9')); // same /64 -> same key
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(normalizeIp('not an ip'), 'unknown');
  assert.equal(normalizeIp(undefined), 'unknown');
  const req = { ip: '10.0.0.1' };
  assert.equal(ipKey(req), 'ip:10.0.0.1');
  assert.equal(userKey(req, ' Bob '), userKey(req, 'bob'));
  assert.ok(userKey(req, 'x'.repeat(10000)).length < 100);
});

test('lockout table is capped: rotating keys cannot bloat users.json', async () => {
  const box = { doc: null, clock: Date.parse('2026-10-18T12:00:00Z') };
  const store = createUserStore({
    read: async () => (box.doc ? JSON.parse(box.doc) : null), write: async (d) => { box.doc = JSON.stringify(d); },
    readLegacy: async () => null, now: () => box.clock, bcryptRounds: 4,
  });
  await store.recordFailure('ip:locked', { max: 1 });
  for (let i = 0; i < 2300; i++) { box.clock += 1000; await store.recordFailure(`ip:10.1.${i >> 8}.${i & 255}`, { max: 20 }); }
  const l = JSON.parse(box.doc).lockouts;
  assert.ok(Object.keys(l).length <= 2000);
  assert.ok(l['ip:locked'], 'a real lock survives eviction');
  assert.equal(await store.isLocked('ip:locked'), true);
});
