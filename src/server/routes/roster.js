/**
 * /api/roster — the roster of bochurim (data/roster.json) and the birthday settings beside it.
 *
 * Mounted in app.js on /api AFTER requireAuth + csrfProtection + the mutation limiter. One list that every
 * feature pulls from (the birthday slide today, the chazan chart next). Every write is validated with the
 * shared normaliser and broadcasts SSE `roster-update` (the kiosk view: people + settings).
 */
import express, { Router } from 'express';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast } from '../sse.js';
import {
  normalizeRosterFile, normalizePeople, normalizeSettings, parseRosterRows, parseDelimited, samePerson, forKiosk, LIMITS,
} from '../../shared/roster.js';

export const FILE = 'roster.json';

/** Current roster (saved file, else empty). Used by the router, /api/state and the preview state. */
export async function readRoster() {
  return normalizeRosterFile(await readJSON(FILE));
}

let chain = Promise.resolve();
const withLock = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

async function save(file) {
  const clean = normalizeRosterFile(file);
  await writeJSON(FILE, clean);
  broadcast('roster-update', forKiosk(clean));
  return clean;
}

const router = Router();
// 1000 people is ~150 kB of JSON; the app-wide 16 kB limit is lifted for /api/roster in app.js.
router.use('/roster', express.json({ limit: '256kb' }));

router.get('/roster', async (_req, res) => {
  try { res.json(await readRoster()); } catch { res.status(500).json({ error: 'Failed to read the list.' }); }
});

// Replace the whole list (add / edit / delete / import, all done in the admin).
router.put('/roster', async (req, res) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.people)) return res.status(400).json({ error: 'people must be a list.' });
    if (body.people.length > LIMITS.people) return res.status(400).json({ error: `The list can hold ${LIMITS.people} people.` });
    const { people, errors } = normalizePeople(body.people);
    if (errors.length) return res.status(400).json({ error: `Person ${errors[0].index + 1}: ${errors[0].error}`, errors });
    res.json(await withLock(async () => save({ people, birthdays: (await readRoster()).birthdays })));
  } catch { res.status(500).json({ error: 'Failed to save the list.' }); }
});

// Birthday settings only: { fridayIsWeekend, lookAhead, names, rail }.
router.put('/roster/settings', async (req, res) => {
  try {
    const birthdays = normalizeSettings(req.body || {});
    res.json(await withLock(async () => save({ people: (await readRoster()).people, birthdays })));
  } catch { res.status(500).json({ error: 'Failed to save the settings.' }); }
});

// Import: { rows } (cells from a spreadsheet, read in the browser) or { text } (CSV / pasted), mode 'append' | 'replace', dryRun?
// Answers what was added, what was already there and which lines could not be read.
router.post('/roster/import', async (req, res) => {
  try {
    const { rows, text, mode = 'append', dryRun = false } = req.body || {};
    const cells = Array.isArray(rows) ? rows : parseDelimited(text);
    const parsed = parseRosterRows(cells);
    if (!parsed.people.length) return res.status(400).json({ error: parsed.skipped[0]?.why || 'No names with birthdays found.', skipped: parsed.skipped });
    const out = await withLock(async () => {
      const cur = await readRoster();
      const base = mode === 'replace' ? [] : cur.people;
      const fresh = [];
      for (const p of parsed.people) if (![...base, ...fresh].some((q) => samePerson(p, q))) fresh.push(p);
      const people = [...base, ...fresh].slice(0, LIMITS.people);
      const result = {
        added: Math.min(fresh.length, Math.max(0, LIMITS.people - base.length)),
        already: parsed.people.length - fresh.length,
        fromEnglish: parsed.people.filter((p) => p.from === 'english').length,
        skipped: parsed.skipped.slice(0, 50),
        total: people.length,
      };
      if (dryRun) return { ...result, dryRun: true };
      return { ...result, file: await save({ people, birthdays: cur.birthdays }) };
    });
    res.json(out);
  } catch { res.status(500).json({ error: 'Import failed.' }); }
});

export default router;
