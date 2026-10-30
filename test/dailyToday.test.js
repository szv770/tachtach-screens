// Changing what Daily Word / Daily Story shows TODAY (owner bug: "admin can't change today's word or story").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  normalizeDailyWordsFile, pickDailyWord, recordShownWord, changeTodaysWord, syncTodaysWord,
} from '../src/shared/dailyWords.js';
import {
  normalizeDailyStoriesFile, pickDailyStory, recordShownStory, changeTodaysStory, syncTodaysStory,
} from '../src/shared/dailyStories.js';
import { randomFrom } from '../src/shared/dailyToday.js';
import { validateSettingValues } from '../src/shared/settingsRules.js';
import { canDo } from '../src/shared/permissions.js';

const TODAY = '2026-10-30';
const w = (id, extra = {}) => ({ id, word: id, transliteration: id, meaning: 'm ' + id, ...extra });
const wordFile = (words, history) => normalizeDailyWordsFile({ order: 'sequential', words, history });
const s = (id, extra = {}) => ({ id, title: 'T ' + id, text: 'text ' + id, source: 'Book ' + id, ...extra });
const storyFile = (stories, history) => normalizeDailyStoriesFile({ order: 'sequential', stories, history });

/** A file whose today was already auto-recorded (the real-world state at 9am). */
function recordedWords(n = 6) {
  const f = wordFile(Array.from({ length: n }, (_, i) => w('w' + i)));
  return recordShownWord(f, TODAY).file;
}

test('ROOT CAUSE: once today is archived, a pin for today is ignored by the pick', () => {
  const f = recordedWords();
  const auto = pickDailyWord(f, TODAY).id;
  const other = f.words.find((x) => x.id !== auto).id;
  const pinned = { ...f, words: f.words.map((x) => (x.id === other ? { ...x, showOn: TODAY } : x)) };
  assert.equal(pickDailyWord(pinned, TODAY).id, auto, 'history still wins (the old freeze)');
  // The fix: the recorder / PUT honours a late pin for today, and records it as a hand pick.
  const rec = recordShownWord(pinned, TODAY).file;
  assert.equal(pickDailyWord(rec, TODAY).id, other);
  assert.equal(rec.history[TODAY].manual, true);
  assert.equal(rec.words.find((x) => x.id === other).showOn, undefined, 'the pin is spent');
});

test('word: pick / random / hide / automatic / one-off all change today at once and are archived', () => {
  const f = recordedWords();
  const auto = pickDailyWord(f, TODAY).id;
  const target = f.words.find((x) => x.id !== auto).id;

  let r = changeTodaysWord(f, TODAY, 'pick', { id: target });
  assert.equal(pickDailyWord(r.file, TODAY).id, target);
  assert.equal(r.file.history[TODAY].id, target);
  assert.equal(r.file.history[TODAY].manual, true);

  r = changeTodaysWord(f, TODAY, 'random', { rng: () => 0 });
  assert.notEqual(pickDailyWord(r.file, TODAY).id, auto, 'random is a different one');

  const hidden = changeTodaysWord(f, TODAY, 'hide');
  assert.equal(hidden.file.words.find((x) => x.id === auto).enabled, false);
  assert.notEqual(pickDailyWord(hidden.file, TODAY).id, auto);
  assert.notEqual(hidden.file.history[TODAY].id, auto, 'the archive records what really showed');

  const picked = changeTodaysWord(f, TODAY, 'pick', { id: target }).file;
  const back = changeTodaysWord(picked, TODAY, 'automatic');
  assert.equal(pickDailyWord(back.file, TODAY).id, auto, 'automatic = the rotation again');
  assert.equal(back.file.history[TODAY].manual, undefined);

  const one = changeTodaysWord(f, TODAY, 'oneoff', { entry: { word: 'נו', transliteration: 'nu', meaning: 'So?' } });
  const cur = pickDailyWord(one.file, TODAY);
  assert.equal(cur.transliteration, 'nu');
  assert.equal(one.file.words.find((x) => x.id === cur.id).enabled, false, 'kept off the rotation');
  // tomorrow the rotation never picks the one-off
  for (let i = 1; i < 20; i++) {
    const d = new Date(Date.parse(TODAY) + i * 864e5).toISOString().slice(0, 10);
    assert.notEqual(pickDailyWord(one.file, d).id, cur.id);
  }
});

test('word: refusals are plain sentences and leave the file alone', () => {
  const f = recordedWords(3);
  assert.match(changeTodaysWord(f, TODAY, 'pick', { id: 'nope' }).error, /not on the list/);
  const off = { ...f, words: f.words.map((x, i) => (i === 0 ? { ...x, enabled: false } : x)) };
  assert.match(changeTodaysWord(off, TODAY, 'pick', { id: 'w0' }).error, /switched off/);
  assert.match(changeTodaysWord(recordedWords(1), TODAY, 'random').error, /no other/);
  assert.match(changeTodaysWord(f, TODAY, 'oneoff', { entry: { word: 'x' } }).error, /meaning/);
  assert.ok(changeTodaysWord(f, 'bad', 'hide').error);
  assert.ok(changeTodaysWord(f, TODAY, 'explode').error);
});

test('random: setting decides between "not shown yet" and "any"; falls back when all were shown', () => {
  let f = wordFile(['a', 'b', 'c', 'd'].map((id) => w(id)), { '2026-10-28': { id: 'b', word: 'b', meaning: 'm' }, '2026-10-29': { id: 'c', word: 'c', meaning: 'm' }, [TODAY]: { id: 'a', word: 'a', meaning: 'm' } });
  const seen = new Set();
  for (let i = 0; i < 10; i++) seen.add(changeTodaysWord(f, TODAY, 'random', { rng: () => i / 10, randomFrom: 'unshown' }).file.history[TODAY].id);
  assert.deepEqual([...seen], ['d'], 'only the unshown one');
  const any = new Set();
  for (let i = 0; i < 10; i++) any.add(changeTodaysWord(f, TODAY, 'random', { rng: () => i / 10, randomFrom: 'all' }).file.history[TODAY].id);
  assert.deepEqual([...any].sort(), ['b', 'c', 'd']);
  f = { ...f, history: { ...f.history, '2026-10-27': { id: 'd', word: 'd', meaning: 'm' } } };
  assert.ok(changeTodaysWord(f, TODAY, 'random', { rng: () => 0, randomFrom: 'unshown' }).pickedId, 'everything shown: falls back to any');
  assert.equal(randomFrom({}), 'unshown');
  assert.equal(randomFrom({ dailyPick: { randomFrom: 'all' } }), 'all');
  assert.equal(randomFrom({ dailyPick: { randomFrom: 'zzz' } }), 'unshown');
});

test('edit: today archive copy follows the edited entry, manual flag kept', () => {
  const f = changeTodaysWord(recordedWords(), TODAY, 'pick', { id: 'w4' }).file;
  const edited = { ...f, words: f.words.map((x) => (x.id === 'w4' ? { ...x, meaning: 'fresh meaning' } : x)) };
  const synced = syncTodaysWord(edited, TODAY);
  assert.equal(synced.history[TODAY].meaning, 'fresh meaning');
  assert.equal(synced.history[TODAY].manual, true);
  assert.equal(pickDailyWord(synced, TODAY).meaning, 'fresh meaning');
});

test('story: same operations; an unsourced story is never shown (one-off needs a source)', () => {
  const f = recordShownStory(storyFile(Array.from({ length: 5 }, (_, i) => s('s' + i))), TODAY).file;
  const auto = pickDailyStory(f, TODAY).id;
  const target = f.stories.find((x) => x.id !== auto).id;
  const r = changeTodaysStory(f, TODAY, 'pick', { id: target });
  assert.equal(pickDailyStory(r.file, TODAY).id, target);
  assert.equal(r.file.history[TODAY].manual, true);
  assert.notEqual(pickDailyStory(changeTodaysStory(f, TODAY, 'hide').file, TODAY).id, auto);
  assert.equal(pickDailyStory(changeTodaysStory(r.file, TODAY, 'automatic').file, TODAY).id, auto);
  assert.match(changeTodaysStory(f, TODAY, 'oneoff', { entry: { kind: 'story', title: 'x', text: 'y' } }).error, /source/);
  const ok = changeTodaysStory(f, TODAY, 'oneoff', { entry: { kind: 'story', title: 'x', text: 'y', source: 'Real book p. 3' } });
  assert.equal(pickDailyStory(ok.file, TODAY).title, 'x');
  const thought = changeTodaysStory(f, TODAY, 'oneoff', { entry: { kind: 'thought', title: 'th', text: 'a thought' } });
  assert.equal(pickDailyStory(thought.file, TODAY).title, 'th', 'a thought needs no source');
  // an unsourced story already on the list stays unpickable
  const bad = { ...f, stories: [...f.stories, { ...s('x1'), source: '', enabled: false }] };
  assert.match(changeTodaysStory(bad, TODAY, 'pick', { id: 'x1' }).error, /switched off/);
  const e = { ...f, stories: f.stories.map((x) => (x.id === target ? { ...x, title: 'Edited' } : x)) };
  assert.equal(syncTodaysStory({ ...e, history: { ...e.history, [TODAY]: { ...e.history[TODAY], id: target } } }, TODAY).history[TODAY].title, 'Edited');
  const late = recordShownStory({ ...f, stories: f.stories.map((x) => (x.id === target ? { ...x, showOn: TODAY } : x)) }, TODAY).file;
  assert.equal(pickDailyStory(late, TODAY).id, target, 'a late pin for today wins');
});

test('manual flag survives normalisation of the file', () => {
  const f = changeTodaysWord(recordedWords(), TODAY, 'pick', { id: 'w3' }).file;
  assert.equal(normalizeDailyWordsFile(f).history[TODAY].manual, true);
  const g = changeTodaysStory(recordShownStory(storyFile([s('a'), s('b')]), TODAY).file, TODAY, 'pick', { id: 'b' }).file;
  assert.equal(normalizeDailyStoriesFile(g).history[TODAY].manual, true);
});

test('setting rule + capability: dailyPick is validated, and editors with dailyWord.edit may change it', () => {
  assert.equal(validateSettingValues({ dailyPick: { randomFrom: 'all' } }).length, 0);
  assert.ok(validateSettingValues({ dailyPick: { randomFrom: 'nope' } }).length);
  const full = { role: 'editor', preset: 'full' };
  assert.equal(canDo(full, 'POST', '/api/daily-words/today', {}), true);
  assert.equal(canDo(full, 'POST', '/api/daily-stories/today', {}), true);
  assert.equal(canDo(full, 'PATCH', '/api/settings', { dailyPick: { randomFrom: 'all' } }), true);
  const none = { role: 'editor', preset: 'writer', grant: [], deny: ['dailyWord.edit'] };
  assert.equal(canDo(none, 'POST', '/api/daily-words/today', {}), false);
  assert.equal(canDo({ role: 'admin' }, 'POST', '/api/daily-stories/today', {}), true);
});

// ── The real routes on a scratch data dir ───────────────────────────────────────────────────────────────────────
test('routes: a Daily Word / Story change today is saved, archived and broadcast over SSE', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-daily-'));
  process.env.TACHTACH_DATA_DIR = dir;
  const express = (await import('express')).default;
  const words = (await import('../src/server/routes/daily-words.js'));
  const stories = (await import('../src/server/routes/daily-stories.js'));
  const sse = await import('../src/server/sse.js');
  const events = [];
  const res = { writeHead() {}, setHeader() {}, flushHeaders() {}, write(c) { events.push(String(c)); return true; }, on() {}, end() {}, writableEnded: false };
  sse.addClient(res, false, false, null);
  const app = express();
  app.use('/api', words.default); app.use('/api', stories.default);
  const server = await new Promise((ok) => { const sv = app.listen(0, '127.0.0.1', () => ok(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json() };
  };
  try {
    for (const [name, list, titleOf] of [['daily-words', 'words', (x) => x.transliteration], ['daily-stories', 'stories', (x) => x.title]]) {
      const g = await call('GET', '/' + name);
      assert.equal(g.status, 200);
      const today = g.json.today;
      if (!g.json[list].length) await call('PUT', '/' + name, { order: 'sequential', [list]: Array.from({ length: 5 }, (_, i) => s('s' + i)) }); // the starter story library is empty (no unsourced stories)
      assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
      await (name === 'daily-words' ? words.recordTodaysWord() : stories.recordTodaysStory());
      const before = (await call('GET', '/' + name)).json;
      assert.ok(before.history[today], name + ' recorded ' + JSON.stringify(Object.keys(before)));
      const autoId = before.history[today].id;
      assert.ok(autoId, 'today was auto-recorded');
      const target = before[list].find((x) => x.id !== autoId && x.enabled !== false).id;
      let r = await call('POST', `/${name}/today`, { op: 'pick', id: target });
      assert.equal(r.status, 200);
      assert.equal(r.json.history[today].id, target);
      assert.equal(r.json.history[today].manual, true);
      assert.equal((await call('GET', '/' + name)).json.history[today].id, target, 'persisted');
      // the recorder must NOT undo it
      await (name === 'daily-words' ? words.recordTodaysWord() : stories.recordTodaysStory());
      assert.equal((await call('GET', '/' + name)).json.history[today].id, target, 'recorder keeps the hand pick');
      r = await call('POST', `/${name}/today`, { op: 'random' });
      assert.equal(r.status, 200); assert.notEqual(r.json.history[today].id, target);
      r = await call('POST', `/${name}/today`, { op: 'hide' });
      assert.equal(r.status, 200);
      r = await call('POST', `/${name}/today`, { op: 'automatic' });
      assert.equal(r.status, 200); assert.equal(r.json.history[today].manual, undefined);
      assert.equal((await call('POST', `/${name}/today`, { op: 'pick', id: 'missing' })).status, 400);
      assert.equal((await call('POST', `/${name}/today`, { op: 'nope' })).status, 400);
      // edit through PUT: today's archive copy follows
      const cur = (await call('GET', '/' + name)).json;
      const id = cur.history[today].id;
      const edited = cur[list].map((x) => (x.id === id ? { ...x, [list === 'words' ? 'meaning' : 'text']: 'EDITED TEXT' } : x));
      r = await call('PUT', '/' + name, { order: cur.order, [list]: edited });
      assert.equal(r.status, 200);
      assert.equal(r.json.history[today][list === 'words' ? 'meaning' : 'text'], 'EDITED TEXT');
      assert.ok(titleOf(r.json[list][0]) !== undefined);
      // a pin for today written by PUT shows immediately (no waiting for the 10-minute recorder)
      const other = r.json[list].find((x) => x.id !== id && x.enabled !== false).id;
      r = await call('PUT', '/' + name, { order: cur.order, [list]: r.json[list].map((x) => (x.id === other ? { ...x, showOn: today } : x)) });
      assert.equal(r.json.history[today].id, other);
    }
    const sent = events.join('');
    assert.match(sent, /daily-words-update/); assert.match(sent, /daily-stories-update/);
    // the kiosk gets today's hand pick in the broadcast (forKiosk keeps the last days of history)
    assert.match(sent, /"manual":true/);
  } finally {
    await new Promise((ok) => server.close(ok));
    delete process.env.TACHTACH_DATA_DIR;
  }
});
