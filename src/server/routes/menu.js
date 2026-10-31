/**
 * /api/menu — the Menu slide's data (docs/specs/05-MENU.md). Mounted on /api AFTER requireAuth + csrfProtection + the
 * mutation limiter, gated by the `menu.edit` capability (src/shared/permissions.js). Granular writes (one meal, one date,
 * one week) so two people editing different days cannot overwrite each other; every one runs under the store lock and
 * ends in an SSE `menu-update`, so the TV follows at once. Bodies are bounded (128 kB, import text 64 kB).
 */
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { menuStore } from '../menuStore.js';
import * as M from '../../shared/menu.js';

const router = Router();
router.use('/menu', express.json({ limit: '128kb' }));

const importLimit = (windowMs, max, skipDry) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `menu-import:${req.user?.id || req.ip}`,
  skip: (req) => (req.body?.dryRun === true) === skipDry,
  message: { error: 'Too many imports. Please wait a little.' },
  validate: false,
});
const importReal = importLimit(60 * 60 * 1000, 30, true);
const importDry = importLimit(60 * 60 * 1000, 240, false);

const fail = (res, e) => {
  if (e instanceof M.MenuError) return res.status(400).json({ error: e.message });
  return res.status(500).json({ error: 'The menu could not be saved.' });
};
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

async function view(file) {
  return { ...file, today: await menuStore.today(), tz: await menuStore.tz(), suggestions: M.dishSuggestions(file) };
}
const send = async (res, saved) => res.json(await view(saved));

router.get('/menu', async (_req, res) => {
  try { res.json(await view(await menuStore.read())); } catch { res.status(500).json({ error: 'Could not read the menu.' }); }
});

// Settings and meal types: { settings?, mealTypes? }
router.put('/menu/settings', async (req, res) => {
  try {
    const b = body(req);
    await send(res, await menuStore.mutate(undefined, (f, today) => M.setSettings(f, { settings: b.settings, mealTypes: b.mealTypes }, today)));
  } catch (e) { fail(res, e); }
});

// One meal: { scope: { kind: 'day', date } | { kind: 'usual', set, day } | { kind: 'week', weekStart, day }, mealId, meal }
router.put('/menu/meal', async (req, res) => {
  try {
    const { scope, mealId, meal } = body(req);
    if (!scope || typeof scope !== 'object') throw new M.MenuError('Say where this change goes.');
    await send(res, await menuStore.mutate(undefined, (f) => M.setMeal(f, { kind: scope.kind, date: scope.date, set: scope.set, day: scope.day, weekStart: scope.weekStart }, mealId, meal)));
  } catch (e) { fail(res, e); }
});

router.put('/menu/weekly/:set', async (req, res) => {
  try { await send(res, await menuStore.mutate(undefined, (f) => M.setUsualWeek(f, Number(req.params.set), body(req).week))); } catch (e) { fail(res, e); }
});
router.put('/menu/weeks/:weekStart', async (req, res) => {
  try { await send(res, await menuStore.mutate(undefined, (f) => M.setWeekOverride(f, req.params.weekStart, body(req).week))); } catch (e) { fail(res, e); }
});
router.delete('/menu/weeks/:weekStart', async (req, res) => {
  try { await send(res, await menuStore.mutate(undefined, (f) => M.setWeekOverride(f, req.params.weekStart, null))); } catch (e) { fail(res, e); }
});
router.put('/menu/days/:date', async (req, res) => {
  try { await send(res, await menuStore.mutate(undefined, (f) => M.setDayOverride(f, req.params.date, body(req).day))); } catch (e) { fail(res, e); }
});
router.delete('/menu/days/:date', async (req, res) => {
  try { await send(res, await menuStore.mutate(undefined, (f) => M.setDayOverride(f, req.params.date, null))); } catch (e) { fail(res, e); }
});

// "Change today": { op: 'editMeal' | 'hideDish' | 'closeMeal' | 'swap' | 'closeDay' | 'reopen' | 'reset', mealId?, items?, note?, itemId?, a?, b? }
// Always applies to the screen's own today (its time zone), so a stale admin tab cannot change another date.
router.post('/menu/today', async (req, res) => {
  try {
    const b = body(req);
    const arg = { mealId: String(b.mealId ?? ''), itemId: String(b.itemId ?? ''), items: b.items, note: b.note, a: String(b.a ?? ''), b: String(b.b ?? '') };
    await send(res, await menuStore.mutate(undefined, (f, today) => M.todayOp(f, today, String(b.op), arg)));
  } catch (e) { fail(res, e); }
});

// Paste / spreadsheet import: { text | rows, target?, mode?: 'replace'|'add', dryRun?: boolean }. The server parses again on apply.
router.post('/menu/import', importReal, importDry, async (req, res) => {
  try {
    const b = body(req);
    const cur = await menuStore.read();
    const parsed = M.parseMenuInput({ text: typeof b.text === 'string' ? b.text : undefined, rows: Array.isArray(b.rows) ? b.rows : undefined }, cur);
    const summary = { errors: parsed.errors, warnings: parsed.warnings, counts: parsed.counts, hasTemplate: !!parsed.template, dates: Object.keys(parsed.dates), weeks: Object.keys(parsed.weeks) };
    if (b.dryRun === true || parsed.errors.length) return res.status(parsed.errors.length && b.dryRun !== true ? 400 : 200).json({ ...summary, dryRun: b.dryRun === true, error: parsed.errors[0] ? `${parsed.errors[0].row ? 'Row' : 'Line'} ${parsed.errors[0].line}: ${parsed.errors[0].message}` : undefined });
    const mode = b.mode === 'add' ? 'add' : 'replace';
    const t = b.target && typeof b.target === 'object' ? b.target : null;
    const target = t?.kind === 'week' ? { kind: 'week', weekStart: String(t.weekStart) } : t?.kind === 'usual' ? { kind: 'usual', set: Number(t.set) || 0 } : undefined;
    const saved = await menuStore.mutate(undefined, (f, today) => M.applyImport(f, parsed, { target, mode, today }));
    res.json({ ...summary, ...(await view(saved)) });
  } catch (e) { fail(res, e); }
});

export default router;
