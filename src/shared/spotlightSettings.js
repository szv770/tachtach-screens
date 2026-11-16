/**
 * Spotlight settings and per-occasion fields: defaults, normalising, strict checks, and the one-time migration of the old
 * Countdown picks (pure; used by src/shared/occasions.js and src/shared/spotlight.js; tests in test/spotlight.test.js).
 * No new data file and no new top-level setting: this all lives INSIDE the occasions document (data/occasions.json,
 * scope org, class P0, names of days only).
 *
 * settings.spotlight = {
 *   v: 1,                                   migration guard
 *   pick: 'auto' | 'pinned' | 'queue',      auto = the nearest big day; pinned = a queue of ONE; queue = up to 6 occurrences
 *   queue: [{ id, startISO }],              startISO '' = "its next date" (only while inside leadDays)
 *   leadDays: 60,                           1-400: how long before its day a CHOSEN spotlight starts
 *   types: { order: [ids], off: [ids] },    the countdown kinds, their order, which are switched off
 *   typeMode: 'auto'|'order'|'random'|'one', oneType: 'flip',
 *   stages: { announce, month, twoWeeks, week, eve, lastHour, day }  7 booleans
 *   acts: { specialty, years, history, story, vort, photo }          6 booleans
 *   depth: 'auto' | 'short' | 'full',       how many story acts follow the countdown per round
 *   strip: { on, count 0-5, days 7-400, small }                      the side strip of other days
 * }
 * per occasion: history [{ year, en, he }] (8 x 140), vort { en, he, source } (400 / 400 / 140),
 *               spotlight { types: null | [ids], leadDays: null | 1-400 }.
 */
import { TYPE_IDS, TYPE_MODES, STAGE_IDS } from './spotlightTypes.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const lineOf = (v, max) => [...String(v ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
const paraOf = (v, max) => {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, ' ').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return [...s].slice(0, max).join('');
};
const intIn = (v, min, max, d) => { const n = typeof v === 'string' && v.trim() ? Number(v) : v; return Number.isInteger(n) && n >= min && n <= max ? n : d; };
const validDate = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

export const SPOTLIGHT_LIMITS = Object.freeze({ queue: 6, history: 8, historyText: 140, vort: 400, vortSource: 140, historyYearMin: 1, historyYearMax: 6000 });
export const SPOTLIGHT_PICKS = Object.freeze(['auto', 'pinned', 'queue']);
export const SPOTLIGHT_PICK_LABEL = Object.freeze({ auto: 'Automatic (the nearest big day)', pinned: 'The day I choose', queue: 'A line-up: after one, the next' });
export const SPOTLIGHT_DEPTHS = Object.freeze(['auto', 'short', 'full']);
export const SPOTLIGHT_ACTS = Object.freeze(['specialty', 'years', 'history', 'story', 'vort', 'photo']);
export const SPOTLIGHT_RANGES = Object.freeze({ leadDays: { min: 1, max: 400 }, stripCount: { min: 0, max: 5 }, stripDays: { min: 7, max: 400 } });
export const SPOTLIGHT_STAGE_LABEL = Object.freeze({ announce: 'Announcing', month: 'A month out', twoWeeks: 'Two weeks', week: 'The last week', eve: 'The last evening', lastHour: 'The last hour', day: 'The day itself' });

const allOn = (keys) => Object.freeze(Object.fromEntries(keys.map((k) => [k, true])));
export const SPOTLIGHT_DEFAULTS = Object.freeze({
  v: 1,
  pick: 'auto',
  queue: Object.freeze([]),
  leadDays: 60,
  types: Object.freeze({ order: TYPE_IDS, off: Object.freeze([]) }),
  typeMode: 'auto',
  oneType: 'flip',
  stages: allOn(STAGE_IDS),
  acts: allOn(SPOTLIGHT_ACTS),
  depth: 'auto',
  strip: Object.freeze({ on: true, count: 3, days: 30, small: true }),
});
export const SPOTLIGHT_KEYS = Object.freeze(Object.keys(SPOTLIGHT_DEFAULTS));
export const OCC_SPOTLIGHT_DEFAULT = Object.freeze({ types: null, leadDays: null });

const typeIds = (raw) => (Array.isArray(raw) ? [...new Set(raw.filter((t) => TYPE_IDS.includes(t)))] : []);
const bools = (raw, keys, d) => Object.fromEntries(keys.map((k) => [k, isObj(raw) && typeof raw[k] === 'boolean' ? raw[k] : d[k]]));

/** [{ id, startISO }]: valid ids, startISO '' or a real date, no duplicates, at most 6. */
export function normalizeQueue(raw) {
  if (!Array.isArray(raw)) return [];
  const out = []; const seen = new Set();
  for (const e of raw) {
    if (!isObj(e) || typeof e.id !== 'string' || !ID.test(e.id)) continue;
    const startISO = validDate(e.startISO) ? e.startISO : '';
    const k = `${e.id}|${startISO}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push({ id: e.id, startISO });
    if (out.length >= SPOTLIGHT_LIMITS.queue) break;
  }
  return out;
}

/** What the OLD Countdown settings mean as a spotlight (the one-time migration, also used when an old admin edits old keys). */
export function legacyToSpotlight(s) {
  const o = isObj(s) ? s : {};
  const out = {};
  if (o.pick === 'pinned' && typeof o.pinnedId === 'string' && ID.test(o.pinnedId)) { out.pick = 'pinned'; out.queue = [{ id: o.pinnedId, startISO: '' }]; } else out.pick = 'auto'; // nearest and cycle -> auto
  if (o.display === 'flip') { out.typeMode = 'one'; out.oneType = 'flip'; } else out.typeMode = 'auto';
  return out;
}

/** The old keys the settings still carry for one release, derived from the spotlight (additive). */
export function spotlightToLegacy(sp) {
  return {
    pick: sp.pick === 'auto' ? 'nearest' : 'pinned',
    pinnedId: sp.pick !== 'auto' && sp.queue[0] ? sp.queue[0].id : '',
    display: sp.typeMode === 'one' && sp.oneType === 'flip' ? 'flip' : 'classic',
  };
}

/** Complete spotlight settings. `rawSettings` (the whole old settings object) feeds the migration when `raw` has no version. */
export function normalizeSpotlight(raw, rawSettings) {
  const D = SPOTLIGHT_DEFAULTS;
  const migrated = isObj(raw) && raw.v >= 1 ? raw : { ...(isObj(raw) ? raw : {}), ...legacyToSpotlight(rawSettings) };
  const r = migrated;
  const types = isObj(r.types) ? r.types : {};
  const off = typeIds(types.off);
  const given = typeIds(types.order);
  const order = [...given, ...TYPE_IDS.filter((t) => !given.includes(t))];
  const strip = isObj(r.strip) ? r.strip : {};
  const pick = SPOTLIGHT_PICKS.includes(r.pick) ? r.pick : D.pick;
  let queue = normalizeQueue(r.queue);
  if (pick === 'pinned') queue = queue.slice(0, 1);
  return {
    v: 1,
    pick,
    queue,
    leadDays: intIn(r.leadDays, SPOTLIGHT_RANGES.leadDays.min, SPOTLIGHT_RANGES.leadDays.max, D.leadDays),
    types: { order, off: off.length >= TYPE_IDS.length ? [] : off }, // all switched off = none switched off (the slide must show something)
    typeMode: TYPE_MODES.includes(r.typeMode) ? r.typeMode : D.typeMode,
    oneType: TYPE_IDS.includes(r.oneType) ? r.oneType : D.oneType,
    stages: bools(r.stages, STAGE_IDS, D.stages),
    acts: bools(r.acts, SPOTLIGHT_ACTS, D.acts),
    depth: SPOTLIGHT_DEPTHS.includes(r.depth) ? r.depth : D.depth,
    strip: {
      on: typeof strip.on === 'boolean' ? strip.on : D.strip.on,
      count: intIn(strip.count, SPOTLIGHT_RANGES.stripCount.min, SPOTLIGHT_RANGES.stripCount.max, D.strip.count),
      days: intIn(strip.days, SPOTLIGHT_RANGES.stripDays.min, SPOTLIGHT_RANGES.stripDays.max, D.strip.days),
      small: typeof strip.small === 'boolean' ? strip.small : D.strip.small,
    },
  };
}

/** Strict check of a spotlight object (a whole or partial one from the admin): null when fine, else plain English. */
export function spotlightProblem(v) {
  if (!isObj(v)) return 'Spotlight: settings as an object.';
  const boolMap = (x, keys, what) => {
    if (!isObj(x)) return `${what}: a list of on/off switches.`;
    for (const [k, b] of Object.entries(x)) { if (!keys.includes(k)) return `${what}: unknown item ${String(k).slice(0, 20)}.`; if (typeof b !== 'boolean') return `${what}: on or off.`; }
    return null;
  };
  for (const [k, x] of Object.entries(v)) {
    if (!SPOTLIGHT_KEYS.includes(k)) return `Unknown spotlight setting: ${String(k).slice(0, 40)}.`;
    if (k === 'v') { if (x !== 1) return 'Spotlight version: 1.'; } else if (k === 'pick') { if (!SPOTLIGHT_PICKS.includes(x)) return 'Spotlight: automatic, one day, or a line-up.'; } else if (k === 'queue') {
      if (!Array.isArray(x) || x.length > SPOTLIGHT_LIMITS.queue) return `The line-up is ${SPOTLIGHT_LIMITS.queue} days at most.`;
      for (const e of x) {
        if (!isObj(e) || typeof e.id !== 'string' || !ID.test(e.id)) return 'That day is not on the list.';
        if (e.startISO != null && e.startISO !== '' && !validDate(e.startISO)) return 'The date of a line-up day: year-month-day.';
      }
    } else if (k === 'leadDays') { if (intIn(x, 1, 400, null) == null) return 'How early the spotlight starts: 1 to 400 days.'; } else if (k === 'types') {
      if (!isObj(x)) return 'Countdown kinds: an order and a list switched off.';
      for (const [kk, list] of Object.entries(x)) {
        if (kk !== 'order' && kk !== 'off') return 'Countdown kinds: an order and a list switched off.';
        if (!Array.isArray(list) || list.some((t) => !TYPE_IDS.includes(t)) || new Set(list).size !== list.length) return 'Countdown kinds: only the listed kinds, each once.';
      }
    } else if (k === 'typeMode') { if (!TYPE_MODES.includes(x)) return 'Order of the countdown kinds: automatic, my order, random or always one.'; } else if (k === 'oneType') { if (!TYPE_IDS.includes(x)) return 'Countdown kind: one of the listed kinds.'; } else if (k === 'stages') { const m = boolMap(x, STAGE_IDS, 'Stages'); if (m) return m; } else if (k === 'acts') { const m = boolMap(x, SPOTLIGHT_ACTS, 'Story parts'); if (m) return m; } else if (k === 'depth') { if (!SPOTLIGHT_DEPTHS.includes(x)) return 'Story parts per round: automatic, short or full.'; } else if (k === 'strip') {
      if (!isObj(x)) return 'Side strip: on or off, how many, how far ahead.';
      for (const [kk, b] of Object.entries(x)) {
        if (kk === 'on' || kk === 'small') { if (typeof b !== 'boolean') return 'Side strip: on or off.'; } else if (kk === 'count') { if (intIn(b, 0, 5, null) == null) return 'Side strip: 0 to 5 days.'; } else if (kk === 'days') { if (intIn(b, 7, 400, null) == null) return 'Side strip looks ahead 7 to 400 days.'; } else return `Unknown side strip setting: ${String(kk).slice(0, 20)}.`;
      }
    }
  }
  return null;
}

// ── per occasion ────────────────────────────────────────────────────────────

/** [{ year, en, he }]: at most 8 lines, 140 characters each; a line with no text is dropped; sorted oldest first. */
export function normalizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!isObj(e)) continue;
    const en = lineOf(e.en, SPOTLIGHT_LIMITS.historyText); const he = lineOf(e.he, SPOTLIGHT_LIMITS.historyText);
    if (!en && !he) continue;
    out.push({ year: intIn(e.year, SPOTLIGHT_LIMITS.historyYearMin, SPOTLIGHT_LIMITS.historyYearMax, null), en, he });
    if (out.length >= SPOTLIGHT_LIMITS.history) break;
  }
  return out.sort((a, b) => (a.year ?? 1e9) - (b.year ?? 1e9));
}
export function historyProblem(raw) {
  if (!Array.isArray(raw)) return 'This day in history: a list of lines.';
  if (raw.length > SPOTLIGHT_LIMITS.history) return `This day in history: ${SPOTLIGHT_LIMITS.history} lines at most.`;
  for (const e of raw) {
    if (!isObj(e)) return 'This day in history: a year and a line of text.';
    for (const k of ['en', 'he']) {
      if (e[k] != null && typeof e[k] !== 'string') return 'Text only, please.';
      if ([...String(e[k] || '').trim()].length > SPOTLIGHT_LIMITS.historyText) return `A history line is ${SPOTLIGHT_LIMITS.historyText} characters at most.`;
    }
    if (e.year != null && e.year !== '' && intIn(e.year, SPOTLIGHT_LIMITS.historyYearMin, SPOTLIGHT_LIMITS.historyYearMax, null) == null) return 'The year of a history line: a number such as 5747.';
  }
  return null;
}

/** { en, he, source } or null when empty. */
export function normalizeVort(raw) {
  if (!isObj(raw)) return null;
  const en = paraOf(raw.en, SPOTLIGHT_LIMITS.vort); const he = paraOf(raw.he, SPOTLIGHT_LIMITS.vort);
  if (!en && !he) return null;
  return { en, he, source: lineOf(raw.source, SPOTLIGHT_LIMITS.vortSource) };
}
export function vortProblem(raw) {
  if (!isObj(raw)) return 'The short teaching: text and a source.';
  for (const [k, max] of [['en', SPOTLIGHT_LIMITS.vort], ['he', SPOTLIGHT_LIMITS.vort], ['source', SPOTLIGHT_LIMITS.vortSource]]) {
    if (raw[k] != null && typeof raw[k] !== 'string') return 'Text only, please.';
    if ([...String(raw[k] || '').trim()].length > max) return k === 'source' ? `The source is ${max} characters at most.` : `The short teaching is ${max} characters at most.`;
  }
  return null;
}

/** { types: null | [ids], leadDays: null | n }. `legacyDisplay` ('flip') feeds the one-time migration when `raw` is absent. */
export function normalizeOccSpotlight(raw, legacyDisplay) {
  if (raw === undefined && legacyDisplay === 'flip') return { types: ['flip'], leadDays: null };
  const r = isObj(raw) ? raw : {};
  const types = Array.isArray(r.types) ? typeIds(r.types) : [];
  return { types: types.length ? types : null, leadDays: intIn(r.leadDays, 1, 400, null) };
}
export function occSpotlightProblem(raw) {
  if (!isObj(raw)) return 'This day’s spotlight options: kinds and lead time.';
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'types') { if (v != null && (!Array.isArray(v) || v.length < 1 || v.some((t) => !TYPE_IDS.includes(t)) || new Set(v).size !== v.length)) return 'Countdown kinds for this day: at least one, only the listed kinds.'; } else if (k === 'leadDays') { if (v != null && v !== '' && intIn(v, 1, 400, null) == null) return 'How early this day starts: 1 to 400 days.'; } else return `Unknown spotlight option: ${String(k).slice(0, 20)}.`;
  }
  return null;
}
