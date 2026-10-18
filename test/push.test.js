import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScreen, evaluateZmanim, validSubscription, OFFLINE_AFTER_MS, STALE_ZMANIM_MS } from '../src/server/push.js';
import { canDo } from '../src/shared/permissions.js';

const MIN = 60 * 1000;

test('screen: no alert until it has been gone for the whole grace period', () => {
  let s = { offlineSince: null, alerted: false };
  let r = evaluateScreen(s, false, 0);
  assert.equal(r.action, null);
  r = evaluateScreen(r.state, false, OFFLINE_AFTER_MS - MIN);
  assert.equal(r.action, null);
  r = evaluateScreen(r.state, false, OFFLINE_AFTER_MS);
  assert.equal(r.action, 'offline');
});

test('screen: alerts once, then stays quiet while it is still offline', () => {
  let r = evaluateScreen({ offlineSince: 0, alerted: false }, false, OFFLINE_AFTER_MS);
  assert.equal(r.action, 'offline');
  r = evaluateScreen(r.state, false, OFFLINE_AFTER_MS + 30 * MIN);
  assert.equal(r.action, null);
});

test('screen: says it is back only if it had alerted, and re-arms', () => {
  let r = evaluateScreen({ offlineSince: 0, alerted: true }, true, 1000);
  assert.equal(r.action, 'back');
  assert.deepEqual(r.state, { offlineSince: null, alerted: false });
  r = evaluateScreen(r.state, true, 2000);
  assert.equal(r.action, null);
});

test('screen: a short blip never alerts and never says "back"', () => {
  let r = evaluateScreen({ offlineSince: null, alerted: false }, false, 0);
  r = evaluateScreen(r.state, true, 2 * MIN);
  assert.equal(r.action, null);
  r = evaluateScreen(r.state, false, 10 * MIN);
  r = evaluateScreen(r.state, false, 10 * MIN + OFFLINE_AFTER_MS - 1);
  assert.equal(r.action, null);
});

test('zmanim: alerts once when stale, re-arms when fresh again, ignores missing data', () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  const old = new Date(now - STALE_ZMANIM_MS - MIN).toISOString();
  const fresh = new Date(now - MIN).toISOString();
  let r = evaluateZmanim({ alerted: false }, old, now);
  assert.equal(r.action, 'stale');
  r = evaluateZmanim(r.state, old, now + MIN);
  assert.equal(r.action, null);
  r = evaluateZmanim(r.state, fresh, now + 2 * MIN);
  assert.deepEqual(r, { state: { alerted: false }, action: null });
  assert.equal(evaluateZmanim({ alerted: false }, null, now).action, null);
  assert.equal(evaluateZmanim({ alerted: false }, 'garbage', now).action, null);
});

test('subscription validation: https endpoint and both keys required', () => {
  const ok = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'a', auth: 'b' } };
  assert.equal(validSubscription(ok), true);
  assert.equal(validSubscription({ ...ok, endpoint: 'http://x.example/y' }), false);
  assert.equal(validSubscription({ ...ok, endpoint: 'javascript:alert(1)' }), false);
  assert.equal(validSubscription({ ...ok, keys: { p256dh: 'a' } }), false);
  assert.equal(validSubscription({ endpoint: ok.endpoint }), false);
  assert.equal(validSubscription(null), false);
  assert.equal(validSubscription({ ...ok, endpoint: 'https://x.example/' + 'a'.repeat(1000) }), false);
});

test('editors may manage their own phone alerts', () => {
  for (const [m, p] of [['GET', '/api/push/status'], ['POST', '/api/push/subscribe'], ['POST', '/api/push/unsubscribe'], ['POST', '/api/push/test']]) {
    assert.equal(canDo('editor', m, p), true, `${m} ${p}`);
  }
  assert.equal(canDo('editor', 'POST', '/api/pushy'), false);
});
