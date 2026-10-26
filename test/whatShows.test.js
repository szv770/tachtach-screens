// "What shows" bundle: up-next switch, side notes at once / speed, Daily Story reading time follows the reading speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sideNotesLimits, SIDE_NOTES_DEFAULT_MAX, SIDE_NOTES_DEFAULT_SECONDS } from '../src/shared/railNotes.js';
import { validateSettingsPatch, deepMerge } from '../src/shared/settingsMerge.js';
import { readingSeconds } from '../src/shared/dailyStories.js';
import { normalizeSettings } from '../src/server/settings-migrate.js';
import { canDo } from '../src/shared/permissions.js';

test('defaults are exactly what the screen did before (2 notes, 8 seconds, up-next on)', () => {
  assert.deepEqual(sideNotesLimits({}), { max: 2, seconds: 8 });
  assert.deepEqual(sideNotesLimits(undefined), { max: SIDE_NOTES_DEFAULT_MAX, seconds: SIDE_NOTES_DEFAULT_SECONDS });
  assert.deepEqual(sideNotesLimits({ rail: { upNextMinutes: 5 } }), { max: 2, seconds: 8 });
  assert.deepEqual(sideNotesLimits({ rail: { sideNotesMax: 1, sideNotesSeconds: 15 } }), { max: 1, seconds: 15 });
});

test('a bad stored value falls back to the default instead of breaking the rail', () => {
  for (const bad of [0, 3, 99, -1, 1.5, '2', null, true]) assert.equal(sideNotesLimits({ rail: { sideNotesMax: bad } }).max, 2, String(bad));
  for (const bad of [0, 3, 31, 1000, 8.5, '8', null]) assert.equal(sideNotesLimits({ rail: { sideNotesSeconds: bad } }).seconds, 8, String(bad));
});

test('the server refuses out-of-range values and cleans a hand-edited file', () => {
  assert.equal(validateSettingsPatch({ rail: { sideNotesMax: 3 } }).ok, false);
  assert.equal(validateSettingsPatch({ rail: { sideNotesMax: 0 } }).ok, false);
  assert.equal(validateSettingsPatch({ rail: { sideNotesMax: 1 } }).ok, true);
  assert.equal(validateSettingsPatch({ rail: { sideNotesSeconds: 3 } }).ok, false);
  assert.equal(validateSettingsPatch({ rail: { sideNotesSeconds: 31 } }).ok, false);
  assert.equal(validateSettingsPatch({ rail: { sideNotesSeconds: 30 } }).ok, true);
  assert.equal(validateSettingsPatch({ rail: { upNextMinutes: 7 } }).ok, true, 'other rail keys are unaffected');
  assert.equal(validateSettingsPatch({ visibility: { upNext: 'no' } }).ok, false);
  assert.equal(validateSettingsPatch({ visibility: { upNext: false } }).ok, true);
  const { settings } = normalizeSettings({ rail: { upNextMinutes: 5, sideNotesMax: 9 }, visibility: { clock: true, upNext: 'x' } });
  assert.deepEqual(settings.rail, { upNextMinutes: 5 });
  assert.deepEqual(settings.visibility, { clock: true });
});

test('turning the up-next card off keeps the other visibility switches', () => {
  const out = deepMerge({ visibility: { clock: true, parsha: false } }, { visibility: { upNext: false } });
  assert.deepEqual(out.visibility, { clock: true, parsha: false, upNext: false });
});

test('Daily Story reading time: Normal is the old behaviour, Slow gives more time, Fast less, never over 90 s', () => {
  const story = { text: Array(100).fill('word').join(' '), textHe: '' };
  const normal = readingSeconds(story);
  assert.equal(normal, Math.round(4 + 100 * (60 / 140)), 'unchanged from before');
  assert.equal(readingSeconds(story, 'normal'), normal);
  assert.ok(readingSeconds(story, 'slow') > normal);
  assert.ok(readingSeconds(story, 'fast') < normal);
  assert.equal(readingSeconds(story, 'bogus'), normal);
  assert.equal(readingSeconds({ text: Array(5000).fill('w').join(' ') }, 'slow'), 90);
  assert.equal(readingSeconds(null), 4);
});

test('capability: these settings need look.change (rail, visibility are look keys)', () => {
  const body = { rail: { sideNotesMax: 1 } };
  assert.equal(canDo({ role: 'editor', overrides: { revoke: ['look.change', 'settings.change'] } }, 'PATCH', '/api/settings', body), false);
  assert.equal(canDo('admin', 'PATCH', '/api/settings', body), true);
});
