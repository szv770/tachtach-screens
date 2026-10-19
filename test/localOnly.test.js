import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalRequest } from '../src/server/middleware.js';

const req = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

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
