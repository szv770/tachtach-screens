import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { fetchHeaders } from '../src/server/routes/embed-probe.js';

// The probe must never hang, never crash the process, and always return headers or a plain error.
const servers = [];
const listen = (h) => new Promise((r) => { const s = http.createServer(h).listen(0, '127.0.0.1', () => { servers.push(s); r(`http://127.0.0.1:${s.address().port}/x+`); }); });
const guard = async () => {};
test.after(() => servers.forEach((s) => { s.closeAllConnections?.(); s.close(); }));

test('reads framing headers from a normal page', async () => {
  const url = await listen((q, r) => { r.writeHead(200, { 'content-security-policy': "frame-ancestors 'self' https:" }); r.end('x'.repeat(4179)); });
  const r = await fetchHeaders(url, { guard });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-security-policy'], /frame-ancestors/);
});

test('a body that never ends does not matter', async () => {
  const url = await listen((q, r) => { r.writeHead(200, { 'x-frame-options': 'DENY' }); const t = setInterval(() => r.write('y'), 20); r.on('close', () => clearInterval(t)); });
  assert.equal((await fetchHeaders(url, { guard })).headers['x-frame-options'], 'DENY');
});

test('a site that never answers times out with a plain message (no hang)', async () => {
  const url = await listen(() => {});
  const t0 = Date.now();
  await assert.rejects(fetchHeaders(url, { guard, timeoutMs: 400 }), /too long/);
  assert.ok(Date.now() - t0 < 3000);
});

test('follows redirects and re-checks every hop with the guard', async () => {
  const url = await listen((q, r) => { if (q.url === '/x+') { r.writeHead(302, { location: '/final' }); r.end(); } else { r.writeHead(200); r.end('ok'); } });
  const seen = [];
  const r = await fetchHeaders(url, { guard: async (u) => { seen.push(u.pathname); } });
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ['/x+', '/final']);
  await assert.rejects(fetchHeaders(url, { guard: async () => { throw new Error('private'); } }), /private/);
});

test('a connection dropped mid-response does not crash the process', async () => {
  const url = await listen((q, r) => { r.writeHead(200); r.write('abc'); setTimeout(() => q.socket.destroy(), 10); });
  const r = await fetchHeaders(url, { guard });
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 200)); // let any stray stream error surface
});
