import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import screenRouter from '../src/server/routes/screen.js';
import { addClient, getKioskClientCount, getViewerClientCount, getClientCount } from '../src/server/sse.js';
import { TRUST_PROXY_SETTING } from '../src/server/clientIp.js';

const app = express();
app.set('trust proxy', TRUST_PROXY_SETTING);
app.use((req, _res, next) => { if (req.headers['x-live-viewer']) req.liveViewer = true; next(); }); // stands in for stateGate
app.use('/stream', screenRouter);
const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const open = [];
test.after(() => { open.forEach((q) => q.destroy()); server.close(); });
const stream = (headers = {}, path = '/stream') => new Promise((resolve) => {
  const q = http.get({ port: server.address().port, host: '127.0.0.1', path, headers }, (res) => { res.once('data', () => resolve(res)); });
  open.push(q);
});
const settle = () => new Promise((r) => setTimeout(r, 30));

test('M6: only the real TV (loopback, no proxy headers) lands in the kiosk pool; a signed-in View-only login cannot fake "online" or evict it', async () => {
  const before = getKioskClientCount();
  for (let i = 0; i < 25; i++) await stream({ 'x-forwarded-for': '203.0.113.5', host: '127.0.0.1' }); // via the tunnel, no ?preview=true
  await settle();
  assert.equal(getKioskClientCount(), before, 'tunnel streams are preview-type, so the status stays "offline"');
  await stream({ host: '127.0.0.1' }); // the TV itself
  await settle();
  assert.equal(getKioskClientCount(), before + 1);
});

const closeAll = async () => { open.splice(0).forEach((q) => q.destroy()); await settle(); };

test('M6: one address cannot hold more than a few viewer or preview streams (and cannot push other addresses out)', async () => {
  await closeAll();
  const v0 = getViewerClientCount();
  await stream({ 'x-forwarded-for': '198.51.100.9', 'x-live-viewer': '1' }); // someone else, first
  for (let i = 0; i < 30; i++) await stream({ 'x-forwarded-for': '203.0.113.77', 'x-live-viewer': '1' });
  await settle();
  assert.equal(getViewerClientCount() - v0, 1 + 4, 'the flooder keeps 4, the other viewer is untouched');
  const total = getClientCount();
  for (let i = 0; i < 30; i++) await stream({ 'x-forwarded-for': '203.0.113.88' }, '/stream?preview=true');
  await settle();
  assert.equal(getClientCount() - total, 6);
});

test('M6: addClient without a key keeps the old behaviour', () => {
  const res = { writeHead() {}, flushHeaders() {}, write() {}, on() {}, end() {}, socket: null };
  assert.ok(addClient(res, false, false));
});
