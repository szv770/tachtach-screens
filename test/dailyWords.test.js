import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWord, normalizeWords, parseWordsText, pickDailyWord, dayNumber, splitEmphasis, normalizeDailyWordsFile } from '../src/shared/dailyWords.js';
import { SEED_WORDS } from '../src/shared/dailyWordsSeed.js';

test('seed words are all valid and unique', () => {
  const { words, errors } = normalizeWords(SEED_WORDS);
  assert.equal(errors.length, 0);
  assert.equal(words.length, SEED_WORDS.length);
  assert.equal(new Set(words.map((w) => w.word)).size, words.length, 'no duplicate words');
  for (const w of words) {
    assert.ok(w.pronunciation, w.transliteration + ' has a pronunciation');
    assert.equal(w.convo.length, 2, w.transliteration + ' has a two-line convo');
    assert.ok(w.convo.some((l) => /\*[^*]+\*/.test(l.text)) || w.convo.length === 2);
  }
});

test('normalizeWord needs a word and a meaning, accepts aliases', () => {
  assert.ok(normalizeWord({}).error);
  assert.ok(normalizeWord({ word: 'נו' }).error);
  const r = normalizeWord({ yiddish: 'נו', translit: 'nu', english: 'So?', convo: 'a\nb' });
  assert.equal(r.word.word, 'נו');
  assert.equal(r.word.transliteration, 'nu');
  assert.deepEqual(r.word.convo, [{ text: 'a' }, { text: 'b' }]);
  assert.equal(r.word.language, 'Yiddish');
  assert.ok(r.word.id);
});

test('parseWordsText handles arrays, wrapped objects and fenced replies', () => {
  const list = [{ word: 'נו', transliteration: 'nu', meaning: 'So?' }];
  assert.equal(parseWordsText(JSON.stringify(list)).words.length, 1);
  assert.equal(parseWordsText(JSON.stringify({ words: list })).words.length, 1);
  assert.equal(parseWordsText('Sure!\n```json\n' + JSON.stringify(list) + '\n```').words.length, 1);
  assert.equal(parseWordsText('here: ' + JSON.stringify(list) + ' enjoy').words.length, 1);
  assert.ok(parseWordsText('nope').errors.length);
  const mixed = parseWordsText(JSON.stringify([...list, { word: 'x' }]));
  assert.equal(mixed.words.length, 1);
  assert.equal(mixed.errors.length, 1);
});

test('pickDailyWord: sequential wraps, same date -> same word, empty list -> null', () => {
  const file = normalizeDailyWordsFile({ order: 'sequential', words: SEED_WORDS });
  const a = pickDailyWord(file, '2026-10-18');
  assert.equal(pickDailyWord(file, '2026-10-18').id, a.id);
  const n = file.words.length;
  const d0 = dayNumber('2026-10-18');
  const next = pickDailyWord(file, new Date((d0 + 1) * 86400000).toISOString().slice(0, 10));
  assert.equal(file.words.indexOf(next), (file.words.indexOf(a) + 1) % n);
  const wrap = pickDailyWord(file, new Date((d0 + n) * 86400000).toISOString().slice(0, 10));
  assert.equal(wrap.id, a.id);
  assert.equal(pickDailyWord({ words: [] }, '2026-10-18'), null);
  assert.equal(pickDailyWord(file, 'garbage'), null);
});

test('pickDailyWord: shuffle shows every word once per cycle, then reshuffles', () => {
  const file = normalizeDailyWordsFile({ order: 'shuffle', words: SEED_WORDS });
  const n = file.words.length;
  const base = Math.floor(dayNumber('2026-10-18') / n) * n; // start of a cycle
  const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
  const c1 = Array.from({ length: n }, (_, i) => pickDailyWord(file, iso(base + i)).id);
  assert.equal(new Set(c1).size, n, 'a full cycle has no repeats');
  const c2 = Array.from({ length: n }, (_, i) => pickDailyWord(file, iso(base + n + i)).id);
  assert.equal(new Set(c2).size, n);
  assert.notDeepEqual(c1, c2, 'next cycle is a different order');
});

test('pickDailyWord: showOn pins a date, disabled words are skipped', () => {
  const words = [
    { id: 'a', word: 'א', meaning: 'm' }, { id: 'b', word: 'ב', meaning: 'm', showOn: '2026-10-20' },
    { id: 'c', word: 'ג', meaning: 'm', enabled: false }, { id: 'd', word: 'ד', meaning: 'm' },
  ];
  const file = { order: 'sequential', words };
  assert.equal(pickDailyWord(file, '2026-10-20').id, 'b');
  for (const day of ['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-22']) {
    const id = pickDailyWord(file, day).id;
    assert.ok(id === 'a' || id === 'd', 'rotation only uses unpinned, enabled words: ' + id);
  }
});

test('splitEmphasis', () => {
  assert.deepEqual(splitEmphasis('I had to *shlep* them up'), [
    { text: 'I had to ', em: false }, { text: 'shlep', em: true }, { text: ' them up', em: false }]);
  assert.deepEqual(splitEmphasis('plain'), [{ text: 'plain', em: false }]);
  assert.deepEqual(splitEmphasis(''), []);
});

test('the rafe (bar above pe) is stripped from words, seed included', () => {
  const r = normalizeWord({ word: 'פֿאַרברענגען', transliteration: 'farbrengen', meaning: 'm' });
  assert.equal(r.word.word, 'פאַרברענגען');
  assert.ok(!SEED_WORDS.some((w) => w.word.includes('\u05BF')), 'no rafe in the seed list');
  assert.ok(SEED_WORDS.some((w) => w.word.includes('\u05B7')), 'pasekh alef (patah under the alef) is still there');
});
