/**
 * Schedule-by-date storage: data/schedule-dates.json (per-date overrides),
 * data/schedule-blocks.json (reusable named day schedules), default category
 * seeding, and a per-date zmanim lookup for the admin's "Copy Claude prompt".
 *
 * schedule-dates.json  { "YYYY-MM-DD": { label, entries: [...], updatedAt } }
 *   A key that is present overrides that date even when entries is empty
 *   (see src/shared/scheduleResolution.js).
 * schedule-blocks.json { version: 1, seeded: [...markers], blocks: [{ id, name, label, entries, createdAt, updatedAt }] }
 */
import { v4 as uuidv4 } from 'uuid';
import { readJSON, writeJSON } from './storage.js';
import { findCategory, newCategoryId } from '../shared/schedulePaste.js';
import { fillCategoryKinds, inferKind, isKind as isKindValue } from '../shared/scheduleStages.js';
import { toISODate, addDaysISO, isISODate, dateFromISO } from '../shared/scheduleResolution.js';

export const DATES_FILE = 'schedule-dates.json';
export const BLOCKS_FILE = 'schedule-blocks.json';
const ZMANIM_FILE = 'zmanim-dates.json';

/** Owner's chosen starting categories (2026-10-14). Added if missing; never removed. */
export const DEFAULT_CATEGORIES = [
  { name: 'Davening', kind: 'davening', color: '#D4A84B', icon: 'prayer', defaultAlert: 5 },
  { name: 'Shiur', kind: 'seder', color: '#2DD4BF', icon: 'book', defaultAlert: 5 },
  { name: 'Seder', kind: 'seder', color: '#38BDF8', icon: 'book', defaultAlert: 5 },
  { name: 'Meals', kind: 'meal', color: '#F97316', icon: 'meal' },
  { name: 'Mivtzoim', color: '#EF4444', icon: 'megaphone' },
  { name: 'Farbrengen', color: '#EAB308', icon: 'music' },
  { name: 'Events', color: '#A855F7', icon: 'calendar' },
  { name: 'Trips', color: '#FACC15', icon: 'bus' },
  { name: 'Breaks', kind: 'break', color: '#A0696A', icon: 'coffee' },
];
const SEED_MARKER = 'default-categories-2026-10';
const ALERT_SEED_MARKER = 'category-default-alerts-2026-10';
/** Categories (matched like the parser does) that start with a 5-minute reminder. */
export const DEFAULT_ALERT_CATEGORIES = ['Davening', 'Learning', 'Shiur', 'Seder'];
export const DEFAULT_ALERT_MINUTES = 5;

/** Colors handed to categories created from a paste. */
const NEW_CATEGORY_PALETTE = ['#38BDF8', '#F472B6', '#84CC16', '#FB7185', '#22D3EE', '#EAB308', '#C084FC', '#F59E0B'];

/** Overrides older than this many days are dropped on write (kiosk payload stays small). */
const KEEP_PAST_DAYS = 60;

// One in-process queue for every read-modify-write of these files, so two
// quick saves can't interleave and lose one. (storage.js only locks a single
// write, not the read before it.)
let queue = Promise.resolve();
export function withScheduleLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export async function readScheduleDates() {
  const d = await readJSON(DATES_FILE);
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
}

export async function writeScheduleDates(dates) {
  const cutoff = addDaysISO(toISODate(new Date()), -KEEP_PAST_DAYS);
  const out = {};
  for (const key of Object.keys(dates).sort()) {
    if (!isISODate(key) || key < cutoff) continue;
    out[key] = dates[key];
  }
  await writeJSON(DATES_FILE, out);
  return out;
}

export async function readBlocksFile() {
  const b = await readJSON(BLOCKS_FILE);
  return {
    version: 1,
    seeded: Array.isArray(b?.seeded) ? b.seeded : [],
    blocks: Array.isArray(b?.blocks) ? b.blocks : [],
  };
}

export async function writeBlocksFile(file) {
  await writeJSON(BLOCKS_FILE, { version: 1, seeded: file.seeded || [], blocks: file.blocks || [] });
}

/**
 * Append categories (from a paste or the day editor) that don't exist yet.
 * Mutates and returns `schedule`; returns the list actually added.
 */
export function addCategories(schedule, newCats) {
  schedule.categories = Array.isArray(schedule.categories) ? schedule.categories : [];
  const added = [];
  for (const nc of newCats || []) {
    if (!nc?.name || findCategory(schedule.categories, nc.name)) continue;
    const id = schedule.categories.some((c) => c.id === nc.id) || !nc.id
      ? newCategoryId(schedule.categories, nc.name) : nc.id;
    const cat = {
      id,
      name: String(nc.name).trim().slice(0, 60),
      color: nc.color || NEW_CATEGORY_PALETTE[schedule.categories.length % NEW_CATEGORY_PALETTE.length],
      ...(nc.icon ? { icon: nc.icon } : {}),
      ...(nc.defaultAlert > 0 ? { defaultAlert: nc.defaultAlert } : {}),
      kind: isKindValue(nc.kind) ? nc.kind : (inferKind(nc.name) || 'other'),
    };
    schedule.categories.push(cat);
    added.push(cat);
  }
  return added;
}

/**
 * Add the owner's default categories that are missing (matched by name or
 * id, any case, singular/plural) — once. The marker in schedule-blocks.json
 * means a category the admin deletes later doesn't come back on restart.
 * @returns {Promise<object[]>} categories added
 */
export async function ensureDefaultCategories() {
  return withScheduleLock(async () => {
    const blocks = await readBlocksFile();
    if (blocks.seeded.includes(SEED_MARKER)) return [];
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const added = addCategories(schedule, DEFAULT_CATEGORIES.map((c) => ({ ...c, id: c.name.toLowerCase() })));
    if (added.length) await writeJSON('schedule.json', schedule);
    blocks.seeded.push(SEED_MARKER);
    await writeBlocksFile(blocks);
    return added;
  });
}

/**
 * Seed the 5-minute default reminder on learning + davening categories, once.
 * Never overrides a defaultAlert the owner already set (including 0 = none,
 * which the category editor stores by deleting the key — so a category the
 * owner explicitly cleared before this ran is indistinguishable; that is
 * fine because this only ever runs once, tracked by a marker).
 * @returns {Promise<string[]>} names of categories updated
 */
export async function ensureCategoryDefaultAlerts() {
  return withScheduleLock(async () => {
    const blocks = await readBlocksFile();
    if (blocks.seeded.includes(ALERT_SEED_MARKER)) return [];
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const updated = [];
    for (const c of schedule.categories || []) {
      if (c.defaultAlert !== undefined) continue;
      if (!DEFAULT_ALERT_CATEGORIES.some((n) => findCategory([c], n))) continue;
      c.defaultAlert = DEFAULT_ALERT_MINUTES;
      updated.push(c.name);
    }
    if (updated.length) await writeJSON('schedule.json', schedule);
    blocks.seeded.push(ALERT_SEED_MARKER);
    await writeBlocksFile(blocks);
    return updated;
  });
}

/**
 * Give every category without a `kind` one guessed from its name (Seder-ish -> seder, meals -> meal,
 * breaks -> break, davening -> davening, else other). Idempotent and safe on every start: a kind
 * that is already set (owner edits included) is never touched.
 * @returns {Promise<string[]>} names of categories that got a kind
 */
export async function ensureCategoryKinds() {
  return withScheduleLock(async () => {
    const schedule = await readJSON('schedule.json');
    if (!schedule || !Array.isArray(schedule.categories)) return [];
    const { categories, changed } = fillCategoryKinds(schedule.categories);
    if (changed.length) await writeJSON('schedule.json', { ...schedule, categories });
    return changed;
  });
}

/** Give each entry an id (keeps existing ones). */
export function withIds(entries) {
  return (entries || []).map((e) => ({ id: typeof e.id === 'string' && e.id ? e.id : uuidv4(), ...e }));
}

// ── Zmanim per date (for the Claude prompt) ────────────────────────────────

const inflight = new Map();

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
}

/**
 * Zmanim for each requested date: today's from cache.json, others from
 * data/zmanim-dates.json, else fetched from Chabad.org (existing fetcher) and
 * remembered. A date that can't be had maps to null (the prompt then shows a
 * clearly marked placeholder).
 * @param {string[]} dates
 * @returns {Promise<{ zmanim: Record<string, object|null>, parsha: string }>}
 */
export async function getZmanimForDates(dates) {
  const [cache, settings, stored] = await Promise.all([
    readJSON('cache.json'), readJSON('settings.json'), readJSON(ZMANIM_FILE),
  ]);
  const store = stored && typeof stored === 'object' ? stored : {};
  const out = {};
  const toFetch = [];
  // cache.zmanim.today is the zmanim for the local date of its last fetch.
  const cacheDay = cache?.zmanim?.fetchedAt ? toISODate(new Date(cache.zmanim.fetchedAt)) : null;
  for (const d of dates) {
    if (cacheDay === d && cache?.zmanim?.today) out[d] = cache.zmanim.today;
    else if (store[d]?.zmanim) out[d] = store[d].zmanim;
    else toFetch.push(d);
  }
  const locationId = settings?.location?.locationId || settings?.chabadLocationId;
  let changed = false;
  if (toFetch.length && locationId) {
    const { fetchZmanim } = await import('../fetchers/chabad.js');
    await Promise.all(toFetch.map(async (d) => {
      const key = `${locationId}:${d}`;
      if (!inflight.has(key)) {
        inflight.set(key, withTimeout(fetchZmanim(locationId, d), 8000).finally(() => inflight.delete(key)));
      }
      const z = await inflight.get(key);
      if (z && Object.keys(z).length) {
        out[d] = z;
        store[d] = { zmanim: z, fetchedAt: new Date().toISOString(), locationId };
        changed = true;
      } else {
        out[d] = null;
      }
    }));
  }
  for (const d of toFetch) if (!(d in out)) out[d] = null;
  if (changed) {
    const cutoff = addDaysISO(toISODate(new Date()), -14);
    for (const k of Object.keys(store)) if (k < cutoff) delete store[k];
    try { await writeJSON(ZMANIM_FILE, store); } catch { /* best effort */ }
  }

  // Parsha: the cached upcoming parsha if it falls on one of these dates.
  let parsha = '';
  const p = cache?.parsha;
  if (p?.name && p?.date && dates.includes(String(p.date).slice(0, 10))) {
    parsha = String(p.name).replace(/^Parash(at|as|ah)\s+/i, '');
  } else if (dates.some((d) => dateFromISO(d)?.getDay() === 6) && settings?.location?.zip) {
    try {
      const { fetchParsha } = await import('../fetchers/hebcal.js');
      const sat = dates.find((d) => dateFromISO(d)?.getDay() === 6);
      const r = await withTimeout(fetchParsha(settings.location.zip, dateFromISO(sat)), 6000);
      if (r?.name && String(r.date).slice(0, 10) === sat) parsha = String(r.name).replace(/^Parash(at|as|ah)\s+/i, '');
    } catch { /* optional */ }
  }
  return { zmanim: out, parsha };
}
