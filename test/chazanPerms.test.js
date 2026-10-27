import test from 'node:test';
import assert from 'node:assert/strict';
import { canDo, canOpenSection, effectiveCaps, PRESETS } from '../src/shared/permissions.js';

const full = { role: 'editor', preset: 'full' };
const msgs = { role: 'editor', preset: 'messages' };
const view = { role: 'editor', preset: 'view' };
const ROUTES = [['PUT', '/api/chazan/settings'], ['PUT', '/api/chazan/order'], ['POST', '/api/chazan/swap'], ['DELETE', '/api/chazan/swap'], ['PUT', '/api/chazan/away'], ['PUT', '/api/chazan/can']];

test('chazan.edit is in the Full editor preset only (plus admin)', () => {
  assert.ok(PRESETS.full.caps.includes('chazan.edit'));
  assert.ok(!PRESETS.messages.caps.includes('chazan.edit'));
  assert.ok(!PRESETS.view.caps.includes('chazan.edit'));
  assert.ok(effectiveCaps(full).includes('chazan.edit'));
});

test('chazan writes: full editor and admin yes; messages-only / view-only refused; reads allowed', () => {
  for (const [m, p] of ROUTES) {
    assert.equal(canDo(full, m, p), true, `${m} ${p}`);
    assert.equal(canDo('admin', m, p), true);
    assert.equal(canDo(msgs, m, p), false, `${m} ${p}`);
    assert.equal(canDo(view, m, p), false, `${m} ${p}`);
  }
  // reads need the capability too (student names): see READ_ROUTES / test/readRoutes.test.js
  for (const p of ['/api/chazan', '/api/chazan/swap-options']) {
    assert.equal(canDo(full, 'GET', p), true, p);
    assert.equal(canDo(msgs, 'GET', p), false, p);
    assert.equal(canDo(view, 'GET', p), false, p);
  }
});

test('chazan routes are traversal-proof and the page needs the capability', () => {
  for (const p of ['/api//chazan/swap', '/api/CHAZAN/swap', '/api/%63hazan/swap', '/api\\chazan\\swap', '/api/chazan/swap/', '/api/chazan/../chazan/swap']) {
    assert.equal(canDo(msgs, 'POST', p), false, p);
    assert.equal(canDo(view, 'POST', p), false, p);
  }
  assert.equal(canDo(msgs, 'POST', '/api/chazanx'), false); // unknown prefixes stay closed
  assert.equal(canOpenSection(full, 'chazan'), true);
  assert.equal(canOpenSection(msgs, 'chazan'), false);
  assert.equal(canOpenSection(view, 'chazan'), false);
});
