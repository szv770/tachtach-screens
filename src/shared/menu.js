/**
 * Menu slide: pure rules shared by the kiosk, the admin and the server (spec docs/specs/05-MENU.md).
 *
 * Data (one org document, data/menu.json via src/server/menuStore.js; class P0 = food, never a person):
 *   { version: 1,
 *     settings: { view, tags, disclaimer, disclaimerHe, cycleWeeks, cycleStart, showWhen, leadMin, hoursFrom, hoursTo,
 *                 shabbosMeals, afterLast, weekDishes },
 *     mealTypes: [{ id, en, he, days, from, to, time, shabbos }],      // data, editable (max 8)
 *     weekly:     { Sun: { <mealId>: { items: [{ id, en, he, tags }], note } } },   // the usual week (week 1 of the rotation)
 *     weeklyMore: [weekly, weekly, weekly],                                          // rotation weeks 2..4
 *     weeks:      { 'YYYY-MM-DD'(a Sunday): weekly },                                // a whole week that replaces the usual one
 *     days:       { 'YYYY-MM-DD': { closed, note, noteHe, meals: { <mealId>: { items, note } } } } }   // one-date change
 *
 * What a date shows: days[date] (per meal; 'closed' closes the whole day) over weeks[sunday] over the rotation week
 * over the usual week. No clocks, no I/O: every function takes the date or `now` + time zone it needs.
 * Dishes are food names only. Nothing here may hold a student's name (the admin says so under the note field).
 */

import { zonedParts, addDays, DEFAULT_TZ } from './announcements.js';
import {
  TAGS, TAG_IDS, DEFAULT_TAGS, tagInfo, DAYS, DAY_WORDS, STARTER_MEALS,
} from './menuCopy.js';

export { DAYS };

export const LIMITS = Object.freeze({
  mealTypes: 8, dishes: 20, dish: 80, tagsPerDish: 6, note: 120, name: 40, time: 12, disclaimer: 120,
  days: 120, weeks: 60, file: 256 * 1024, importText: 64 * 1024, importLines: 400, importLine: 400,
  sheetRows: 200, sheetCols: 20, sheetCell: 400,
});
export const PRUNE_DAYS_AFTER = 14;
export const PRUNE_WEEKS_AFTER = 56; // 8 weeks

export const VIEWS = Object.freeze(['today', 'week', 'both']);
export const SHOW_WHEN = Object.freeze(['always', 'meals', 'hours']);
export const SHABBOS_MEALS = Object.freeze(['ahead', 'own-day', 'hidden']);
export const AFTER_LAST = Object.freeze(['tomorrow', 'today']);

export const DEFAULT_SETTINGS = Object.freeze({
  view: 'both', tags: DEFAULT_TAGS, disclaimer: '', disclaimerHe: '', cycleWeeks: 1, cycleStart: null,
  showWhen: 'always', leadMin: 60, hoursFrom: '07:00', hoursTo: '14:00', shabbosMeals: 'ahead', afterLast: 'tomorrow', weekDishes: 3,
});

// ── small text + date helpers ─────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_ID = /^[a-z0-9][a-z0-9-]{0,23}$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
const line = (v, max) => String(v ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const HEB = /[֐-׿]/;
const LAT = /[A-Za-z]/;

export function isISODate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const dayCodeOf = (iso) => DAYS[dowOf(iso)];
/** The Sunday of the week that holds `iso`. */
export const weekStartOf = (iso) => addDays(iso, -dowOf(iso));
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export { addDays };

/** 'H:MM' / 'HH:MM' -> minutes (24:00 allowed as the end of the day), or null. */
export function hm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}
const hhmm = (s) => { const v = hm(s); return v == null ? '' : `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
let counter = 0;
const newId = () => `d_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Dish text safe for the paste format: no separators, brackets, '//' or ' / ' inside a name. */
const dishText = (v) => line(String(v ?? '').replace(/[;|]/g, ',').replace(/[[\]]/g, ' ').replace(/\s\/\s/g, ' - ').replace(/\/\//g, '/'), LIMITS.dish);

// ── normalisers ───────────────────────────────────────────────────────────────

/** One dish -> { id, en, he, tags } or null (needs a name in English or Hebrew). Unknown tags are dropped. */
export function normalizeItem(raw, index = 0) {
  if (raw == null) return null;
  const o = typeof raw === 'string' ? { en: raw } : raw;
  if (typeof o !== 'object' || Array.isArray(o)) return null;
  let en = dishText(o.en ?? o.name);
  let he = dishText(o.he);
  if (en && !he && HEB.test(en) && !LAT.test(en)) { he = en; en = ''; }
  if (!en && !he) return null;
  const tagsIn = Array.isArray(o.tags) ? o.tags : [];
  const tags = [...new Set(tagsIn.map((t) => String(t).toLowerCase()).filter((t) => TAG_IDS.includes(t)))].slice(0, LIMITS.tagsPerDish);
  const id = line(o.id, 40).replace(/[^\w-]/g, '') || `i_${hash(`${en}|${he}`)}_${index}`;
  return { id, en, he, tags };
}

export function normalizeMeal(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const seen = new Set();
  const items = [];
  (Array.isArray(o.items) ? o.items : []).slice(0, LIMITS.dishes * 2).forEach((x, i) => {
    const it = normalizeItem(x, i);
    if (!it || items.length >= LIMITS.dishes) return;
    if (seen.has(it.id)) it.id = `${it.id}_${i}`;
    seen.add(it.id);
    items.push(it);
  });
  return { items, note: line(String(o.note ?? '').replace(/\/\//g, '/'), LIMITS.note) };
}

export function normalizeWeekly(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const d of DAYS) {
    const day = raw[d];
    if (!day || typeof day !== 'object') continue;
    const meals = {};
    for (const id of Object.keys(day)) {
      if (!MEAL_ID.test(id)) continue;
      meals[id] = normalizeMeal(day[id]);
    }
    if (Object.keys(meals).length) out[d] = meals;
  }
  return out;
}

export function normalizeMealTypes(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const used = new Set();
  for (const m of list.slice(0, 24)) {
    if (!m || typeof m !== 'object' || out.length >= LIMITS.mealTypes) continue;
    const nm = (v) => line(String(v ?? '').replace(/:/g, ' -').replace(/^[@#]+/, ''), LIMITS.name);
    const en = nm(m.en), he = nm(m.he);
    if (!en && !he) continue;
    let id = String(m.id ?? '').toLowerCase();
    if (!MEAL_ID.test(id)) id = (en || 'meal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'meal';
    for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, '').slice(0, 20)}-${n}`;
    used.add(id);
    const days = DAYS.filter((d) => Array.isArray(m.days) && m.days.includes(d));
    const dd = days.length ? days : DAYS.slice(0, 6);
    out.push({
      id, en, he, days: dd, from: hhmm(m.from), to: hhmm(m.to), time: line(m.time, LIMITS.time),
      shabbos: typeof m.shabbos === 'boolean' ? m.shabbos : dd.includes('Shabbos'),
    });
  }
  return out.length ? out : STARTER_MEALS.map((m) => ({ ...m, days: [...m.days] }));
}

export function normalizeSettings(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const D = DEFAULT_SETTINGS;
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const tags = Array.isArray(o.tags) ? [...new Set(o.tags.map((t) => String(t).toLowerCase()).filter((t) => TAG_IDS.includes(t)))] : [...D.tags];
  const cycleWeeks = int(o.cycleWeeks, 1, 4, 1);
  return {
    view: oneOf(o.view, VIEWS, D.view),
    tags,
    disclaimer: line(o.disclaimer, LIMITS.disclaimer),
    disclaimerHe: line(o.disclaimerHe, LIMITS.disclaimer),
    cycleWeeks,
    cycleStart: isISODate(o.cycleStart) ? weekStartOf(o.cycleStart) : null,
    showWhen: oneOf(o.showWhen, SHOW_WHEN, D.showWhen),
    leadMin: int(o.leadMin, 0, 240, D.leadMin),
    hoursFrom: hhmm(o.hoursFrom) || D.hoursFrom,
    hoursTo: hhmm(o.hoursTo) || D.hoursTo,
    shabbosMeals: oneOf(o.shabbosMeals, SHABBOS_MEALS, D.shabbosMeals),
    afterLast: oneOf(o.afterLast, AFTER_LAST, D.afterLast),
    weekDishes: int(o.weekDishes, 1, 8, D.weekDishes),
  };
}

function normalizeDayOverride(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meals = {};
  if (raw.meals && typeof raw.meals === 'object') {
    for (const id of Object.keys(raw.meals)) if (MEAL_ID.test(id)) meals[id] = normalizeMeal(raw.meals[id]);
  }
  const clean = (v) => line(String(v ?? '').replace(/\/\//g, '/'), LIMITS.note);
  const out = { closed: raw.closed === true, note: clean(raw.note), noteHe: clean(raw.noteHe), meals };
  if (!out.closed && !out.note && !out.noteHe && !Object.keys(meals).length) return null;
  return out;
}

/**
 * Clean a whole document. Unknown keys are dropped, hostile keys never survive (dates are validated, meal ids are a
 * strict pattern, days are an enum). `today` (YYYY-MM-DD) also prunes old overrides; omit it to keep them.
 */
export function normalizeFile(raw, { today } = {}) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const mealTypes = normalizeMealTypes(r.mealTypes);
  const settings = normalizeSettings(r.settings);
  if (settings.cycleWeeks > 1 && !settings.cycleStart) settings.cycleStart = weekStartOf(isISODate(today) ? today : '2026-01-04');
  const more = Array.isArray(r.weeklyMore) ? r.weeklyMore.slice(0, 3).map(normalizeWeekly) : [];
  while (more.length < 3) more.push({});
  const weeks = {};
  if (r.weeks && typeof r.weeks === 'object') {
    for (const k of Object.keys(r.weeks)) {
      if (!isISODate(k) || dowOf(k) !== 0) continue;
      if (isISODate(today) && dayNumber(today) - dayNumber(k) > PRUNE_WEEKS_AFTER) continue;
      weeks[k] = normalizeWeekly(r.weeks[k]);
    }
  }
  const days = {};
  if (r.days && typeof r.days === 'object') {
    for (const k of Object.keys(r.days)) {
      if (!isISODate(k)) continue;
      if (isISODate(today) && dayNumber(today) - dayNumber(k) > PRUNE_DAYS_AFTER) continue;
      const d = normalizeDayOverride(r.days[k]);
      if (d) days[k] = d;
    }
  }
  const cap = (obj, n) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, n));
  return {
    version: 1, settings, mealTypes, weekly: normalizeWeekly(r.weekly), weeklyMore: more,
    weeks: cap(weeks, LIMITS.weeks), days: cap(days, LIMITS.days),
  };
}

export const emptyFile = () => normalizeFile({});
export const fileBytes = (f) => JSON.stringify(f).length;

/** True when there is nothing to show anywhere (the slide stays out of the rotation, the admin shows the empty state). */
export function isEmpty(file) {
  const f = file || {};
  const hasWeek = (w) => Object.values(w || {}).some((d) => Object.values(d || {}).some((m) => m?.items?.length));
  if (hasWeek(f.weekly) || (f.weeklyMore || []).some(hasWeek) || Object.values(f.weeks || {}).some(hasWeek)) return false;
  return !Object.values(f.days || {}).some((d) => d.closed || Object.values(d.meals || {}).some((m) => m?.items?.length));
}

// ── resolving a date ──────────────────────────────────────────────────────────

/** Which rotation week (0-based) a date falls in. 0 when the rotation is off or has no start. */
export function cycleIndex(file, date) {
  const s = file?.settings || {};
  const n = s.cycleWeeks || 1;
  if (n <= 1 || !isISODate(s.cycleStart) || !isISODate(date)) return 0;
  const diffWeeks = Math.floor((dayNumber(weekStartOf(date)) - dayNumber(s.cycleStart)) / 7);
  return ((diffWeeks % n) + n) % n;
}
export const weeklySet = (file, idx) => (idx <= 0 ? file.weekly || {} : (file.weeklyMore || [])[idx - 1] || {});

/** The week a date belongs to before any one-date change: { source: 'week'|'cycle'|'weekly', week, set }. */
export function baseWeek(file, date) {
  const ws = weekStartOf(date);
  if (file.weeks?.[ws]) return { source: 'week', week: file.weeks[ws], set: 0 };
  const set = cycleIndex(file, date);
  return { source: (file.settings?.cycleWeeks || 1) > 1 ? 'cycle' : 'weekly', week: weeklySet(file, set), set };
}

/**
 * What one date serves.
 * @param {{ignoreDay?: boolean, keepEmpty?: boolean}} [opts] ignoreDay = the day as it would be with no one-date change;
 *   keepEmpty = also list meals that have no dishes (the admin editor)
 * @returns {{ date, dow, source: 'day'|'week'|'cycle'|'weekly'|'none', set, closed, note, noteHe, meals: [{ type, mt, items, note, changed }] }}
 */
export function resolveDay(file, date, opts = {}) {
  const dow = dayCodeOf(date);
  const bw = baseWeek(file, date);
  const dayData = bw.week[dow] || {};
  const ov = opts.ignoreDay ? null : file.days?.[date] || null;
  const meals = [];
  for (const mt of file.mealTypes || []) {
    if (!mt.days.includes(dow)) continue;
    let m = dayData[mt.id];
    let changed = false;
    if (ov?.meals?.[mt.id]) { m = ov.meals[mt.id]; changed = true; }
    const items = m?.items || [];
    if (!items.length && !opts.keepEmpty) continue;
    meals.push({ type: mt.id, mt, items, note: m?.note || '', changed });
  }
  const closed = !!ov?.closed;
  const shown = closed && !opts.keepEmpty ? [] : meals;
  const any = meals.some((m) => m.items.length);
  return {
    date, dow, source: ov ? 'day' : (any ? bw.source : 'none'), set: bw.set,
    closed, note: ov?.note || '', noteHe: ov?.noteHe || '', meals: shown,
  };
}

/**
 * A day as the kiosk's Today view serves it: the Shabbos-meal setting applied. 'ahead' = on Friday the Shabbos
 * meals (Friday night is already Friday's own) come with it; 'hidden' = no Shabbos meal anywhere; 'own-day' = as typed.
 */
export function viewDay(file, date) {
  const r = resolveDay(file, date);
  const mode = file.settings?.shabbosMeals || 'ahead';
  let meals = r.meals;
  if (mode === 'hidden') meals = meals.filter((m) => !m.mt.shabbos);
  else if (mode === 'ahead' && r.dow === 'Fri' && !r.closed) {
    const sat = resolveDay(file, addDays(date, 1));
    if (!sat.closed) meals = [...meals, ...sat.meals.filter((m) => m.mt.shabbos).map((m) => ({ ...m, ahead: true }))];
  }
  return { ...r, meals };
}

/** The meal being served now and the next one, from each meal's from/to window (own meals only, not 'ahead' ones). */
export function currentMeal(meals, minutes) {
  let now = null, next = null, nextAt = Infinity, nowAt = -1;
  for (const m of meals || []) {
    if (m.ahead) continue;
    const f = hm(m.mt?.from), t = hm(m.mt?.to);
    if (f == null || t == null) continue;
    if (f <= minutes && minutes < t && f >= nowAt) { now = m.type; nowAt = f; }
    else if (f > minutes && f < nextAt) { next = m.type; nextAt = f; }
  }
  if (next && now === next) next = null;
  return { now, next };
}

/** The 'to' (minutes) of the last own meal of a day; 1440 when any of them has no end (it never switches over). */
function lastEnd(meals) {
  let end = -1;
  for (const m of meals) {
    if (m.ahead) continue;
    const t = hm(m.mt?.to);
    if (t == null) return 1440;
    end = Math.max(end, t);
  }
  return end < 0 ? 1440 : end;
}

const hasSomething = (v) => v.closed || v.meals.length > 0;

/**
 * The date the Today view shows: today until the last meal has ended (setting 'afterLast'), then tomorrow; a day with
 * nothing planned jumps to the next day that has something (labelled by weekday). Null when the next 7 days are empty.
 */
export function focusDate(file, now, tz) {
  const z = zonedParts(now, tz || DEFAULT_TZ);
  const today = z.date;
  const t = viewDay(file, today);
  const after = (file.settings?.afterLast || 'tomorrow') === 'tomorrow';
  const start = hasSomething(t) && after && !t.closed && t.meals.length && z.minutes >= lastEnd(t.meals) ? 1 : 0;
  for (let i = start; i < start + 8; i++) {
    const date = addDays(today, i);
    const v = i === 0 ? t : viewDay(file, date);
    if (!hasSomething(v)) continue;
    const kind = date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : 'later';
    let following = null;
    if (v.closed) {
      for (let j = 1; j < 8 && !following; j++) { const f = viewDay(file, addDays(date, j)); if (f.meals.length) following = { ...f, kind: j === 1 && kind === 'today' ? 'tomorrow' : 'later' }; }
    }
    const cur = kind === 'today' ? currentMeal(v.meals, z.minutes) : { now: null, next: null };
    return { ...v, kind, today, minutes: z.minutes, now: cur.now, next: cur.next, following };
  }
  return null;
}

/** Is the Menu slide in the rotation right now? (has something AND inside the admin's schedule window) */
export function menuVisible(file, now, tz) {
  if (!file || isEmpty(file)) return false;
  const f = focusDate(file, now, tz);
  if (!f) return false;
  const s = file.settings || {};
  if (s.showWhen === 'always') return true;
  const min = f.minutes;
  if (s.showWhen === 'hours') {
    const a = hm(s.hoursFrom) ?? 0, b = hm(s.hoursTo) ?? 1440;
    return a <= b ? min >= a && min < b : min >= a || min < b;
  }
  // 'meals': from `leadMin` before a meal starts until it ends, on a day that has meals
  const today = viewDay(file, f.today);
  return today.meals.some((m) => {
    if (m.ahead) return false;
    const fr = hm(m.mt?.from), to = hm(m.mt?.to);
    if (fr == null || to == null) return true;
    return min >= fr - (s.leadMin || 0) && min < to;
  });
}

/**
 * The week for the Week view: columns are the days of the week that have something, rows the meal types that appear.
 * `date` is any date in the week (the kiosk passes the focus date, so after Shabbos it is next week).
 */
export function weekGrid(file, date) {
  const ws = weekStartOf(date);
  const mode = file.settings?.shabbosMeals || 'ahead';
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const r = resolveDay(file, d);
    const meals = mode === 'hidden' ? r.meals.filter((m) => !m.mt.shabbos) : r.meals;
    if (!r.closed && !meals.length) continue;
    days.push({ code: DAYS[i], date: d, closed: r.closed, note: r.note, noteHe: r.noteHe, meals });
  }
  const rows = [];
  for (const mt of file.mealTypes || []) {
    const cells = {};
    for (const dy of days) { const m = dy.meals.find((x) => x.type === mt.id); if (m) cells[dy.code] = m.items; }
    if (Object.keys(cells).length) rows.push({ id: mt.id, en: mt.en, he: mt.he, cells });
  }
  return { weekStart: ws, days, rows };
}

/** The most used dish names of this document (en/he/tags), for the admin's tap-to-add suggestions. */
export function dishSuggestions(file, limit = 40) {
  const count = new Map();
  const add = (items) => { for (const it of items || []) { const k = `${it.en}|${it.he}`; const e = count.get(k) || { en: it.en, he: it.he, tags: it.tags || [], n: 0 }; e.n += 1; count.set(k, e); } };
  const addWeek = (w) => Object.values(w || {}).forEach((d) => Object.values(d || {}).forEach((m) => add(m.items)));
  addWeek(file.weekly); (file.weeklyMore || []).forEach(addWeek); Object.values(file.weeks || {}).forEach(addWeek);
  Object.values(file.days || {}).forEach((d) => Object.values(d.meals || {}).forEach((m) => add(m.items)));
  return [...count.values()].sort((a, b) => b.n - a.n || (a.en || a.he).localeCompare(b.en || b.he)).slice(0, limit).map(({ en, he, tags }) => ({ en, he, tags }));
}

// ── what the kiosk gets ───────────────────────────────────────────────────────

/** The document reduced to a window around `today` (weeks and days that can still matter), so /api/state stays small. */
export function forKiosk(file, today) {
  const f = file || emptyFile();
  const t = isISODate(today) ? dayNumber(today) : null;
  const keepDay = (k) => t == null || (dayNumber(k) >= t - 2 && dayNumber(k) <= t + 45);
  const keepWeek = (k) => t == null || (dayNumber(k) >= t - 7 && dayNumber(k) <= t + 63);
  return {
    version: 1, settings: f.settings, mealTypes: f.mealTypes, weekly: f.weekly, weeklyMore: f.weeklyMore,
    weeks: Object.fromEntries(Object.entries(f.weeks || {}).filter(([k]) => keepWeek(k))),
    days: Object.fromEntries(Object.entries(f.days || {}).filter(([k]) => keepDay(k))),
  };
}

// ── editing (pure; the routes call these under the store lock) ────────────────

const clone = (o) => JSON.parse(JSON.stringify(o));
export class MenuError extends Error {}
const bad = (m) => { throw new MenuError(m); };

/**
 * Put one meal in a place. scope = { kind: 'day', date } | { kind: 'usual', set, day } | { kind: 'week', weekStart, day }.
 * A week that has no override yet starts as a copy of what that week shows now (so changing one day keeps the rest).
 */
export function setMeal(file, scope, mealId, meal) {
  if (!MEAL_ID.test(String(mealId))) bad('Unknown meal.');
  if (!(file.mealTypes || []).some((m) => m.id === mealId)) bad('Unknown meal.');
  const f = clone(file);
  const m = normalizeMeal(meal);
  if (scope.kind === 'day') {
    if (!isISODate(scope.date)) bad('That is not a date.');
    const ov = f.days[scope.date] || { closed: false, note: '', noteHe: '', meals: {} };
    ov.meals = { ...(ov.meals || {}), [mealId]: m };
    f.days[scope.date] = ov;
  } else if (scope.kind === 'usual') {
    const set = Number(scope.set) || 0;
    if (!DAYS.includes(scope.day) || set < 0 || set >= (f.settings.cycleWeeks || 1)) bad('Unknown day or week.');
    const w = set === 0 ? f.weekly : f.weeklyMore[set - 1];
    w[scope.day] = { ...(w[scope.day] || {}), [mealId]: m };
  } else if (scope.kind === 'week') {
    if (!isISODate(scope.weekStart) || dowOf(scope.weekStart) !== 0 || !DAYS.includes(scope.day)) bad('Unknown week or day.');
    const w = f.weeks[scope.weekStart] || clone(baseWeek(f, scope.weekStart).week);
    w[scope.day] = { ...(w[scope.day] || {}), [mealId]: m };
    f.weeks[scope.weekStart] = w;
  } else bad('Unknown place.');
  return f;
}

/** Replace a whole day override, or remove it (value null). */
export function setDayOverride(file, date, value) {
  if (!isISODate(date)) bad('That is not a date.');
  const f = clone(file);
  const d = value == null ? null : normalizeDayOverride(value);
  if (d) f.days[date] = d; else delete f.days[date];
  return f;
}
export function setWeekOverride(file, weekStart, value) {
  if (!isISODate(weekStart) || dowOf(weekStart) !== 0) bad('A week starts on a Sunday.');
  const f = clone(file);
  if (value == null) delete f.weeks[weekStart]; else f.weeks[weekStart] = normalizeWeekly(value);
  return f;
}
export function setUsualWeek(file, set, value) {
  const n = Number(set) || 0;
  const f = clone(file);
  if (n < 0 || n >= Math.max(1, f.settings.cycleWeeks || 1)) bad('That rotation week does not exist.');
  if (n === 0) f.weekly = normalizeWeekly(value); else f.weeklyMore[n - 1] = normalizeWeekly(value);
  return f;
}
export function setSettings(file, { settings, mealTypes }, today) {
  const f = clone(file);
  if (mealTypes !== undefined) {
    if (!Array.isArray(mealTypes) || !mealTypes.length) bad('Keep at least one meal.');
    f.mealTypes = normalizeMealTypes(mealTypes);
  }
  if (settings !== undefined) f.settings = normalizeSettings({ ...f.settings, ...settings });
  return normalizeFile(f, { today });
}

/**
 * "Change today" on the Today card. ops: editMeal {mealId, items, note} | hideDish {mealId, itemId} | closeMeal {mealId} |
 * swap {a, b} | closeDay {note} | reopen | reset. Everything lands in days[date], so only that date changes.
 */
export function todayOp(file, date, op, a = {}) {
  const cur = resolveDay(file, date, { keepEmpty: true });
  const mealNow = (id) => cur.meals.find((m) => m.type === id);
  switch (op) {
    case 'editMeal': return setMeal(file, { kind: 'day', date }, a.mealId, { items: a.items, note: a.note });
    case 'closeMeal': return setMeal(file, { kind: 'day', date }, a.mealId, { items: [], note: '' });
    case 'hideDish': {
      const m = mealNow(a.mealId);
      if (!m || !m.items.some((x) => x.id === a.itemId)) bad('That dish is not on today’s menu any more.');
      return setMeal(file, { kind: 'day', date }, a.mealId, { items: m.items.filter((x) => x.id !== a.itemId), note: m.note });
    }
    case 'swap': {
      const x = mealNow(a.a), y = mealNow(a.b);
      if (!x || !y || a.a === a.b) bad('Pick two different meals.');
      const f1 = setMeal(file, { kind: 'day', date }, a.a, { items: y.items, note: y.note });
      return setMeal(f1, { kind: 'day', date }, a.b, { items: x.items, note: x.note });
    }
    case 'closeDay': {
      const f = clone(file);
      const he = HEB.test(a.note || '') && !LAT.test(a.note || '');
      const old = f.days[date] || { meals: {} };
      f.days[date] = normalizeDayOverride({ ...old, closed: true, note: he ? '' : a.note, noteHe: he ? a.note : '' });
      return f;
    }
    case 'reopen': {
      const f = clone(file);
      const old = f.days[date];
      if (old) { const n = normalizeDayOverride({ ...old, closed: false, note: '', noteHe: '' }); if (n) f.days[date] = n; else delete f.days[date]; }
      return f;
    }
    case 'reset': return setDayOverride(file, date, null);
    default: return bad('Unknown action.');
  }
}

// ── the paste format ("TachTach menu v1") ─────────────────────────────────────

const norm = (s) => String(s ?? '').toLowerCase().replace(/[.'’"]/g, '').replace(/\s+/g, ' ').trim();
const HE_LETTER_DAY = { 'א': 'Sun', 'ב': 'Mon', 'ג': 'Tue', 'ד': 'Wed', 'ה': 'Thu', 'ו': 'Fri' };
/** A day word in any spelling/language -> 'Sun'..'Shabbos', else null. */
export function dayFromWord(s) {
  const k = norm(s).replace(/:$/, '').replace(/[׳']/g, '');
  return DAY_WORDS[k] || HE_LETTER_DAY[k] || null;
}

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return row[b.length];
}
function didYouMean(word, candidates) {
  const w = norm(word);
  let best = null, bd = 99;
  for (const c of candidates) { const d = lev(w, norm(c)); if (d < bd) { bd = d; best = c; } }
  return best && bd <= Math.max(1, Math.min(2, Math.floor(w.length / 3))) ? best : null;
}

function tagFromWord(w) {
  const k = norm(w);
  if (!k) return null;
  for (const t of TAGS) if (k === t.id || k === norm(t.en) || k === norm(t.he) || k === t.short.toLowerCase()) return t.id;
  return null;
}
const tagNames = () => TAGS.flatMap((t) => [t.id, t.en]);

function mealFromWord(file, w) {
  const k = norm(w);
  if (!k) return null;
  return (file.mealTypes || []).find((m) => norm(m.id) === k || norm(m.en) === k || norm(m.he) === k) || null;
}

/** Cut a trailing ' // note' off a line. */
function splitNote(s) { const i = s.indexOf(' // '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 4).trim()]; }

/** Split on ; and | outside brackets. */
function splitDishes(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '[' || ch === '(') depth++;
    else if ((ch === ']' || ch === ')') && depth > 0) depth--;
    if ((ch === ';' || ch === '|') && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** One dish piece -> { item } | { error }. Tags in [ ] (strict: an unknown one is an error) or trailing ( ) (only when all are tags). */
function parseDish(piece) {
  let s = piece;
  const tags = [];
  const errs = [];
  s = s.replace(/\[([^\]]*)\]/g, (_, inner) => {
    for (const tok of inner.split(/[,\s·]+/).filter(Boolean)) {
      const t = tagFromWord(tok);
      if (t) tags.push(t);
      else { const g = didYouMean(tok, tagNames()); errs.push(`unknown tag "${tok}"${g ? `. Did you mean ${g.toLowerCase()}?` : '.'}`); }
    }
    return ' ';
  });
  const m = /\(([^()]*)\)\s*$/.exec(s);
  if (m) {
    const toks = m[1].split(/[,\s·]+/).filter(Boolean);
    if (toks.length && toks.every((x) => tagFromWord(x))) { toks.forEach((x) => tags.push(tagFromWord(x))); s = s.slice(0, m.index); }
  }
  s = line(s, 400);
  let en = '', he = '';
  const parts = s.split(' / ');
  if (parts.length === 2) {
    for (const p of parts) { if (HEB.test(p) && !LAT.test(p)) he ||= p.trim(); else en ||= p.trim(); }
    if (!en && !he) { en = parts[0]; he = parts[1]; }
  } else if (HEB.test(s) && !LAT.test(s)) he = s; else en = s;
  if (!en && !he) return errs.length ? { error: errs[0] } : null;
  if ((en || he).length > LIMITS.dish || en.length > LIMITS.dish || he.length > LIMITS.dish) return { error: `dish is longer than ${LIMITS.dish} characters` };
  if (errs.length) return { error: errs[0] };
  return { item: { en, he, tags: [...new Set(tags)].slice(0, LIMITS.tagsPerDish) } };
}

function parseDishes(text) {
  const items = []; const errors = [];
  for (const piece of splitDishes(text)) {
    const r = parseDish(piece);
    if (!r) continue;
    if (r.error) errors.push(r.error); else items.push(r.item);
  }
  if (items.length > LIMITS.dishes) errors.push(`more than ${LIMITS.dishes} dishes in one meal`);
  return { items, errors };
}

const CLOSED_RE = /^(no meals?|closed)\b/i;

function daysFromSpec(spec) {
  const s = String(spec).trim();
  const k = norm(s);
  if (k === 'weekdays') return { days: DAYS.slice(0, 6) };
  if (k === 'every day' || k === 'everyday' || k === 'daily' || k === 'all') return { days: [...DAYS] };
  const out = [];
  const parts = s.replace(/\bto\b/gi, '-').split(/[,&]|\band\b/i).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { error: 'no days after "@"' };
  for (const p of parts) {
    const rg = p.split(/\s*[-–—]\s*/);
    if (rg.length === 2) {
      const a = dayFromWord(rg[0]), b = dayFromWord(rg[1]);
      if (!a || !b) return { error: `unknown day in "${p}"` };
      const i = DAYS.indexOf(a), j = DAYS.indexOf(b);
      if (i > j) return { error: `"${p}" runs backwards` };
      for (let x = i; x <= j; x++) out.push(DAYS[x]);
    } else {
      const d = dayFromWord(p);
      if (!d) return { error: `unknown day "${p}"` };
      out.push(d);
    }
  }
  return { days: DAYS.filter((d) => out.includes(d)) };
}

const emptyParsed = () => ({ errors: [], warnings: [], template: null, dates: {}, weeks: {}, counts: { days: 0, meals: 0, dishes: 0 } });

function addTo(week, day, mealId, meal) {
  week[day] = week[day] || {};
  week[day][mealId] = meal;
}

function tally(p) {
  let meals = 0, dishes = 0;
  const days = new Set();
  const week = (w, tag) => { for (const [d, ms] of Object.entries(w || {})) for (const m of Object.values(ms)) { if (m.items.length) { meals++; dishes += m.items.length; days.add(`${tag}${d}`); } } };
  week(p.template, 't');
  Object.entries(p.weeks).forEach(([k, w]) => week(w, k));
  for (const [k, d] of Object.entries(p.dates)) { if (d.closed) days.add(k); for (const m of Object.values(d.meals)) if (m.items.length) { meals++; dishes += m.items.length; days.add(k); } }
  p.counts = { days: days.size, meals, dishes };
}

/**
 * Parse the paste format. Strict on structure, forgiving on layout; every problem is listed with its line and the whole
 * thing is all-or-nothing (the caller refuses to apply while `errors` is not empty).
 */
export function parseMenuText(text, file) {
  const out = emptyParsed();
  const raw = String(text ?? '').replace(CTRL, (c) => (c === '​' || c === '﻿' ? '' : ' '));
  if (raw.length > LIMITS.importText) { out.errors.push({ line: 0, message: `That is too much text (limit ${LIMITS.importText / 1024} kB).` }); return out; }
  const lines = raw.split(/\r\n|\r|\n/);
  if (lines.length > LIMITS.importLines) { out.errors.push({ line: 0, message: `Too many lines (limit ${LIMITS.importLines}).` }); return out; }
  let scope = null; // { kind: 'every', days } | { kind: 'date', date, ov } | { kind: 'week', ws, week, day }
  const err = (n, message) => out.errors.push({ line: n, message });
  const mealNames = (file.mealTypes || []).flatMap((m) => [m.en, m.he].filter(Boolean));

  lines.forEach((rawLine, idx) => {
    const n = idx + 1;
    if (rawLine.length > LIMITS.importLine * 2) { err(n, `Line is longer than ${LIMITS.importLine} characters.`); return; }
    let l = rawLine.replace(/(^|\s)#(\s.*)?$/, '').trim();
    if (!l) return;
    if (l.length > LIMITS.importLine) { err(n, `Line is longer than ${LIMITS.importLine} characters.`); return; }

    if (l.startsWith('@')) {
      const spec = l.slice(1).trim();
      const wk = /^week\s+(\d{4}-\d{2}-\d{2})$/i.exec(spec);
      if (wk) {
        if (!isISODate(wk[1])) { err(n, `"${wk[1]}" is not a date.`); scope = null; return; }
        const ws = weekStartOf(wk[1]);
        if (ws !== wk[1]) out.warnings.push({ line: n, message: `${wk[1]} is not a Sunday; using the week starting ${ws}.` });
        out.weeks[ws] = out.weeks[ws] || {};
        scope = { kind: 'week', ws, week: out.weeks[ws], day: null };
        return;
      }
      if (ISO.test(spec)) {
        if (!isISODate(spec)) { err(n, `"${spec}" is not a date.`); scope = null; return; }
        out.dates[spec] = out.dates[spec] || { closed: false, note: '', noteHe: '', meals: {} };
        scope = { kind: 'date', date: spec, ov: out.dates[spec] };
        return;
      }
      const d = daysFromSpec(spec.replace(/^every\s+(?!day)/i, ''));
      if (d.error) { err(n, d.error); scope = null; return; }
      out.template = out.template || {};
      scope = { kind: 'every', days: d.days };
      return;
    }

    if (scope?.kind === 'week' && !l.includes(':')) {
      const d = dayFromWord(l);
      if (d) { scope.day = d; return; }
    }

    const ci = l.indexOf(':');
    if (ci < 0) {
      const d = dayFromWord(l);
      if (d && scope?.kind !== 'week') { err(n, `A day name here needs a "@ week YYYY-MM-DD" line above it.`); return; }
      err(n, `Expected "Meal: dish; dish". Start a block with a line like "@ every Sun-Thu" or "@ 2026-11-03".`);
      return;
    }
    if (!scope) { err(n, 'Start with a line like "@ every Sun-Thu" or "@ 2026-11-03" so I know which days this is for.'); return; }
    const name = l.slice(0, ci).trim();
    let [rest, mealNote] = splitNote(l.slice(ci + 1).trim());
    const key = norm(name);
    const meal = mealFromWord(file, name);

    if (!meal && (key === 'closed' || key === 'no meals' || key === 'no meal')) {
      if (scope.kind === 'every') { err(n, '"Closed" is for one date. Use "@ 2026-11-03" above it.'); return; }
      if (scope.kind === 'week' && !scope.day) { err(n, 'Put a day name above this line.'); return; }
      applyClosed(scope, rest, out, n);
      return;
    }
    if (!meal && key === 'note') {
      if (scope.kind !== 'date') { err(n, '"Note" is for one date. Use "@ 2026-11-03" above it.'); return; }
      if (HEB.test(rest) && !LAT.test(rest)) scope.ov.noteHe = line(rest, LIMITS.note); else scope.ov.note = line(rest, LIMITS.note);
      return;
    }
    if (!meal) {
      const g = didYouMean(name, mealNames);
      err(n, `unknown meal "${name}"${g ? `. Did you mean ${g}?` : `. Meals here: ${mealNames.slice(0, 6).join(', ')}.`}`);
      return;
    }
    if (scope.kind === 'week' && !scope.day) { err(n, 'Put a day name (Sunday, Monday...) above this line.'); return; }

    let items = [];
    if (rest && !/^[-—–]$/.test(rest)) {
      if ((scope.kind === 'date' || scope.kind === 'week') && CLOSED_RE.test(rest)) { applyClosed(scope, rest, out, n); return; }
      const r = parseDishes(rest);
      if (r.errors.length) { r.errors.forEach((m) => err(n, m)); return; }
      items = r.items;
    }
    const m = { items, note: line(mealNote, LIMITS.note) };
    if (scope.kind === 'every') for (const d of scope.days) addTo(out.template, d, meal.id, clone(m));
    else if (scope.kind === 'date') scope.ov.meals[meal.id] = m;
    else addTo(scope.week, scope.day, meal.id, m);
  });

  tally(out);
  if (!out.errors.length && !out.template && !Object.keys(out.dates).length && !Object.keys(out.weeks).length) out.errors.push({ line: 0, message: 'I did not find any menu in that text.' });
  else if (!out.errors.length && out.counts.meals === 0 && !Object.values(out.dates).some((d) => d.closed)) out.errors.push({ line: 0, message: 'I found days but no dishes.' });
  return out;
}

function applyClosed(scope, text, out, n) {
  const note = line(text, LIMITS.note);
  if (scope.kind === 'date') {
    scope.ov.closed = true;
    if (HEB.test(note) && !LAT.test(note)) scope.ov.noteHe = note; else scope.ov.note = note;
  } else {
    // A week block has no per-day closed flag: record it as a date override on that day.
    const d = addDays(scope.ws, DAYS.indexOf(scope.day));
    out.dates[d] = out.dates[d] || { closed: false, note: '', noteHe: '', meals: {} };
    out.dates[d].closed = true;
    if (HEB.test(note) && !LAT.test(note)) out.dates[d].noteHe = note; else out.dates[d].note = note;
  }
}

// ── spreadsheet rows ──────────────────────────────────────────────────────────

/** Tab- (or comma-) separated text with "quoted cells" (which may hold line breaks) -> rows of strings. Bounded. */
export function parseDelimited(text, delim = '\t') {
  const rows = []; let row = []; let cell = ''; let q = false;
  const s = String(text ?? '').replace(/^﻿/, '');
  for (let i = 0; i < s.length && rows.length <= LIMITS.sheetRows + 2; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Rows copied from a spreadsheet: days across the first row and meals down the first column (or the other way round). */
export function parseSheet(rowsIn, file) {
  const out = emptyParsed();
  const err = (n, message) => out.errors.push({ line: n, message, row: true });
  if (!Array.isArray(rowsIn) || rowsIn.length > LIMITS.sheetRows) { err(0, `Too many rows (limit ${LIMITS.sheetRows}).`); return out; }
  const rows = rowsIn.map((r) => (Array.isArray(r) ? r.slice(0, LIMITS.sheetCols).map((c) => line2(c)) : []));
  if (rowsIn.some((r) => Array.isArray(r) && r.length > LIMITS.sheetCols)) { err(0, `Too many columns (limit ${LIMITS.sheetCols}).`); return out; }
  const dayCount = (cells) => cells.slice(1).filter((c) => dayFromWord(c)).length;
  let hi = rows.findIndex((r) => dayCount(r) >= 1 && r.slice(1).filter(Boolean).length === dayCount(r));
  let across = true;
  if (hi < 0 || (dayCount(rows[hi]) < 2 && rows.length > 2 && rows[hi].length > 2)) {
    // days down the first column?
    const col = rows.filter((r, i) => i > 0 && dayFromWord(r[0])).length;
    if (col >= 1 && rows[0]?.slice(1).some((c) => mealFromWord(file, c))) { across = false; hi = 0; } else if (hi < 0) { err(0, 'I could not find the days (Sun, Mon... or Sunday, Monday...) in the first row.'); return out; }
  }
  out.template = {};
  const meals = file.mealTypes || [];
  const names = meals.flatMap((m) => [m.en, m.he].filter(Boolean));
  const put = (day, meal, cell, n) => {
    if (!cell) return;
    const r = parseDishes(cell.replace(/\r?\n/g, ';'));
    if (r.errors.length) { r.errors.forEach((m) => err(n, m)); return; }
    const cur = out.template[day]?.[meal.id];
    addTo(out.template, day, meal.id, { items: [...(cur?.items || []), ...r.items].slice(0, LIMITS.dishes), note: cur?.note || '' });
  };
  if (across) {
    const head = rows[hi];
    let prev = null;
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.every((c) => !c)) continue;
      const first = row[0];
      let meal = prev;
      if (first) {
        meal = mealFromWord(file, first);
        if (!meal) { const g = didYouMean(first, names); err(r + 1, `unknown meal "${first}"${g ? `. Did you mean ${g}?` : '.'}`); continue; }
        prev = meal;
      } else if (!meal) { err(r + 1, 'This row has dishes but no meal name.'); continue; }
      for (let c = 1; c < head.length; c++) { const day = dayFromWord(head[c]); if (day) put(day, meal, row[c], r + 1); }
    }
  } else {
    const head = rows[0];
    for (let r = 1; r < rows.length; r++) {
      const day = dayFromWord(rows[r][0]);
      if (!day) { if (rows[r].some(Boolean)) err(r + 1, `unknown day "${rows[r][0] || ''}".`); continue; }
      for (let c = 1; c < head.length; c++) {
        if (!head[c]) continue;
        const meal = mealFromWord(file, head[c]);
        if (!meal) { const g = didYouMean(head[c], names); err(1, `unknown meal "${head[c]}"${g ? `. Did you mean ${g}?` : '.'}`); continue; }
        put(day, meal, rows[r][c], r + 1);
      }
    }
  }
  const seen = new Set(); out.errors = out.errors.filter((e) => { const k = `${e.line}|${e.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  tally(out);
  if (!out.errors.length && out.counts.meals === 0) out.errors.push({ line: 0, message: 'I found the days but no dishes.', row: true });
  return out;
}
function line2(c) { return String(c ?? '').replace(CTRL, (x) => (x === '\n' || x === '\r' ? x : ' ')).replace(/[ \t]+/g, ' ').trim().slice(0, LIMITS.sheetCell); }

/** Text from the paste box: a spreadsheet copy (tab-separated) or the text format; rows come from a picked .xlsx/.csv. */
export function parseMenuInput({ text, rows }, file) {
  if (Array.isArray(rows)) return parseSheet(rows, file);
  const t = String(text ?? '').replace(/^﻿/, '');
  const head = t.split(/\r?\n/).slice(0, 6).join('\n');
  if (/\t/.test(head) && !/^\s*[@#]/m.test(head)) return parseSheet(parseDelimited(t, '\t'), file);
  return parseMenuText(t, file);
}

/**
 * Apply a parsed paste to a document.
 * @param {{target?: {kind:'usual', set:number} | {kind:'week', weekStart:string}, mode?: 'replace'|'add', today?: string}} o
 * `target` places the weekday-based part (an "@ every ..." block or a spreadsheet); dated blocks go where they say.
 */
export function applyImport(file, parsed, { target, mode = 'replace', today } = {}) {
  if (parsed.errors?.length) bad('Fix the problems first.');
  const f = clone(file);
  const mergeWeek = (base, add) => { const w = clone(base || {}); for (const [d, ms] of Object.entries(add)) w[d] = { ...(w[d] || {}), ...clone(ms) }; return w; };
  if (parsed.template) {
    if (!target) bad('Choose where to put it.');
    if (target.kind === 'usual') {
      const set = Number(target.set) || 0;
      if (set < 0 || set >= Math.max(1, f.settings.cycleWeeks || 1)) bad('That rotation week does not exist.');
      const cur = set === 0 ? f.weekly : f.weeklyMore[set - 1];
      const next = mode === 'add' ? mergeWeek(cur, parsed.template) : clone(parsed.template);
      if (set === 0) f.weekly = next; else f.weeklyMore[set - 1] = next;
    } else if (target.kind === 'week') {
      if (!isISODate(target.weekStart) || dowOf(target.weekStart) !== 0) bad('A week starts on a Sunday.');
      f.weeks[target.weekStart] = mode === 'add' ? mergeWeek(f.weeks[target.weekStart] || baseWeek(f, target.weekStart).week, parsed.template) : clone(parsed.template);
    } else bad('Choose where to put it.');
  }
  for (const [ws, w] of Object.entries(parsed.weeks || {})) f.weeks[ws] = mode === 'add' ? mergeWeek(f.weeks[ws] || baseWeek(f, ws).week, w) : clone(w);
  for (const [d, ov] of Object.entries(parsed.dates || {})) {
    f.days[d] = mode === 'add' && f.days[d] ? { ...f.days[d], closed: f.days[d].closed || ov.closed, note: ov.note || f.days[d].note, noteHe: ov.noteHe || f.days[d].noteHe, meals: { ...f.days[d].meals, ...clone(ov.meals) } } : clone(ov);
  }
  return normalizeFile(f, { today });
}

const dishOut = (it) => {
  const name = it.en && it.he ? `${it.en} / ${it.he}` : (it.en || it.he);
  return `${name}${it.tags?.length ? ` [${it.tags.join(',')}]` : ''}`;
};
const mealOut = (mt, m) => {
  const nm = mt.en || mt.he;
  const dishes = m.items.length ? m.items.map(dishOut).join('; ') : '-';
  return `${nm}: ${dishes}${m.note ? ` // ${m.note}` : ''}`;
};

/** The paste format back out ("Copy as text"), for sharing with the kitchen. parse(format(x)) gives x again. */
export function formatMenuText(file, { set = 0, overrides = true } = {}) {
  const out = ['# TachTach menu v1'];
  const usual = weeklySet(file, set);
  for (const d of DAYS) {
    const ms = usual[d]; if (!ms) continue;
    const lines = file.mealTypes.filter((mt) => ms[mt.id]).map((mt) => mealOut(mt, ms[mt.id]));
    if (lines.length) out.push('', `@ every ${d}`, ...lines);
  }
  if (overrides) {
    for (const ws of Object.keys(file.weeks).sort()) {
      const w = file.weeks[ws];
      out.push('', `@ week ${ws}`);
      for (const d of DAYS) {
        const ms = w[d]; if (!ms) continue;
        const lines = file.mealTypes.filter((mt) => ms[mt.id]).map((mt) => `  ${mealOut(mt, ms[mt.id])}`);
        if (lines.length) out.push(DAYS_LONG[d], ...lines);
      }
    }
    for (const date of Object.keys(file.days).sort()) {
      const o = file.days[date];
      out.push('', `@ ${date}`);
      if (o.closed) out.push(`Closed: ${o.note || o.noteHe || ''}`.trimEnd());
      else if (o.note || o.noteHe) out.push(`Note: ${o.note || o.noteHe}`);
      for (const mt of file.mealTypes) if (o.meals[mt.id]) out.push(mealOut(mt, o.meals[mt.id]));
    }
  }
  return `${out.join('\n')}\n`;
}
const DAYS_LONG = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Shabbos: 'Shabbos' };

/** The request to copy into Claude (or any chat assistant) to turn a PDF/photo of the kitchen's menu into the paste format. */
export function menuClaudePrompt(file) {
  const meals = (file.mealTypes || []).map((m) => `${m.en || m.he}${m.en && m.he ? ` / ${m.he}` : ''}`).join(', ');
  const tags = (file.settings?.tags?.length ? file.settings.tags : TAG_IDS).join(', ');
  return `I will attach (or paste) a school's weekly meal menu: a photo, a PDF or a spreadsheet. Rewrite it in exactly this plain-text format and reply with ONLY that text in one code block, nothing else.

Format:
# TachTach menu v1
@ every Sun-Thu            (the usual week: "every" plus days, e.g. Mon, Sun-Thu, weekdays, every day)
Breakfast: Oatmeal [dairy]; Fresh fruit; Yogurt [dairy]
Lunch: Chicken schnitzel [meat]; Rice; Green salad
@ 2026-11-03               (one date that is different; "Closed: No meals - trip" closes the day)
Lunch: Pizza [dairy,gluten]; Salad
@ week 2026-11-08          (a whole week of its own, with a day name line before each day's meals)
Sunday
 Lunch: ...

Rules:
- One meal per line: "Meal name: dish; dish; dish". Separate dishes with a semicolon (never a comma, dishes can contain commas).
- Use only these meal names: ${meals}.
- Add tags in square brackets ONLY when the menu says it (or it is obvious, like a meat dish): ${tags}. Never guess an allergen; if unsure leave the tag out.
- A dish in two languages: "Chicken soup / מרק עוף". Keep Hebrew exactly as written.
- Do not invent dishes. Do not add student names. If a day or meal is missing in the source, leave that line out.
- Dates are YYYY-MM-DD. The week starts on Sunday.`;
}
