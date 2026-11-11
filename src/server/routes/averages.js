/**
 * /api/averages: the Test Averages slide's data. Mounted on /api AFTER requireAuth + csrfProtection + the mutation limiter,
 * gated by the `averages.edit` capability (src/shared/permissions.js). Student names + marks (privacy class names).
 * Every write runs under the store lock and ends in an SSE `averages-update`, so the TV follows at once.
 */
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { averagesStore } from '../averagesStore.js';
import { readRoster } from './roster.js';
import { fetchSheetCsv } from '../../fetchers/scoreSheet.js';
import * as A from '../../shared/averages.js';

const router = Router();
router.use('/averages', express.json({ limit: '384kb' }));

const limit = (windowMs, max, name) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${name}:${req.user?.id || req.ip}`,
  message: { error: 'Too many tries. Please wait a little.' }, validate: false,
});
const importReal = rateLimit({ windowMs: 3600e3, max: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: (req) => `avg-import:${req.user?.id || req.ip}`, skip: (req) => req.body?.dryRun === true, message: { error: 'Too many imports. Please wait a little.' }, validate: false });
const syncLimit = limit(10 * 60e3, 12, 'avg-sync');

const fail = (res, e) => {
  if (e instanceof A.AveragesError) return res.status(400).json({ error: e.message });
  return res.status(500).json({ error: 'The averages could not be saved.' });
};
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
/** Names on the Bochurim list (the roster). Names class: only ever sent to someone who can edit the averages. */
const names = async () => { try { return A.rosterNames((await readRoster()).people); } catch { return []; } };
const view = async (file) => {
  const have = new Set(file.students.map((s) => A.nameKey(s.name)));
  const roster = await names();
  return { ...file, tracks: A.tracksOf(file), rows: A.board(file).length, rosterCount: roster.length, rosterNew: roster.filter((n) => !have.has(A.nameKey(n))).length };
};
const send = async (res, saved) => res.json(await view(saved));

router.get('/averages', async (_req, res) => {
  try { await send(res, await averagesStore.read()); } catch { res.status(500).json({ error: 'Could not read the averages.' }); }
});

router.put('/averages/settings', async (req, res) => {
  try { await send(res, await averagesStore.mutate(undefined, (f) => A.setSettings(f, body(req).settings))); } catch (e) { fail(res, e); }
});

router.post('/averages/students', async (req, res) => {
  try { const b = body(req); await send(res, await averagesStore.mutate(undefined, (f) => A.upsertStudent(f, '', b))); } catch (e) { fail(res, e); }
});
router.put('/averages/students/:id', async (req, res) => {
  try { const b = body(req); await send(res, await averagesStore.mutate(undefined, (f) => A.upsertStudent(f, req.params.id, b))); } catch (e) { fail(res, e); }
});
router.delete('/averages/students/:id', async (req, res) => {
  try { await send(res, await averagesStore.mutate(undefined, (f) => A.removeStudent(f, req.params.id))); } catch (e) { fail(res, e); }
});
router.post('/averages/clear', async (req, res) => {
  try {
    if (body(req).confirm !== true) throw new A.AveragesError('Confirm that you want to remove everyone.');
    await send(res, await averagesStore.mutate(undefined, (f) => A.clearAll(f)));
  } catch (e) { fail(res, e); }
});

// The Bochurim list (roster) as names, for a starter sheet: { names: ['First Last', ...] }
router.get('/averages/roster-names', async (_req, res) => {
  try { res.json({ names: await names() }); } catch { res.status(500).json({ error: 'Could not read the Bochurim list.' }); }
});
// Add everyone from the Bochurim list who is not on the list yet (no scores: they show once they have one)
router.post('/averages/from-roster', async (_req, res) => {
  try {
    const list = await names();
    if (!list.length) throw new A.AveragesError('The Bochurim list is empty. Add names under Screen > Bochurim first.');
    let added = 0;
    const saved = await averagesStore.mutate(undefined, (f) => { const r = A.addNames(f, list); added = r.added; return r.file; });
    res.json({ added, ...(await view(saved)) });
  } catch (e) { fail(res, e); }
});

// Paste / CSV import: { text, mode?: 'replace'|'add', dryRun?: boolean }. The server parses again on apply.
router.post('/averages/import', importReal, async (req, res) => {
  try {
    const b = body(req);
    const parsed = A.parseInput(typeof b.text === 'string' ? b.text : '');
    const unknown = A.notOnList(parsed.rows, await names());
    if (unknown.length) parsed.warnings.push({ line: 0, message: `Not on the Bochurim list (check the spelling): ${unknown.slice(0, 6).join(', ')}${unknown.length > 6 ? ` and ${unknown.length - 6} more` : ''}.` });
    const summary = { errors: parsed.errors, warnings: parsed.warnings.slice(0, 50), counts: parsed.counts, preview: parsed.rows.slice(0, 8).map((r) => ({ name: r.name, grade: r.grade, track: r.track, scores: r.scores })) };
    if (b.dryRun === true) return res.json({ ...summary, dryRun: true });
    if (parsed.errors.length) return res.status(400).json({ ...summary, error: `${parsed.errors[0].line ? `Row ${parsed.errors[0].line}: ` : ''}${parsed.errors[0].message}` });
    const mode = b.mode === 'add' ? 'add' : 'replace';
    const saved = await averagesStore.mutate(undefined, (f) => A.applyImport(f, parsed, { mode }));
    res.json({ ...summary, ...(await view(saved)) });
  } catch (e) { fail(res, e); }
});

// The linked Google Sheet: { url, auto }. Saving the link does not fetch; 'Sync now' does.
router.put('/averages/sheet', async (req, res) => {
  try {
    const b = body(req);
    const url = String(b.url ?? '').trim();
    if (url && !A.sheetCsvUrl(url)) throw new A.AveragesError('That is not a Google Sheets link. Copy the link from the sheet\'s Share button.');
    await send(res, await averagesStore.mutate(undefined, (f) => ({ ...f, sheet: { ...f.sheet, url, auto: typeof b.auto === 'boolean' ? b.auto : f.sheet.auto, lastError: '' } })));
  } catch (e) { fail(res, e); }
});
router.post('/averages/sync', syncLimit, async (_req, res) => {
  try { await send(res, await syncSheet()); } catch (e) { fail(res, e); }
});

/** Pull the linked sheet and replace the list with it. Records the result on the sheet block either way. Shared with the timer. */
export async function syncSheet(store = averagesStore, fetchCsv = fetchSheetCsv) {
  const cur = await store.read();
  if (!cur.sheet.url) throw new A.AveragesError('Paste a Google Sheets link first.');
  const stamp = new Date().toISOString();
  let parsed;
  try {
    parsed = A.parseInput(await fetchCsv(cur.sheet.url));
    if (parsed.errors.length) throw new A.AveragesError(`${parsed.errors[0].line ? `Row ${parsed.errors[0].line}: ` : ''}${parsed.errors[0].message}`);
  } catch (e) {
    await store.mutate(undefined, (f) => ({ ...f, sheet: { ...f.sheet, lastError: String(e.message || 'Sync failed').slice(0, 200) } }));
    throw e instanceof A.AveragesError ? e : new A.AveragesError(String(e.message || 'Sync failed'));
  }
  const unknown = A.notOnList(parsed.rows, await names());
  return store.mutate(undefined, (f) => {
    const next = A.applyImport(f, parsed, { mode: 'replace' });
    return { ...next, sheet: { ...next.sheet, lastSync: stamp, lastCount: parsed.counts.students, lastError: '', unmatched: unknown.slice(0, 10), unmatchedCount: unknown.length } };
  });
}

/** Every 15 minutes: pull the sheet if one is linked and 'keep it in sync' is on. Never throws. */
export function startAveragesSync({ store = averagesStore, fetchCsv = fetchSheetCsv, everyMs = 15 * 60e3 } = {}) {
  const tick = async () => {
    try {
      const f = await store.read();
      if (!f.sheet.url || !f.sheet.auto) return;
      await syncSheet(store, fetchCsv);
    } catch (e) { console.warn('[averages] sheet sync:', e.message); }
  };
  const t = setInterval(tick, everyMs);
  t.unref?.();
  setTimeout(tick, 20000).unref?.();
  return () => clearInterval(t);
}

export default router;
