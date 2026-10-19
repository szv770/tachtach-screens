import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalRequest } from '../src/server/middleware.js';

const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers: { host: '127.0.0.1:3000', ...headers } });

test('kiosk on loopback with no proxy headers is local', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLocalRequest(req(a)), true);
});

test('a LAN device is never local, even when it forges X-Forwarded-For', () => {
  assert.equal(isLocalRequest(req('192.168.1.50')), false);
  assert.equal(isLocalRequest(req('192.168.1.50', { 'x-forwarded-for': '127.0.0.1' })), false);
  assert.equal(isLocalRequest(req('::ffff:192.168.1.50', { 'x-forwarded-for': '::1' })), false);
});

test('tunnel traffic (cloudflared connects over loopback but adds forwarding headers) is not local', () => {
  for (const h of ['x-forwarded-for', 'cf-connecting-ip', 'forwarded', 'x-real-ip', 'cf-ray', 'x-forwarded-proto']) {
    assert.equal(isLocalRequest(req('127.0.0.1', { [h]: '203.0.113.9' })), false, h);
  }
});

test('missing socket address fails closed', () => {
  assert.equal(isLocalRequest({ socket: {}, headers: {} }), false);
  assert.equal(isLocalRequest({ headers: {} }), false);
});

test('kiosk-only endpoints also need a sane Host header (127.0.0.1 / localhost / [::1], optional port)', () => {
  for (const host of ['127.0.0.1', '127.0.0.1:3000', 'localhost', 'localhost:3443', 'LOCALHOST:3000', '[::1]', '[::1]:3000']) {
    assert.equal(isLocalRequest(req('127.0.0.1', { host })), true, host);
  }
  for (const host of [undefined, '', 'evil.example', 'evil.example:3000', 'tachtach.local', '127.0.0.1.evil.example', 'localhost.evil.com', 'localhost:abc', '192.168.1.5:3000', '127.0.0.1:3000/x', '0.0.0.0:3000']) {
    const headers = host === undefined ? { host: undefined } : { host };
    assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers }), false, String(host));
  }
  assert.equal(isLocalRequest({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), false, 'HTTP/1.0 without Host');
});
