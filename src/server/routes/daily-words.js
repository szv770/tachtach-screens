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
import { normalizeDailyWordsFile, normalizeWords, parseWordsText, LIMITS } from '../../shared/dailyWords.js';
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
  broadcast('daily-words-update', clean);
  return clean;
}

const router = Router();
router.use('/daily-words', express.json({ limit: '512kb' }));

router.get('/daily-words', async (_req, res) => {
  try { res.json(await readDailyWords()); } catch { res.status(500).json({ error: 'Failed to read the word list.' }); }
});

// Replace the whole list (admin edits, reorder, delete).
router.put('/daily-words', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.words)) return res.status(400).json({ error: 'words must be a list.' });
    const { words, errors } = normalizeWords(body.words);
    if (errors.length) return res.status(400).json({ error: `Word ${errors[0].index + 1}: ${errors[0].error}`, errors });
    res.json(await withLock(() => save({ order: body.order, words })));
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
      return { ...result, file: await save({ order: cur.order, words }) };
    });
    res.json(out);
  } catch { res.status(500).json({ error: 'Import failed.' }); }
});

export default router;
