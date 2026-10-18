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

test('English spelling is ch-style: kh becomes ch in imports and edits (Chaver, Nachas)', () => {
  const r = normalizeWord({ word: 'חבר', transliteration: 'khaver', pronunciation: 'khah-VER', meaning: 'A Khaver is a friend.', context: 'The kh in Bach.', convo: ['Who is he?', 'My *khaver*, Khaim.'] });
  assert.equal(r.word.transliteration, 'chaver');
  assert.equal(r.word.pronunciation, 'chah-VER');
  assert.equal(r.word.meaning, 'A Chaver is a friend.');
  assert.equal(r.word.context, 'The ch in Bach.');
  assert.equal(r.word.convo[1].text, 'My *chaver*, Chaim.');
  assert.ok(!SEED_WORDS.some((w) => /kh/i.test([w.transliteration, w.pronunciation, w.meaning, w.context, ...w.convo.map((c) => c.text)].join(' '))), 'no kh left in the seed');
});

import { recordShownWord, upcomingWords, archiveRows, pinWord, addDaysISO, forKiosk, pickFromRotation } from '../src/shared/dailyWords.js';

const mk = (n, extra = {}) => normalizeDailyWordsFile({ order: 'sequential', words: SEED_WORDS.slice(0, n), ...extra });

test('recordShownWord archives the day; the day then keeps that word even if the list changes', () => {
  const file = mk(10);
  const day = '2026-10-20';
  const shown = pickDailyWord(file, day);
  const r = recordShownWord(file, day);
  assert.equal(r.changed, true);
  assert.equal(r.file.history[day].id, shown.id);
  assert.equal(recordShownWord(r.file, day).changed, false, 'idempotent');
  // reorder + add words: today stays the same, because it is in history
  const shuffled = { ...r.file, words: [...r.file.words].reverse() };
  assert.equal(pickDailyWord(shuffled, day).id, shown.id);
  // delete the word: the snapshot still answers
  const gone = { ...r.file, words: r.file.words.filter((w) => w.id !== shown.id) };
  const p = pickDailyWord(gone, day);
  assert.equal(p.transliteration, shown.transliteration);
});

test('a pinned word is archived on its day and rejoins the rotation afterwards', () => {
  let file = mk(10);
  const target = file.words[7];
  file = pinWord(file, target.id, '2026-10-22');
  assert.equal(pickDailyWord(file, '2026-10-22').id, target.id);
  assert.ok(!pickFromRotation(file, '2026-10-21') || pickFromRotation(file, '2026-10-21').id !== target.id, 'kept out of the rotation until its day');
  const r = recordShownWord(file, '2026-10-22');
  assert.equal(r.file.history['2026-10-22'].id, target.id);
  assert.equal(r.file.words.find((w) => w.id === target.id).showOn, undefined, 'pin cleared after its day');
});

test('pinWord keeps one pinned word per day and re-enables the word', () => {
  let file = mk(6);
  file = pinWord(file, file.words[1].id, '2026-11-01');
  file = pinWord(file, file.words[2].id, '2026-11-01');
  assert.equal(file.words.filter((w) => w.showOn === '2026-11-01').length, 1);
  assert.equal(file.words[2].showOn, '2026-11-01');
  assert.equal(file.words[1].showOn, undefined);
});

test('upcomingWords lists consecutive days; archiveRows is newest first with live flag', () => {
  let file = mk(5);
  file = recordShownWord(file, '2026-10-18').file;
  file = recordShownWord(file, '2026-10-19').file;
  const up = upcomingWords(file, '2026-10-18', 4);
  assert.deepEqual(up.map((u) => u.date), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']);
  assert.equal(up[0].locked, true);
  assert.equal(up[2].locked, false);
  assert.ok(up.every((u) => u.word));
  const rows = archiveRows(file);
  assert.deepEqual(rows.map((r) => r.date), ['2026-10-19', '2026-10-18']);
  assert.ok(rows[0].live);
  assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
});

test('history survives normalisation, is trimmed for the kiosk, and is cleaned (rafe/kh)', () => {
  const file = normalizeDailyWordsFile({ words: SEED_WORDS.slice(0, 3), history: {
    '2026-10-01': { id: 'a', word: 'פֿאַר', transliteration: 'khaver', meaning: 'x' }, '2026-10-02': { id: 'b', word: 'ב', transliteration: 'b', meaning: 'x' },
    '2026-10-03': { id: 'c', word: 'ג', transliteration: 'c', meaning: 'x' }, '2026-10-04': { id: 'd', word: 'ד', transliteration: 'd', meaning: 'x' }, 'junk': { word: 'x' }, '2026-10-05': {} } });
  assert.equal(Object.keys(file.history).length, 4);
  assert.equal(file.history['2026-10-01'].transliteration, 'chaver');
  assert.ok(!file.history['2026-10-01'].word.includes('ֿ'));
  assert.deepEqual(Object.keys(forKiosk(file, 2).history), ['2026-10-03', '2026-10-04']);
});
