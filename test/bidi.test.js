import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHebrew, textDir, bidiRuns, isMixed } from '../src/shared/bidi.js';

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
