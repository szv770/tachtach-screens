import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITIES, CAP_IDS, effectiveCaps, canDo, canOpenSection, isGrantable, sanitizeOverrides, ASSIGNABLE_PRESETS, presetCaps,
} from '../src/shared/permissions.js';

const ADMIN = { role: 'admin' };
const PATHS = [
  ['GET', '/api/system/update'], ['GET', '/api/system/update/status'], ['GET', '/api/system/update?refresh=1'],
  ['POST', '/api/system/update'], ['PUT', '/api/system/update'], ['DELETE', '/api/system/update'],
  ['GET', '/api/system'], ['POST', '/api/system/anything'], ['POST', '/API/System/Update'], ['POST', '/api//system//update/'],
  ['POST', '/api/system/%75pdate'], ['GET', '/api/system/update/../update'],
];
const WHO = {
  'editor (default)': { role: 'editor' },
  'full editor': { role: 'editor', preset: 'full' },
  'messages only': { role: 'editor', preset: 'messages' },
  'view only': { role: 'editor', preset: 'view' },
  'editor told to grant it': { role: 'editor', preset: 'full', overrides: { grant: ['system.update', 'team.manage'], deny: [] } },
  'view only told to grant it': { role: 'editor', preset: 'view', overrides: { grant: ['system.update'], deny: [] } },
  'unknown preset': { role: 'editor', preset: 'bogus' },
  'unknown role': { role: 'owner' },
  anonymous: null,
};

test('system.update is an admin-only capability', () => {
  const c = CAPABILITIES.find((x) => x.id === 'system.update');
  assert.ok(c, 'declared');
  assert.equal(c.adminOnly, true);
  assert.equal(isGrantable('system.update'), false);
  for (const p of ASSIGNABLE_PRESETS) assert.ok(!presetCaps(p).includes('system.update'), p);
  assert.ok(effectiveCaps(ADMIN).includes('system.update'));
});

test('overrides can never grant it, even if stored by hand', () => {
  const o = sanitizeOverrides('full', { grant: ['system.update'], deny: [] });
  assert.deepEqual(o.grant, []);
  for (const [name, who] of Object.entries(WHO)) {
    if (!who || who.role !== 'editor') continue;
    assert.ok(!effectiveCaps(who).includes('system.update'), name);
  }
});

test('only an admin may read or write anything under /api/system', () => {
  for (const [name, who] of Object.entries(WHO)) {
    for (const [m, p] of PATHS) assert.equal(canDo(who, m, p), false, `${name} ${m} ${p}`);
  }
  for (const [m, p] of PATHS.slice(0, 9)) assert.equal(canDo(ADMIN, m, p), true, `admin ${m} ${p}`);
  assert.equal(canDo('admin', 'POST', '/api/system/update'), true);
  assert.equal(canDo('editor', 'GET', '/api/system/update'), false);
});

test('the Health page stays open to everyone; the update card is gated by the capability', () => {
  assert.equal(canOpenSection({ role: 'editor', preset: 'view' }, 'health'), true);
  assert.ok(!effectiveCaps({ role: 'editor' }).includes('system.update'));
  assert.ok(CAP_IDS.includes('system.update'));
});
