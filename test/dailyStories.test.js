import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStory, normalizeDailyStoriesFile, parseStoriesText, pickDailyStory, pickFromRotation, recordShownStory,
  upcomingStories, pinStory, dayNumber, addDaysISO, permutation, forKiosk,
} from '../src/shared/dailyStories.js';
import { SEED_STORIES } from '../src/shared/dailyStoriesSeed.js';
import { canDo, canOpenSection } from '../src/shared/permissions.js';
import { popupSpec, SLIDE_TYPES } from '../src/admin/components/slides/slideTypes.js';
import { LATE_BUILTINS } from '../src/server/builtin-slides.js';

const seed = () => normalizeDailyStoriesFile(null, SEED_STORIES);
const isoOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

test('starter library: ~60 valid entries, unique ids, every one has a title and readable length', () => {
  const f = seed();
  assert.ok(f.stories.length >= 55, `only ${f.stories.length}`);
  assert.equal(f.stories.length, SEED_STORIES.length, 'none dropped by the normaliser');
  assert.equal(new Set(f.stories.map((s) => s.id)).size, f.stories.length);
  for (const s of f.stories) {
    assert.ok(s.title && s.titleHe, s.id);
    assert.ok(s.text.length >= 80 && s.text.length <= 500, `${s.id}: ${s.text.length}`);
    assert.ok(['story', 'thought'].includes(s.kind));
  }
  assert.equal(f.order, 'shuffle', 'default order never repeats until the pool is used up');
});

test('daily pick is deterministic by date', () => {
  const f = seed();
  for (const iso of ['2026-10-25', '2027-01-01', '2030-06-15']) {
    assert.equal(pickDailyStory(f, iso).id, pickDailyStory(seed(), iso).id, iso);
  }
  assert.equal(pickDailyStory(f, 'nonsense'), null);
  assert.equal(pickDailyStory({ stories: [] }, '2026-10-25'), null);
});

test('shuffle: no repeats until the whole pool has been shown, then a new order', () => {
  const f = seed();
  const n = f.stories.length;
  const start = Math.ceil(dayNumber('2026-10-25') / n) * n; // first day of a cycle
  const cycle1 = Array.from({ length: n }, (_, i) => pickDailyStory(f, isoOf(start + i)).id);
  assert.equal(new Set(cycle1).size, n, 'every story once per cycle');
  const cycle2 = Array.from({ length: n }, (_, i) => pickDailyStory(f, isoOf(start + n + i)).id);
  assert.equal(new Set(cycle2).size, n);
  assert.notDeepEqual(cycle1, cycle2, 'reshuffled for the next cycle');
  for (let c = 0; c < 5; c++) assert.deepEqual([...permutation(n, c)].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
});

test('sequential: list order, wrapping; hidden stories are skipped', () => {
  const f = { ...seed(), order: 'sequential' };
  const d = dayNumber('2026-10-25');
  const a = pickDailyStory(f, isoOf(d)); const b = pickDailyStory(f, isoOf(d + 1));
  const ia = f.stories.indexOf(a);
  assert.equal(f.stories[(ia + 1) % f.stories.length].id, b.id);
  const hidden = { ...f, stories: f.stories.map((s) => (s.id === a.id ? { ...s, enabled: false } : s)) };
  assert.notEqual(pickDailyStory(hidden, isoOf(d)).id, a.id);
});

test('pin wins on its day, waits out of the rotation before it, and is cleared once recorded', () => {
  let f = seed();
  const target = f.stories[7];
  f = pinStory(f, target.id, '2026-11-02');
  assert.equal(pickDailyStory(f, '2026-11-02').id, target.id);
  for (let i = 0; i < 7; i++) assert.notEqual(pickFromRotation(f, addDaysISO('2026-10-25', i)).id, target.id);
  const r = recordShownStory(f, '2026-11-02');
  assert.equal(r.changed, true);
  assert.equal(r.file.history['2026-11-02'].id, target.id);
  assert.equal(r.file.stories.find((s) => s.id === target.id).showOn, undefined, 'pin cleared, rejoins rotation');
  // a recorded day keeps its story even if the list changes later
  const edited = { ...r.file, stories: r.file.stories.filter((s) => s.id !== target.id) };
  assert.equal(pickDailyStory(edited, '2026-11-02').title, target.title);
  assert.equal(recordShownStory(r.file, '2026-11-02').changed, false, 'idempotent');
});

test('upcoming + forKiosk', () => {
  const f = seed();
  const up = upcomingStories(f, '2026-10-25', 14);
  assert.equal(up.length, 14);
  assert.equal(new Set(up.map((u) => u.story.id)).size >= 13, true);
  const k = forKiosk({ ...f, history: { '2026-10-20': {}, '2026-10-21': {}, '2026-10-22': {}, '2026-10-23': {} } });
  assert.deepEqual(Object.keys(k.history), ['2026-10-21', '2026-10-22', '2026-10-23']);
});

test('normalise + paste import', () => {
  assert.ok(normalizeStory({ title: 'x' }).error);
  const ok = normalizeStory({ title: '  A  title ', textHe: 'סיפור', kind: 'weird', showOn: '2026-12-01' }).story;
  assert.equal(ok.title, 'A title'); assert.equal(ok.kind, 'story'); assert.equal(ok.showOn, '2026-12-01');
  const r = parseStoriesText('Here:\n```json\n[{"title":"T","text":"Hello there"},{"title":"bad"}]\n```');
  assert.equal(r.stories.length, 1); assert.equal(r.errors.length, 1);
});

test('registered everywhere: slide type, popup, late builtin, permissions', () => {
  assert.ok(SLIDE_TYPES.some((t) => t.id === 'DAILY_STORY'));
  assert.equal(popupSpec('DAILY_STORY').moreSettings.section, 'daily-story');
  assert.ok(LATE_BUILTINS.some((b) => b.type === 'DAILY_STORY' && b.enabled === false));
  assert.equal(canDo('editor', 'PUT', '/api/daily-stories'), true);
  assert.equal(canDo({ role: 'editor', preset: 'full', overrides: { grant: [], deny: ['dailyWord.edit'] } }, 'PUT', '/api/daily-stories'), false);
  assert.equal(canOpenSection({ role: 'editor', preset: 'full' }, 'daily-story'), true);
});
