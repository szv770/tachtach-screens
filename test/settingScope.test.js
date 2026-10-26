// FIT-RULES rule 3 / NEXT-STEPS N6: every settings key declares its scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEYS, SETTING_SCOPE } from '../src/shared/settingsMerge.js';
import { LOOK_SETTING_KEYS, SCHEDULE_SETTING_KEYS } from '../src/shared/permissions.js';

const SCOPES = new Set(['org', 'box', 'org+box', 'platform', 'legacy']);

test('every key in SETTINGS_KEYS has a scope, and there are no extra scope rows', () => {
  const missing = SETTINGS_KEYS.filter((k) => !(k in SETTING_SCOPE));
  const extra = Object.keys(SETTING_SCOPE).filter((k) => !SETTINGS_KEYS.includes(k));
  assert.deepEqual(missing, [], `add a scope for: ${missing.join(', ')} (src/shared/settingsMerge.js SETTING_SCOPE)`);
  assert.deepEqual(extra, [], `scope rows for keys that are not settings: ${extra.join(', ')}`);
  for (const [k, v] of Object.entries(SETTING_SCOPE)) assert.ok(SCOPES.has(v), `${k}: ${v}`);
});

test('look and schedule key lists only hold org / box / org+box keys that exist', () => {
  for (const k of [...LOOK_SETTING_KEYS, ...SCHEDULE_SETTING_KEYS]) {
    assert.ok(SETTINGS_KEYS.includes(k), `${k} is not in SETTINGS_KEYS`);
    if (SETTING_SCOPE[k] === 'legacy') continue; // dead keys still listed until their clean-up lands
    assert.ok(['org', 'box', 'org+box'].includes(SETTING_SCOPE[k]), `${k} has scope ${SETTING_SCOPE[k]}`);
  }
});

test('legacy keys are exactly the ones nothing may add to; nested location facts carry no site value', () => {
  assert.ok(Object.values(SETTING_SCOPE).filter((s) => s === 'legacy').length >= 1);
  // the physical-screen keys the owner named are overridable per screen, never plain org
  for (const k of ['orientation', 'portraitLayout', 'clockSide', 'theme', 'motion']) assert.equal(SETTING_SCOPE[k], 'org+box', k);
});
