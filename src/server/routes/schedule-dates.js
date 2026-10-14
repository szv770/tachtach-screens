/**
 * Schedule by date — /api/schedule/dates*, /api/schedule/blocks*, /api/schedule/zmanim.
 *
 * Mounted in app.js at /api/schedule AFTER requireAuth + csrfProtection +
 * the mutation rate limiter (same gate as every other /api route), and
 * BEFORE the global 16 kB JSON parser would see these paths: a pasted
 * multi-week schedule can exceed 16 kB, so this router parses its own bodies
 * with a 256 kB limit.
 *
 * Every write re-parses/validates on the server and is all-or-nothing, then
 * broadcasts `schedule-dates-update` (whole map) and re-inits countdowns so
 * alerts follow the per-date schedule immediately.
 */
import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast } from '../sse.js';
import { initCountdowns } from '../countdown.js';
import {
  parseScheduleText, parseScheduleJSON, normalizeEntryInput, storableEntry,
} from '../../shared/schedulePaste.js';
import {
  isISODate, toISODate, hasDateOverride, weeklyEntriesFor, sortEntriesByTime, addDaysISO,
} from '../../shared/scheduleResolution.js';
import {
  withScheduleLock, readScheduleDates, writeScheduleDates, readBlocksFile, writeBlocksFile,
  addCategories, withIds, getZmanimForDates,
} from '../scheduleStore.js';

export const SCHEDULE_DATES_BODY_LIMIT = '256kb';

const router = Router();
router.use(['/dates', '/blocks'], express.json({ limit: SCHEDULE_DATES_BODY_LIMIT }));

const MAX_DATES_PER_APPLY = 120;
const MAX_ENTRIES_PER_DAY = 200;
const MAX_BLOCKS = 100;

async function readSchedule() {
  return (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
}

function afterDatesChange(dates) {
  broadcast('schedule-dates-update', dates);
  initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
}

/** Parse a { text } or { dates } body. */
function parseBody(body, categories) {
  const today = toISODate(new Date());
  if (typeof body?.text === 'string') return parseScheduleText(body.text, { categories, today });
  if (body?.dates && typeof body.dates === 'object') return parseScheduleJSON(JSON.stringify(body.dates), { categories, today });
  return null;
}

/** Extra checks the parser can't know about (sizes). */
function sizeErrors(parsed) {
  const errors = [];
  if (parsed.days.length > MAX_DATES_PER_APPLY) {
    errors.push({ line: null, message: `Too many dates at once (${parsed.days.length}); the limit is ${MAX_DATES_PER_APPLY}.` });
  }
  for (const d of parsed.days) {
    if (d.entries.length > MAX_ENTRIES_PER_DAY) {
      errors.push({ line: d.line, date: d.date, message: `${d.date} has ${d.entries.length} items; the limit is ${MAX_ENTRIES_PER_DAY}.` });
    }
  }
  return errors;
}

/** Validate a list of day-editor/block entries. */
function normalizeEntries(list, categories) {
  const ctx = { categories, newCats: new Map() };
  const errors = [];
  const warnings = [];
  const entries = [];
  if (!Array.isArray(list)) return { errors: [{ message: '"entries" must be a list.' }], warnings, entries, newCategories: [] };
  if (list.length > MAX_ENTRIES_PER_DAY) return { errors: [{ message: `Too many items (limit ${MAX_ENTRIES_PER_DAY}).` }], warnings, entries, newCategories: [] };
  list.forEach((e, i) => {
    const r = normalizeEntryInput(e, ctx);
    r.errors.forEach((message) => errors.push({ index: i, message: `Row ${i + 1}: ${message}` }));
    r.warnings.forEach((message) => warnings.push({ index: i, message: `Row ${i + 1}: ${message}` }));
    if (r.entry) entries.push(storableEntry(r.entry));
  });
  return { errors, warnings, entries: sortEntriesByTime(entries), newCategories: [...ctx.newCats.values()] };
}

const cleanLabel = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');

// ── Dates ──────────────────────────────────────────────────────────────────

router.get('/dates', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dates = await readScheduleDates();
    const out = {};
    for (const [k, v] of Object.entries(dates)) {
      if (isISODate(from) && k < from) continue;
      if (isISODate(to) && k > to) continue;
      out[k] = v;
    }
    res.json(out);
  } catch (err) {
    console.error('[api] GET /schedule/dates error:', err.message);
    res.status(500).json({ error: 'Failed to read date schedules.' });
  }
});

// Dry run: parse + validate + describe what Apply would change. Writes nothing.
router.post('/dates/preview', async (req, res) => {
  try {
    const [schedule, dates] = await Promise.all([readSchedule(), readScheduleDates()]);
    const parsed = parseBody(req.body, schedule.categories || []);
    if (!parsed) return res.status(400).json({ error: 'Send { text } or { dates }.' });
    const errors = [...parsed.errors, ...sizeErrors(parsed)];
    res.json({
      ...parsed,
      errors,
      canApply: errors.length === 0 && parsed.days.length > 0,
      today: toISODate(new Date()),
      days: parsed.days.map((d) => ({
        ...d,
        existingCount: hasDateOverride(dates, d.date) ? (dates[d.date].entries || []).length : null,
        weeklyCount: weeklyEntriesFor(schedule, d.date).length,
      })),
    });
  } catch (err) {
    console.error('[api] POST /schedule/dates/preview error:', err.message);
    res.status(500).json({ error: 'Failed to preview the schedule.' });
  }
});

// Apply pasted text / JSON — all-or-nothing.
router.put('/dates', async (req, res) => {
  try {
    const result = await withScheduleLock(async () => {
      const [schedule, dates] = await Promise.all([readSchedule(), readScheduleDates()]);
      const parsed = parseBody(req.body, schedule.categories || []);
      if (!parsed) return { status: 400, body: { error: 'Send { text } or { dates }.' } };
      const errors = [...parsed.errors, ...sizeErrors(parsed)];
      if (errors.length || !parsed.days.length) {
        return { status: 400, body: { error: `Nothing was saved — fix ${errors.length || 'the'} error${errors.length === 1 ? '' : 's'} first.`, errors } };
      }
      const createdCategories = addCategories(schedule, parsed.newCategories);
      const applied = [];
      for (const d of parsed.days) {
        if (d.clear) {
          delete dates[d.date];
          applied.push({ date: d.date, cleared: true });
        } else {
          dates[d.date] = {
            label: cleanLabel(d.label),
            entries: withIds(d.entries.map(storableEntry)),
            updatedAt: new Date().toISOString(),
          };
          applied.push({ date: d.date, count: d.entries.length });
        }
      }
      if (createdCategories.length) {
        await writeJSON('schedule.json', schedule);
        broadcast('schedule-update', schedule);
      }
      const saved = await writeScheduleDates(dates);
      afterDatesChange(saved);
      return { status: 200, body: { applied, createdCategories, scheduleDates: saved, categories: schedule.categories, warnings: parsed.warnings } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] PUT /schedule/dates error:', err.message);
    res.status(500).json({ error: 'Failed to save the schedule. Nothing was changed.' });
  }
});

// Save one date from the day editor: { entries, label }.
router.put('/dates/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!isISODate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
    const result = await withScheduleLock(async () => {
      const [schedule, dates] = await Promise.all([readSchedule(), readScheduleDates()]);
      const n = normalizeEntries(req.body?.entries, schedule.categories || []);
      if (n.errors.length) return { status: 400, body: { error: n.errors[0].message, errors: n.errors } };
      const createdCategories = addCategories(schedule, n.newCategories);
      if (createdCategories.length) {
        await writeJSON('schedule.json', schedule);
        broadcast('schedule-update', schedule);
      }
      dates[date] = { label: cleanLabel(req.body?.label), entries: withIds(n.entries), updatedAt: new Date().toISOString() };
      const saved = await writeScheduleDates(dates);
      afterDatesChange(saved);
      return { status: 200, body: { date, day: saved[date] ?? dates[date], scheduleDates: saved, createdCategories, warnings: n.warnings } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] PUT /schedule/dates/:date error:', err.message);
    res.status(500).json({ error: 'Failed to save this date.' });
  }
});

// Revert a date to the weekly schedule.
router.delete('/dates/:date', async (req, res) => {
  try {
    const { date } = req.params;
    if (!isISODate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
    const saved = await withScheduleLock(async () => {
      const dates = await readScheduleDates();
      delete dates[date];
      return writeScheduleDates(dates);
    });
    afterDatesChange(saved);
    res.json({ success: true, scheduleDates: saved });
  } catch (err) {
    console.error('[api] DELETE /schedule/dates/:date error:', err.message);
    res.status(500).json({ error: 'Failed to revert this date.' });
  }
});

// Apply a saved block to a date (replaces that date's schedule).
router.post('/dates/:date/apply-block', async (req, res) => {
  try {
    const { date } = req.params;
    if (!isISODate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
    const result = await withScheduleLock(async () => {
      const [{ blocks }, dates] = await Promise.all([readBlocksFile(), readScheduleDates()]);
      const block = blocks.find((b) => b.id === req.body?.blockId);
      if (!block) return { status: 404, body: { error: 'Saved block not found.' } };
      dates[date] = {
        label: cleanLabel(block.label),
        entries: withIds((block.entries || []).map(({ id, ...e }) => e)), // eslint-disable-line no-unused-vars
        updatedAt: new Date().toISOString(),
        fromBlock: block.id,
      };
      const saved = await writeScheduleDates(dates);
      afterDatesChange(saved);
      return { status: 200, body: { date, day: saved[date] ?? dates[date], scheduleDates: saved } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] POST /schedule/dates/:date/apply-block error:', err.message);
    res.status(500).json({ error: 'Failed to apply the block.' });
  }
});

// ── Blocks (reusable named day schedules, no date) ─────────────────────────

router.get('/blocks', async (_req, res) => {
  try {
    const { blocks } = await readBlocksFile();
    res.json(blocks);
  } catch (err) {
    console.error('[api] GET /schedule/blocks error:', err.message);
    res.status(500).json({ error: 'Failed to read saved blocks.' });
  }
});

router.post('/blocks', async (req, res) => {
  try {
    const name = cleanLabel(req.body?.name);
    if (!name) return res.status(400).json({ error: 'Give the block a name.' });
    const result = await withScheduleLock(async () => {
      const [schedule, file] = await Promise.all([readSchedule(), readBlocksFile()]);
      if (file.blocks.length >= MAX_BLOCKS) return { status: 400, body: { error: `You can keep up to ${MAX_BLOCKS} saved blocks.` } };
      const n = normalizeEntries(req.body?.entries, schedule.categories || []);
      if (n.errors.length) return { status: 400, body: { error: n.errors[0].message, errors: n.errors } };
      const now = new Date().toISOString();
      const block = { id: uuidv4(), name, label: cleanLabel(req.body?.label), entries: n.entries, createdAt: now, updatedAt: now };
      file.blocks.push(block);
      await writeBlocksFile(file);
      return { status: 201, body: block };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] POST /schedule/blocks error:', err.message);
    res.status(500).json({ error: 'Failed to save the block.' });
  }
});

router.put('/blocks/:id', async (req, res) => {
  try {
    const result = await withScheduleLock(async () => {
      const [schedule, file] = await Promise.all([readSchedule(), readBlocksFile()]);
      const idx = file.blocks.findIndex((b) => b.id === req.params.id);
      if (idx === -1) return { status: 404, body: { error: 'Saved block not found.' } };
      const next = { ...file.blocks[idx] };
      if ('name' in (req.body || {})) {
        const name = cleanLabel(req.body.name);
        if (!name) return { status: 400, body: { error: 'Give the block a name.' } };
        next.name = name;
      }
      if ('label' in (req.body || {})) next.label = cleanLabel(req.body.label);
      if ('entries' in (req.body || {})) {
        const n = normalizeEntries(req.body.entries, schedule.categories || []);
        if (n.errors.length) return { status: 400, body: { error: n.errors[0].message, errors: n.errors } };
        next.entries = n.entries;
      }
      next.updatedAt = new Date().toISOString();
      file.blocks[idx] = next;
      await writeBlocksFile(file);
      return { status: 200, body: next };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] PUT /schedule/blocks/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update the block.' });
  }
});

router.delete('/blocks/:id', async (req, res) => {
  try {
    const result = await withScheduleLock(async () => {
      const file = await readBlocksFile();
      const before = file.blocks.length;
      file.blocks = file.blocks.filter((b) => b.id !== req.params.id);
      if (file.blocks.length === before) return { status: 404, body: { error: 'Saved block not found.' } };
      await writeBlocksFile(file);
      return { status: 200, body: { success: true } };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api] DELETE /schedule/blocks/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete the block.' });
  }
});

// ── Zmanim for the Claude prompt ───────────────────────────────────────────

router.get('/zmanim', async (req, res) => {
  try {
    const dates = String(req.query.dates || '').split(',').map((s) => s.trim()).filter(isISODate);
    const today = toISODate(new Date());
    const limit = addDaysISO(today, 400);
    const wanted = [...new Set(dates)].filter((d) => d <= limit).slice(0, 14);
    if (!wanted.length) return res.status(400).json({ error: 'dates=YYYY-MM-DD[,YYYY-MM-DD…] required.' });
    const settings = (await readJSON('settings.json')) ?? {};
    const { zmanim, parsha } = await getZmanimForDates(wanted);
    res.json({ zmanim, parsha, location: settings?.location?.zip || '' });
  } catch (err) {
    console.error('[api] GET /schedule/zmanim error:', err.message);
    res.status(500).json({ error: 'Failed to look up zmanim.' });
  }
});

export default router;
