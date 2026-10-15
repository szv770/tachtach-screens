import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHebrew, textDir, bidiRuns, isMixed, strongDir, slotDir, takeoverRuns } from '../src/shared/bidi.js';

test('hasHebrew', () => {
  assert.equal(hasHebrew('ברוכים הבאים!'), true);
  assert.equal(hasHebrew('Mazel Tov!'), false);
  assert.equal(hasHebrew(''), false);
  assert.equal(hasHebrew(null), false);
});

test('textDir follows the first strong character', () => {
  for (const s of ['ברוכים הבאים!', 'מה השעה?', '(שיעור) בגמרא', 'ג׳ מרחשון תשפ״ז', 'שחרית - 7:30', 'מבצע תפילין — יום ה׳ 2:00 PM', '"שלום"']) assert.equal(textDir(s), 'rtl', s);
  assert.equal(textDir('Mazel Tov! מזל טוב!'), 'ltr');
  for (const s of ['...', '', '12:30', '9']) assert.equal(textDir(s), 'ltr', s);
  assert.equal(textDir('...', 'rtl'), 'rtl');
});

test('bidiRuns isolates each language run, punctuation stays with its word', () => {
  assert.deepEqual(bidiRuns('Mazel Tov! מזל טוב!'), [{ text: 'Mazel Tov! ', dir: 'ltr' }, { text: 'מזל טוב!', dir: 'rtl' }]);
  assert.deepEqual(bidiRuns('ברוכים הבאים!'), [{ text: 'ברוכים הבאים!', dir: 'rtl' }]);
  assert.deepEqual(bidiRuns('שחרית - 7:30'), [{ text: 'שחרית - 7:30', dir: 'rtl' }]);
  const r = bidiRuns('מבצע תפילין — יום ה׳ 2:00 PM');
  assert.equal(r.map((x) => x.text).join(''), 'מבצע תפילין — יום ה׳ 2:00 PM');
  assert.deepEqual(r.map((x) => x.dir), ['rtl', 'ltr']);
  assert.deepEqual(bidiRuns('...'), [{ text: '...', dir: 'ltr' }]);
  assert.deepEqual(bidiRuns(''), []);
  assert.deepEqual(bidiRuns('"שלום"'), [{ text: '"שלום"', dir: 'rtl' }]);
  assert.equal(isMixed('Mazel Tov! מזל טוב!'), true);
  assert.equal(isMixed('שלום'), false);
});



test('textDir: first strong character, like dir=auto', () => {
  assert.equal(strongDir('מזל טוב!'), 'rtl');
  assert.equal(strongDir('!מזל טוב'), 'rtl');
  assert.equal(strongDir('9:30 מנחה'), 'rtl');
  assert.equal(strongDir('מבצע תפילין — יום ה׳, 2:00 PM'), 'rtl');
  assert.equal(strongDir('Mazel Tov to the Cohen family on the birth of a baby boy!'), 'ltr');
  assert.equal(strongDir('Farbrengen · התוועדות'), 'ltr');
  assert.equal(strongDir('(שבת)'), 'rtl');
  assert.equal(strongDir('9:30'), null);
  assert.equal(strongDir('!!!'), null);
});

test('slotDir: any Hebrew in a Hebrew slot is RTL', () => {
  assert.equal(slotDir('Lag BaOmer בשדה!', 'he'), 'rtl');
  assert.equal(slotDir('Lag BaOmer בשדה!', 'en'), 'ltr');
  assert.equal(slotDir('Shiur', 'he'), 'ltr');
});

test('bidiRuns: Hebrew runs in an LTR string are isolated with their closing punctuation', () => {
  const r = takeoverRuns('Mazel Tov — מזל טוב!');
  assert.deepEqual(r, [{ text: 'Mazel Tov — ', dir: null }, { text: 'מזל טוב!', dir: 'rtl' }]);
  const r2 = takeoverRuns('Farbrengen · התוועדות בזאל, 9:30 PM');
  assert.equal(r2[1].dir, 'rtl');
  assert.equal(r2[1].text, 'התוועדות בזאל,');
  assert.equal(r2.map((x) => x.text).join(''), 'Farbrengen · התוועדות בזאל, 9:30 PM');
  assert.deepEqual(takeoverRuns('Hello'), [{ text: 'Hello', dir: null }]);
  assert.deepEqual(takeoverRuns('מזל טוב!'), [{ text: 'מזל טוב!', dir: null }]);   // RTL base, no Latin: nothing to isolate
});

test('bidiRuns: Latin / time runs in an RTL string are isolated LTR (no "PM 2:00")', () => {
  const r = takeoverRuns('מבצע תפילין — יום ה׳, 2:00 PM');
  assert.deepEqual(r[r.length - 1], { text: '2:00 PM', dir: 'ltr' });
  assert.equal(r.map((x) => x.text).join(''), 'מבצע תפילין — יום ה׳, 2:00 PM');
  assert.equal(takeoverRuns('שיעור 9:30–10:00 בזאל!').find((x) => x.dir).text, '9:30–10:00');
  assert.deepEqual(takeoverRuns('יום ה׳, 2:00'), [{ text: 'יום ה׳, 2:00', dir: null }]);   // a bare time orders itself
  assert.equal(takeoverRuns('האוטובוסים במגרש B').find((x) => x.dir).text, 'B');
  assert.equal(takeoverRuns('Yud-Tes Kislev (י״ט כסלו)?')[1].text, 'י״ט כסלו');
});

test('takeover model: Hebrew typed into the English field moves to the Hebrew (RTL) slot', async () => {
  const { modelBigWords, modelEvent } = await import('../src/shared/takeoverModel.js');
  const m = modelBigWords({ content: { bodyEn: 'מזל טוב!' } });
  assert.deepEqual([m.he, m.en], ['מזל טוב!', '']);
  assert.equal(modelBigWords({ content: { bodyEn: 'Mazel Tov — מזל טוב!' } }).en, 'Mazel Tov — מזל טוב!');
  assert.equal(modelEvent({ content: { event: { title: 'מבצע תפילין — יום ה׳, 2:00 PM' } } }).he, 'מבצע תפילין — יום ה׳, 2:00 PM');
});
