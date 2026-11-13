/**
 * /api/daily-letters — the Daily Letter list (data/daily-letters.json): the same shape and rules as the Daily Story
 * list (routes/daily-stories.js, one pool of its own, every entry a letter), so pins, 'change today', the archive and
 * undo behave the same. Mounted like routes/daily-words.js: mounted on /api AFTER requireAuth + csrfProtection + the mutation limiter, gated by
 * the `dailyWord.edit` capability (permissions.js), seed list served until the first save, every write
 * validated with the shared normaliser and broadcast as SSE `daily-letters-update`.
 */
import express, { Router } from 'express';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast } from '../sse.js';
import { normalizeDailyStoriesFile, normalizeStories, parseStoriesText, recordShownStory, changeTodaysStory, syncTodaysStory, lettersForKiosk, LETTER_FILE_MAX_BYTES, LETTER_ADAPTER, LIMITS } from '../../shared/dailyStories.js';
import { FILE as STORIES_FILE } from './daily-stories.js';
import { randomFrom } from '../../shared/dailyToday.js';
import { todayISO } from './daily-words.js';

export const FILE = 'daily-letters.json';

export async function readDailyLetters() {
  return normalizeDailyStoriesFile(await readJSON(FILE), [], 'letter');
}

let chain = Promise.resolve();
const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

class TooBig extends Error {}
async function save(file) {
  const clean = normalizeDailyStoriesFile(file, [], 'letter');
  const size = JSON.stringify(clean).length;
  if (size > LETTER_FILE_MAX_BYTES) throw new TooBig(`The letter list is too big (${Math.round(size / 1000)} kB; the most is ${Math.round(LETTER_FILE_MAX_BYTES / 1000)} kB). Delete some letters you have already shown, then try again.`);
  await writeJSON(FILE, clean);
  broadcast('daily-letters-update', lettersForKiosk(clean));
  return clean;
}

/** Archive today's letter the first time the day is seen (and clear a pin for that day). */
export async function recordTodaysLetter() {
  return withLock(async () => {
    const cur = await readDailyLetters();
    const { file, changed } = recordShownStory(cur, await todayISO());
    if (changed) await save(file);
    return changed;
  });
}

/**
 * One-time move: letters that were saved INTO the Daily Story list (the first version of this feature) go to the
 * Daily Letter list, and the story list is saved without them. Safe to run on every start (a no-op once moved).
 */
export async function moveLettersOutOfStories() {
  return withLock(async () => {
    const raw = await readJSON(STORIES_FILE);
    const mine = (Array.isArray(raw?.stories) ? raw.stories : []).filter((x) => x?.kind === 'letter');
    if (!mine.length) return 0;
    const cur = await readDailyLetters();
    const have = new Set(cur.stories.map((x) => x.id));
    const { stories } = normalizeStories([...cur.stories, ...mine.filter((x) => !have.has(x.id))], 'letter');
    await save({ order: cur.order, stories, history: cur.history });
    await writeJSON(STORIES_FILE, { ...raw, stories: raw.stories.filter((x) => x?.kind !== 'letter') });
    return mine.length;
  });
}

export function startDailyLetterRecorder() {
  moveLettersOutOfStories().catch((err) => console.error('[daily-letter] move failed:', err.message));
  const run = () => recordTodaysLetter().catch((err) => console.error('[daily-letter] record failed:', err.message));
  setTimeout(run, 4500).unref?.();
  setInterval(run, 10 * 60 * 1000).unref?.();
}

const router = Router();
// a letter can be 30,000 characters: 1 MB leaves room for a dozen long ones with Hebrew.
router.use('/daily-letters', express.json({ limit: '1mb' }));

router.get('/daily-letters', async (_req, res) => {
  try { res.json({ ...(await readDailyLetters()), today: await todayISO() }); } catch { res.status(500).json({ error: 'Failed to read the letter list.' }); }
});

router.put('/daily-letters', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.stories)) return res.status(400).json({ error: 'stories must be a list.' });
    const { stories, errors } = normalizeStories(body.stories, 'letter');
    if (errors.length) return res.status(400).json({ error: `Letter ${errors[0].index + 1}: ${errors[0].error}`, errors });
    const today = await todayISO();
    res.json({ ...(await withLock(async () => save(recordShownStory(syncTodaysStory({ order: body.order, stories, history: (await readDailyLetters()).history }, today), today).file))), today });
  } catch (e) { if (e instanceof TooBig) return res.status(400).json({ error: e.message }); res.status(500).json({ error: 'Failed to save the letter list.' }); }
});

// Paste import: { text, mode: 'append' | 'replace', dryRun? }.
router.post('/daily-letters/import', async (req, res) => {
  try {
    const { text, mode = 'append', dryRun = false } = req.body || {};
    const parsed = parseStoriesText(text, 'letter');
    if (!parsed.stories.length) return res.status(400).json({ error: parsed.errors[0]?.error || 'No valid letters found.', errors: parsed.errors });
    const out = await withLock(async () => {
      const cur = await readDailyLetters();
      const keyOf = (s) => `${s.title}|${s.text.slice(0, 60)}`.toLowerCase();
      const have = new Set(cur.stories.map(keyOf));
      const fresh = mode === 'replace' ? parsed.stories : parsed.stories.filter((s) => !have.has(keyOf(s)));
      const skipped = parsed.stories.length - fresh.length;
      const stories = (mode === 'replace' ? fresh : [...cur.stories, ...fresh]).slice(0, LIMITS.letters);
      const result = { added: fresh.length, skipped, invalid: parsed.errors, total: stories.length };
      if (dryRun) return { ...result, dryRun: true };
      return { ...result, file: await save({ order: cur.order, stories, history: cur.history }) };
    });
    res.json(out);
  } catch (e) { if (e instanceof TooBig) return res.status(400).json({ error: e.message }); res.status(500).json({ error: 'Import failed.' }); }
});

// Change what shows TODAY: { op: 'pick' | 'random' | 'oneoff' | 'hide' | 'automatic', id?, entry? } (rules: src/shared/dailyToday.js).
// Edits today's archive entry on purpose (the archive records what actually showed) and broadcasts, so the TV updates at once.
router.post('/daily-letters/today', async (req, res) => {
  try {
    const { op, id, entry } = req.body || {};
    if (!['pick', 'random', 'oneoff', 'hide', 'automatic'].includes(op)) return res.status(400).json({ error: 'Unknown action.' });
    const today = await todayISO();
    let settings = null;
    try { settings = await readJSON('settings.json'); } catch { /* default */ }
    const out = await withLock(async () => {
      const cur = await readDailyLetters();
      const r = changeTodaysStory(cur, today, op, { id: typeof id === 'string' ? id : undefined, entry, randomFrom: randomFrom(settings), adapter: LETTER_ADAPTER });
      if (r.error) return { error: r.error };
      return { file: await save(r.file), pickedId: r.pickedId ?? null };
    });
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ ...out.file, today, pickedId: out.pickedId });
  } catch (e) { if (e instanceof TooBig) return res.status(400).json({ error: e.message }); res.status(500).json({ error: 'Could not change today.' }); }
});

export default router;
