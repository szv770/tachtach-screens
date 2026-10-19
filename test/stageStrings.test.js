import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_STRINGS, startedLines, sessionKicker } from '../src/shared/stageStrings.js';

test('just started: English always when there is a name, Hebrew only with a Hebrew name', () => {
  assert.deepEqual(startedLines({ name: 'Seder', nameHe: 'סדר' }), { en: 'Seder just started', he: 'כעת: סדר' });
  assert.deepEqual(startedLines({ name: 'Seder' }), { en: 'Seder just started', he: '' });
  assert.deepEqual(startedLines({ nameHe: 'סדר' }), { en: '', he: 'כעת: סדר' });
  assert.deepEqual(startedLines(null), { en: '', he: '' });
});

test('session kicker: English always, Hebrew construct only with a Hebrew name', () => {
  assert.deepEqual(sessionKicker({ name: 'Seder' }), { en: 'Now in session', he: '' });
  assert.equal(sessionKicker({ name: 'Seder', nameHe: 'סדר' }).he, STAGE_STRINGS.session.he);
});

test('the old "עכשיו:" wording is gone from the table', () => {
  assert.ok(!JSON.stringify(STAGE_STRINGS).includes('עכשיו'));
});
