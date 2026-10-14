import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, diffSettings, validateSettingsPatch, SETTINGS_KEYS } from '../src/shared/settingsMerge.js';

const stored = {
  theme: 'midnight',
  location: { zip: '33139', locationId: '33139', timezone: 'America/New_York' },
  credit: { enabled: true, text: 'Hi', logo: { url: '/uploads/l.png', blend: 'original' } },
  fonts: { hebrew: 'A', english: 'B', customFonts: [{ id: 1 }] },
  zmanimVisible: ['alos', 'netz'],
  banner: { size: 'normal' },
};

test('deepMerge keeps sibling keys at every level', () => {
  const out = deepMerge(stored, { credit: { logo: { blend: 'match-theme' } } });
  assert.equal(out.credit.text, 'Hi');
  assert.equal(out.credit.logo.url, '/uploads/l.png');
  assert.equal(out.credit.logo.blend, 'match-theme');
  assert.equal(out.theme, 'midnight');
  assert.equal(stored.credit.logo.blend, 'original', 'input not mutated');
});

test('deepMerge: arrays and scalars replace, null is stored', () => {
  const out = deepMerge(stored, { zmanimVisible: [], theme: 'sky', credit: { logo: null } });
  assert.deepEqual(out.zmanimVisible, []);
  assert.equal(out.theme, 'sky');
  assert.equal(out.credit.logo, null);
  assert.equal(out.credit.text, 'Hi');
});

test('deepMerge: object over scalar/missing creates it; ignores __proto__', () => {
  const out = deepMerge({ themeAuto: null }, JSON.parse('{"themeAuto":{"enabled":true},"__proto__":{"x":1}}'));
  assert.deepEqual(out.themeAuto, { enabled: true });
  assert.equal(({}).x, undefined);
  assert.equal(out.x, undefined);
});

test('two panels saving different keys no longer clobber each other', () => {
  // Style saves fonts from a copy that predates Settings saving theme.
  let disk = { ...stored };
  disk = deepMerge(disk, { theme: 'sky' });                       // Settings panel
  disk = deepMerge(disk, { fonts: { hebrew: 'C', hebrewBody: 'C' } }); // Style panel (stale view)
  assert.equal(disk.theme, 'sky');
  assert.equal(disk.fonts.hebrew, 'C');
  assert.equal(disk.fonts.english, 'B');
  assert.deepEqual(disk.fonts.customFonts, [{ id: 1 }]);
});

test('validateSettingsPatch whitelists top-level keys', () => {
  assert.equal(validateSettingsPatch({ theme: 'x', credit: { foo: 1 } }).ok, true);
  const bad = validateSettingsPatch({ theme: 'x', thmee: 'y' });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /thmee/);
  assert.equal(validateSettingsPatch([]).ok, false);
  assert.equal(validateSettingsPatch(null).ok, false);
  for (const k of ['location', 'scheduler', 'language', 'customTheme', 'banner', 'announcements']) {
    assert.ok(SETTINGS_KEYS.includes(k), k);
  }
});

test('diffSettings returns only what changed', () => {
  const edited = structuredClone(stored);
  edited.location.zip = '11213';
  edited.credit.logo = null;
  edited.language = 'en';
  assert.deepEqual(diffSettings(stored, edited), {
    location: { zip: '11213' },
    credit: { logo: null },
    language: 'en',
  });
  assert.deepEqual(diffSettings(stored, structuredClone(stored)), {});
  // removed key -> null; changed array -> whole array
  const e2 = structuredClone(stored);
  delete e2.banner;
  e2.zmanimVisible = ['alos'];
  assert.deepEqual(diffSettings(stored, e2), { banner: null, zmanimVisible: ['alos'] });
  // diff applied with deepMerge reproduces the edit
  assert.deepEqual(deepMerge(stored, diffSettings(stored, edited)), edited);
});

test('PATCH whitelist accepts the kiosk-redesign keys (fontRoles, themeVersion, rail, weather…)', async () => {
  const { validateSettingsPatch } = await import('../src/shared/settingsMerge.js');
  for (const k of ['fontRoles', 'themeVersion', 'rail', 'layout', 'motion', 'graphics', 'weather', 'zmanimLayout', 'scheduleLayout', 'themeAuto', 'theme']) {
    assert.equal(validateSettingsPatch({ [k]: {} }).ok, true, k);
  }
});
