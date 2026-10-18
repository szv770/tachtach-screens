import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWebUrl, withCacheBust, evaluateFramePolicy, isPrivateAddress } from '../src/shared/embedCheck.js';

test('normalizeWebUrl', () => {
  assert.equal(normalizeWebUrl('charidy.com/miami+'), 'https://charidy.com/miami+');
  assert.equal(normalizeWebUrl(' https://charidy.com/miami+ '), 'https://charidy.com/miami+');
  assert.equal(normalizeWebUrl('http://example.org'), 'http://example.org');
  assert.equal(normalizeWebUrl('javascript:alert(1)'), null);
  assert.equal(normalizeWebUrl('ftp://x.y'), null);
  assert.equal(normalizeWebUrl(''), null);
});

test('withCacheBust keeps the "+" in the path and existing params', () => {
  assert.equal(withCacheBust('https://charidy.com/miami+', 5), 'https://charidy.com/miami+?_tt=5');
  assert.equal(withCacheBust('https://a.b/live?x=1', 7), 'https://a.b/live?x=1&_tt=7');
  assert.equal(withCacheBust('not a url', 1), 'not a url');
});

test('evaluateFramePolicy', () => {
  assert.equal(evaluateFramePolicy({}).framable, true);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'DENY' }).framable, false);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'SAMEORIGIN' }).framable, false);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'ALLOW-FROM https://kiosk' }, 'https://kiosk').framable, true);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }).framable, false);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "frame-ancestors 'self' https://x.com" }).framable, false);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': 'frame-ancestors *' }).framable, true);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "script-src 'self'" }).framable, true);
});

test('isPrivateAddress', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '::1', 'fe80::1', '0.0.0.0', '::ffff:127.0.0.1', '100.64.0.1', '']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '104.18.0.1', '172.32.0.1', '2606:4700::1']) assert.equal(isPrivateAddress(ip), false, ip);
});
