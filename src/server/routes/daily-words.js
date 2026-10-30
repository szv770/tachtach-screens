/**
 * /api/daily-words — the Daily Word list (data/daily-words.json).
 *
 * Mounted in app.js on /api AFTER requireAuth + csrfProtection + the mutation
 * limiter. Until the first save the seed list (src/shared/dailyWordsSeed.js) is
 * served, so the page works out of the box. Every write is validated with the
 * shared normaliser and broadcasts SSE `daily-words-update` (the whole file).
 */
import express, { Router } from 'express';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast } from '../sse.js';
import { normalizeDailyWordsFile, normalizeWords, parseWordsText, recordShownWord, changeTodaysWord, syncTodaysWord, forKiosk, LIMITS } from '../../shared/dailyWords.js';
import { randomFrom } from '../../shared/dailyToday.js';
import { SEED_WORDS } from '../../shared/dailyWordsSeed.js';

export const FILE = 'daily-words.json';

/** Current list (saved file, else seed). Used by the router and /api/state. */
export async function readDailyWords() {
  return normalizeDailyWordsFile(await readJSON(FILE), SEED_WORDS);
}

let chain = Promise.resolve();
const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

async function save(file) {
  const clean = normalizeDailyWordsFile(file);
  await writeJSON(FILE, clean);
  broadcast('daily-words-update', forKiosk(clean));
  return clean;
}

/** Local YYYY-MM-DD in the screen's timezone (settings.timezone, else the Pi's). */
export async function todayISO(now = new Date()) {
  let tz;
  try { tz = (await readJSON('settings.json'))?.timezone; } catch { /* default */ }
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

/**
 * Archive today's word: the first time a day is seen, the word that shows is
 * written to history (and a pin for that day is cleared). Safe to call often.
 */
export async function recordTodaysWord() {
  return withLock(async () => {
    const cur = await readDailyWords();
    const { file, changed } = recordShownWord(cur, await todayISO());
    if (changed) await save(file);
    return changed;
  });
}

/** Record at startup and every 10 minutes (covers midnight; unref'd so it never blocks exit). */
export function startDailyWordRecorder() {
  const run = () => recordTodaysWord().catch((err) => console.error('[daily-word] record failed:', err.message));
  setTimeout(run, 3000).unref?.();
  setInterval(run, 10 * 60 * 1000).unref?.();
}

const router = Router();
// 256 kB ≈ 650 typical words (the 45-word starter list is ~17 kB; ~390 bytes/word).
router.use('/daily-words', express.json({ limit: '256kb' }));

router.get('/daily-words', async (_req, res) => {
  try { res.json({ ...(await readDailyWords()), today: await todayISO() }); } catch { res.status(500).json({ error: 'Failed to read the word list.' }); }
});

// Replace the whole list (admin edits, reorder, delete).
router.put('/daily-words', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.words)) return res.status(400).json({ error: 'words must be a list.' });
    const { words, errors } = normalizeWords(body.words);
    if (errors.length) return res.status(400).json({ error: `Word ${errors[0].index + 1}: ${errors[0].error}`, errors });
    const today = await todayISO();
    res.json({ ...(await withLock(async () => save(recordShownWord(syncTodaysWord({ order: body.order, words, history: (await readDailyWords()).history }, today), today).file))), today });
  } catch { res.status(500).json({ error: 'Failed to save the word list.' }); }
});

// Paste import: { text, mode: 'append' | 'replace', dryRun? }. Returns what was added/skipped.
router.post('/daily-words/import', async (req, res) => {
  try {
    const { text, mode = 'append', dryRun = false } = req.body || {};
    const parsed = parseWordsText(text);
    if (!parsed.words.length) return res.status(400).json({ error: parsed.errors[0]?.error || 'No valid words found.', errors: parsed.errors });
    const out = await withLock(async () => {
      const cur = await readDailyWords();
      const have = new Set(cur.words.map((w) => (w.word || w.transliteration).toLowerCase()));
      const fresh = mode === 'replace' ? parsed.words : parsed.words.filter((w) => !have.has((w.word || w.transliteration).toLowerCase()));
      const skipped = parsed.words.length - fresh.length;
      const words = (mode === 'replace' ? fresh : [...cur.words, ...fresh]).slice(0, LIMITS.words);
      const result = { added: fresh.length, skipped, invalid: parsed.errors, total: words.length };
      if (dryRun) return { ...result, dryRun: true };
      return { ...result, file: await save({ order: cur.order, words, history: cur.history }) };
    });
    res.json(out);
  } catch { res.status(500).json({ error: 'Import failed.' }); }
});

// Change what shows TODAY: { op: 'pick' | 'random' | 'oneoff' | 'hide' | 'automatic', id?, entry? } (rules: src/shared/dailyToday.js).
// Edits today's archive entry on purpose (the archive records what actually showed) and broadcasts, so the TV updates at once.
router.post('/daily-words/today', async (req, res) => {
  try {
    const { op, id, entry } = req.body || {};
    if (!['pick', 'random', 'oneoff', 'hide', 'automatic'].includes(op)) return res.status(400).json({ error: 'Unknown action.' });
    const today = await todayISO();
    let settings = null;
    try { settings = await readJSON('settings.json'); } catch { /* default */ }
    const out = await withLock(async () => {
      const cur = await readDailyWords();
      const r = changeTodaysWord(cur, today, op, { id: typeof id === 'string' ? id : undefined, entry, randomFrom: randomFrom(settings) });
      if (r.error) return { error: r.error };
      return { file: await save(r.file), pickedId: r.pickedId ?? null };
    });
    if (out.error) return res.status(400).json({ error: out.error });
    res.json({ ...out.file, today, pickedId: out.pickedId });
  } catch { res.status(500).json({ error: 'Could not change today.' }); }
});

export default router;
