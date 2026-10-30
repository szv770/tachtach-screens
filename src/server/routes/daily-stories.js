/**
 * /api/daily-stories — the Daily Story list (data/daily-stories.json). Same shape and rules as
 * routes/daily-words.js: mounted on /api AFTER requireAuth + csrfProtection + the mutation limiter, gated by
 * the `dailyWord.edit` capability (permissions.js), seed list served until the first save, every write
 * validated with the shared normaliser and broadcast as SSE `daily-stories-update`.
 */
import express, { Router } from 'express';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast } from '../sse.js';
import { normalizeDailyStoriesFile, normalizeStories, parseStoriesText, recordShownStory, changeTodaysStory, syncTodaysStory, forKiosk, LIMITS } from '../../shared/dailyStories.js';
import { randomFrom } from '../../shared/dailyToday.js';
import { SEED_STORIES, RETIRED_SEED_IDS } from '../../shared/dailyStoriesSeed.js';
import { todayISO } from './daily-words.js';

export const FILE = 'daily-stories.json';

export async function readDailyStories() {
  const saved = await readJSON(FILE);
  if (saved && Array.isArray(saved.stories)) saved.stories = saved.stories.filter((s) => !RETIRED_SEED_IDS.includes(s?.id));
  return normalizeDailyStoriesFile(saved, SEED_STORIES);
}

let chain = Promise.resolve();
const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

async function save(file) {
  const clean = normalizeDailyStoriesFile(file);
  await writeJSON(FILE, clean);
  broadcast('daily-stories-update', forKiosk(clean));
  return clean;
}

/** Archive today's story the first time the day is seen (and clear a pin for that day). */
export async function recordTodaysStory() {
  return withLock(async () => {
    const cur = await readDailyStories();
    const { file, changed } = recordShownStory(cur, await todayISO());
    if (changed) await save(file);
    return changed;
  });
}

export function startDailyStoryRecorder() {
  const run = () => recordTodaysStory().catch((err) => console.error('[daily-story] record failed:', err.message));
  setTimeout(run, 3500).unref?.();
  setInterval(run, 10 * 60 * 1000).unref?.();
}

const router = Router();
// ~60 starter stories are ~25 kB; 512 kB leaves room for the 500-entry cap with Hebrew.
router.use('/daily-stories', express.json({ limit: '512kb' }));

router.get('/daily-stories', async (_req, res) => {
  try { res.json({ ...(await readDailyStories()), today: await todayISO() }); } catch { res.status(500).json({ error: 'Failed to read the story list.' }); }
});

router.put('/daily-stories', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.stories)) return res.status(400).json({ error: 'stories must be a list.' });
    const { stories, errors } = normalizeStories(body.stories);
    if (errors.length) return res.status(400).json({ error: `Story ${errors[0].index + 1}: ${errors[0].error}`, errors });
    const today = await todayISO();
    res.json({ ...(await withLock(async () => save(recordShownStory(syncTodaysStory({ order: body.order, stories, history: (await readDailyStories()).history }, today), today).file))), today });
  } catch { res.status(500).json({ error: 'Failed to save the story list.' }); }
});

// Paste import: { text, mode: 'append' | 'replace', dryRun? }.
router.post('/daily-stories/import', async (req, res) => {
  try {
    const { text, mode = 'append', dryRun = false } = req.body || {};
    const parsed = parseStoriesText(text);
    if (!parsed.stories.length) return res.status(400).json({ error: parsed.errors[0]?.error || 'No valid stories found.', errors: parsed.errors });
    const out = await withLock(async () => {
      const cur = await readDailyStories();
      const keyOf = (s) => (s.title || s.text.slice(0, 40)).toLowerCase();
      const have = new Set(cur.stories.map(keyOf));
      const fresh = mode === 'replace' ? parsed.stories : parsed.stories.filter((s) => !have.has(keyOf(s)));
      const skipped = parsed.stories.length - fresh.length;
      const stories = (mode === 'replace' ? fresh : [...cur.stories, ...fresh]).slice(0, LIMITS.stories);
      const result = { added: fresh.length, skipped, invalid: parsed.errors, total: stories.length };
      if (dryRun) return { ...result, dryRun: true };
      return { ...result, file: await save({ order: cur.order, stories, history: cur.history }) };
    });
    res.json(out);
  } catch { res.status(500).json({ error: 'Import failed.' }); }
});

// Change what shows TODAY: { op: 'pick' | 'random' | 'oneoff' | 'hide' | 'automatic', id?, entry? } (rules: src/shared/dailyToday.js).
// Edits today's archive entry on purpose (the archive records what actually showed) and broadcasts, so the TV updates at once.
router.post('/daily-stories/today', async (req, res) => {
  try {
    const { op, id, entry } = req.body || {};
    if (!['pick', 'random', 'oneoff', 'hide', 'automatic'].includes(op)) return res.status(400).json({ error: 'Unknown action.' });
    const today = await todayISO();
    let settings = null;
    try { settings = await readJSON('settings.json'); } catch { /* default */ }
    const out = await withLock(async () => {
      const cur = await readDailyStories();
      const r = changeTodaysStory(cur, today, op, { id: typeof id === 'string' ? id : undefined, entry, randomFrom: randomFrom(settings) });
      if (r.error) return { error: r.error };
      return { file: await save(r.file), pickedId: r.pickedId ?? null };
    });
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ ...out.file, today, pickedId: out.pickedId });
  } catch { res.status(500).json({ error: 'Could not change today.' }); }
});

export default router;
