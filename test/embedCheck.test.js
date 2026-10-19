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

test('evaluateFramePolicy basics', () => {
  assert.equal(evaluateFramePolicy({}).framable, true);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'DENY' }).framable, false);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'SAMEORIGIN' }).framable, false);
  assert.equal(evaluateFramePolicy({ 'x-frame-options': 'ALLOW-FROM https://127.0.0.1:3443' }, 'https://127.0.0.1:3443').framable, true);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" }).framable, false);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "frame-ancestors 'self' https://x.com" }).framable, false);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': 'frame-ancestors *' }).framable, true);
  assert.equal(evaluateFramePolicy({ 'content-security-policy': "script-src 'self'" }).framable, true);
});

test('frame-ancestors is matched against the parent scheme: Charidy\'s policy needs an https kiosk', () => {
  const charidy = { 'content-security-policy': "default-src 'self' https:; frame-src 'self' https:; frame-ancestors 'self' https:;" };
  assert.equal(evaluateFramePolicy(charidy, 'https://127.0.0.1:3443').framable, true);
  const http = evaluateFramePolicy(charidy, 'http://127.0.0.1:3000');
  assert.equal(http.framable, false);
  assert.match(http.reason, /127\.0\.0\.1:3000/);
});

test('frame-ancestors host sources', () => {
  const h = (v) => ({ 'content-security-policy': `frame-ancestors ${v}` });
  assert.equal(evaluateFramePolicy(h('https://127.0.0.1:3443'), 'https://127.0.0.1:3443').framable, true);
  assert.equal(evaluateFramePolicy(h('https://127.0.0.1:3443'), 'http://127.0.0.1:3000').framable, false);
  assert.equal(evaluateFramePolicy(h('http://127.0.0.1:3000'), 'http://127.0.0.1:3000').framable, true);
  assert.equal(evaluateFramePolicy(h('http://127.0.0.1:3000'), 'https://127.0.0.1:3443').framable, false, 'wrong port');
  assert.equal(evaluateFramePolicy(h('https://*.example.com'), 'https://a.example.com').framable, true);
  assert.equal(evaluateFramePolicy(h('https://*.example.com'), 'https://example.com').framable, false);
  assert.equal(evaluateFramePolicy(h('http:'), 'https://127.0.0.1:3443').framable, true);
  assert.equal(evaluateFramePolicy(h("'self'"), 'https://127.0.0.1:3443').framable, false);
});

test('isPrivateAddress', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.16.5.5', '169.254.169.254', '::1', 'fe80::1', '0.0.0.0', '::ffff:127.0.0.1', '100.64.0.1', '']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '104.18.0.1', '172.32.0.1', '2606:4700::1']) assert.equal(isPrivateAddress(ip), false, ip);
});

test('isPrivateAddress: every IPv6 spelling of a private IPv4 is refused', () => {
  const bad = ['::ffff:7f00:1', '::ffff:7f00:0001', '0:0:0:0:0:ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a00:1',
    '::ffff:c0a8:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '64:ff9b::127.0.0.1', '64:ff9b::a9fe:a9fe', '64:ff9b:1::1',
    '2002:7f00:1::', '2002:a00:1::1', '::7f00:1', '::127.0.0.1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1',
    'fc00::1', 'fd12:3456::1', 'fe80::1%eth0', 'fec0::1', 'ff02::1', '[::1]', '0:0:0:0:0:0:0:1', '::'];
  for (const ip of bad) assert.equal(isPrivateAddress(ip), true, ip);
  const good = ['::ffff:808:808', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::', '2606:4700::1111', '2a00:1450:4001::200e'];
  for (const ip of good) assert.equal(isPrivateAddress(ip), false, ip);
});

test('isPrivateAddress: hostnames are not judged as addresses (fc*/fd* names are fine)', () => {
  for (const h of ['fcbarcelona.com', 'fdic.gov', 'example.com', 'localhost.example.org']) assert.equal(isPrivateAddress(h), false, h);
});
