import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasHebrew, textDir, slotDir, bidiRuns } from '../src/shared/bidi.js';

test('hasHebrew', () => {
  assert.equal(hasHebrew('מזל טוב!'), true);
  assert.equal(hasHebrew('Mazel Tov!'), false);
  assert.equal(hasHebrew(''), false);
  assert.equal(hasHebrew(null), false);
});

test('textDir: first strong character, like dir=auto', () => {
  assert.equal(textDir('מזל טוב!'), 'rtl');
  assert.equal(textDir('!מזל טוב'), 'rtl');
  assert.equal(textDir('9:30 מנחה'), 'rtl');
  assert.equal(textDir('מבצע תפילין — יום ה׳, 2:00 PM'), 'rtl');
  assert.equal(textDir('Mazel Tov to the Cohen family on the birth of a baby boy!'), 'ltr');
  assert.equal(textDir('Farbrengen · התוועדות'), 'ltr');
  assert.equal(textDir('(שבת)'), 'rtl');
  assert.equal(textDir('9:30'), null);
  assert.equal(textDir('!!!'), null);
});

test('slotDir: any Hebrew in a Hebrew slot is RTL', () => {
  assert.equal(slotDir('Lag BaOmer בשדה!', 'he'), 'rtl');
  assert.equal(slotDir('Lag BaOmer בשדה!', 'en'), 'ltr');
  assert.equal(slotDir('Shiur', 'he'), 'ltr');
});

test('bidiRuns: Hebrew runs in an LTR string are isolated with their closing punctuation', () => {
  const r = bidiRuns('Mazel Tov — מזל טוב!');
  assert.deepEqual(r, [{ text: 'Mazel Tov — ', dir: null }, { text: 'מזל טוב!', dir: 'rtl' }]);
  const r2 = bidiRuns('Farbrengen · התוועדות בזאל, 9:30 PM');
  assert.equal(r2[1].dir, 'rtl');
  assert.equal(r2[1].text, 'התוועדות בזאל,');
  assert.equal(r2.map((x) => x.text).join(''), 'Farbrengen · התוועדות בזאל, 9:30 PM');
  assert.deepEqual(bidiRuns('Hello'), [{ text: 'Hello', dir: null }]);
  assert.deepEqual(bidiRuns('מזל טוב!'), [{ text: 'מזל טוב!', dir: null }]);   // RTL base: nothing to isolate
  assert.equal(bidiRuns('Yud-Tes Kislev (י״ט כסלו)?')[1].text, 'י״ט כסלו');
});

test('takeover model: Hebrew typed into the English field moves to the Hebrew (RTL) slot', async () => {
  const { modelBigWords, modelEvent } = await import('../src/shared/takeoverModel.js');
  const m = modelBigWords({ content: { bodyEn: 'מזל טוב!' } });
  assert.deepEqual([m.he, m.en], ['מזל טוב!', '']);
  assert.equal(modelBigWords({ content: { bodyEn: 'Mazel Tov — מזל טוב!' } }).en, 'Mazel Tov — מזל טוב!');
  assert.equal(modelEvent({ content: { event: { title: 'מבצע תפילין — יום ה׳, 2:00 PM' } } }).he, 'מבצע תפילין — יום ה׳, 2:00 PM');
});
