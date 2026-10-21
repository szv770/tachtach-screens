/**
 * The CHAZAN rotation: who leads Shacharis / Mincha / Maariv on each day.
 *
 * Pure (no fs, no React): used by the server routes + store, the kiosk, and the admin, and unit tested.
 * Dates are civil 'YYYY-MM-DD' strings and all date maths is done in UTC at noon, so DST never matters.
 *
 * MODEL
 *   order     the list the owner arranges (ids of people on the roster). Shown in the admin.
 *   queue     the LIVE line: front = due next, back = furthest from his turn. Whoever goes moves to the back,
 *             so with no exceptions the queue just walks round `order` and wraps (everyone gets one turn per round).
 *   cursor    the date the queue is "as of" (the start of that day, before any davening). Days before the cursor
 *             are HISTORY: `history[date] = { Shacharis: id|null, ... }`, frozen, never recomputed.
 *   settings  grid (which davenings run on which weekdays) + Shabbos/Rosh Chodesh/Yom Tov switches + fill rule + display.
 *   away      { id: [{ from, to }] }  (to = null: until he is marked back). Away people are skipped and rejoin.
 *   can       { id: ['Mincha', ...] } a person who can only lead some davenings (absent = all).
 *   overrides { date: { tefila: id } }  swaps made by the owner for one davening.
 *
 * Walking a davening (slot) in order: D = the first person in the queue who may lead this tefila (people who may not
 * keep their place silently).
 *   - swapped by the owner:  P leads, goes to the back; D is "displaced" (see the fill rule).
 *   - D is here:             D leads, goes to the back.
 *   - D is away:             the fill rule decides (below).
 * Fill rule ("When someone is swapped out" and when an away person was due):
 *   furthest     (a) the person furthest from his turn (back of the queue) covers; D's turn counts as taken (D to the
 *                    back), so nobody who saw he is next is moved.
 *   manual       (b) nothing is filled by itself, the davening shows "Pick someone". A swap picked by the owner works
 *                    like (a) for the queue.
 *   displacedNext(c) D keeps his place and goes at the next davening he can; everyone after shifts one later. Away: the
 *                    next in line steps up for now and D goes first on his return. Swap suggestion: the furthest person.
 *   skip         (d) D is just skipped (to the back); the next in line steps up and everyone shifts up.
 */

export const TEFILOS = Object.freeze(['Shacharis', 'Mincha', 'Maariv']);
export const TEFILA_HE = Object.freeze({ Shacharis: 'שחרית', Mincha: 'מנחה', Maariv: 'מעריב' });
export const FILL_RULES = Object.freeze(['furthest', 'manual', 'displacedNext', 'skip']);
export const FILL_RULE_INFO = Object.freeze({
  furthest: { label: 'Fill with the person furthest from his turn', hint: 'The person who went most recently covers. Nobody who knows he is next gets moved.' },
  manual: { label: 'I pick someone every time', hint: 'The davening shows "Pick someone" until you choose.' },
  displacedNext: { label: 'He goes at the next davening', hint: 'The person swapped out keeps his turn and goes next; everyone after him shifts one later.' },
  skip: { label: 'Just skip him', hint: 'He waits for the next round and everyone after him shifts up.' },
});
export const LIMITS = Object.freeze({ order: 300, ranges: 20, overrideDays: 500, historyDays: 400, maxSkipDays: 800 });
export const DAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos']);
export const DAY_SHORT = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos']);

const allOf = (v) => Object.fromEntries(TEFILOS.map((t) => [t, v]));
const day = (S, M, A) => ({ Shacharis: S, Mincha: M, Maariv: A });

/** Grid presets: index 0 = Sunday ... 6 = Saturday (Shabbos). */
export const GRID_PRESETS = Object.freeze({
  weekdays: {
    label: 'Weekdays only', shabbos: false,
    grid: [day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 0, 0), day(0, 0, 0)].map(boolGrid),
  },
  weekdaysFriMincha: {
    label: 'Weekdays + Friday Mincha', shabbos: false,
    grid: [day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 1, 1), day(1, 1, 0), day(0, 0, 0)].map(boolGrid),
  },
  everything: {
    label: 'Everything incl. Shabbos', shabbos: true,
    grid: Array.from({ length: 7 }, () => allOf(true)),
  },
});
function boolGrid(d) { return Object.fromEntries(TEFILOS.map((t) => [t, !!d[t]])); }

export const DEFAULT_SETTINGS = Object.freeze({
  grid: GRID_PRESETS.weekdays.grid,
  shabbos: false,        // master switch for the Saturday column
  roshChodesh: true,     // run on Rosh Chodesh days
  yomTov: false,         // run on Yom Tov days
  fill: 'furthest',
  names: 'full',         // 'full' | 'short' (first + last initial), same as the birthday setting
  hebrewLabels: true,    // show שחרית / מנחה / מעריב beside the English
  showOnSchedule: true,  // chazan name on the davening rows of the schedule
  rail: true,            // 'Mincha chazan: Moshe' card in the rail near the time
  railMinutes: 45,
});

export function normalizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const g = Array.isArray(o.grid) ? o.grid : null;
  const grid = Array.from({ length: 7 }, (_, i) => {
    const row = g && g[i] && typeof g[i] === 'object' ? g[i] : DEFAULT_SETTINGS.grid[i];
    return Object.fromEntries(TEFILOS.map((t) => [t, row[t] === true]));
  });
  const rm = parseInt(o.railMinutes, 10);
  return {
    grid,
    shabbos: o.shabbos === true,
    roshChodesh: o.roshChodesh !== false,
    yomTov: o.yomTov === true,
    fill: FILL_RULES.includes(o.fill) ? o.fill : DEFAULT_SETTINGS.fill,
    names: o.names === 'short' ? 'short' : 'full',
    hebrewLabels: o.hebrewLabels !== false,
    showOnSchedule: o.showOnSchedule !== false,
    rail: o.rail !== false,
    railMinutes: Number.isFinite(rm) ? Math.min(180, Math.max(5, rm)) : DEFAULT_SETTINGS.railMinutes,
  };
}

/** Which preset (if any) the current grid matches — for the chips in the admin. */
export function matchPreset(settings) {
  const s = normalizeSettings(settings);
  for (const [id, p] of Object.entries(GRID_PRESETS)) {
    if (p.shabbos === s.shabbos && p.grid.every((r, i) => TEFILOS.every((t) => r[t] === s.grid[i][t]))) return id;
  }
  return null;
}
export const applyPreset = (settings, id) => {
  const p = GRID_PRESETS[id];
  return p ? { ...normalizeSettings(settings), grid: p.grid.map((r) => ({ ...r })), shabbos: p.shabbos } : normalizeSettings(settings);
};

// ── Dates ────────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isISO = (s) => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
export const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

let heFmt = null;
const hdCache = new Map();
function hebrewDate(iso) {
  if (hdCache.has(iso)) return hdCache.get(iso);
  if (!heFmt) heFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  const [y, m, d] = iso.split('-').map(Number);
  const parts = heFmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const out = { month: String(parts.find((p) => p.type === 'month')?.value || '').trim(), d: parseInt(parts.find((p) => p.type === 'day')?.value, 10) };
  if (hdCache.size > 900) hdCache.clear();
  hdCache.set(iso, out);
  return out;
}

/** Rosh Chodesh = the 30th and the 1st of a month (Tishrei 1 is Rosh Hashana, a Yom Tov). */
export function isRoshChodesh(iso) { const h = hebrewDate(iso); return h.d === 30 || (h.d === 1 && h.month !== 'Tishri'); }
const YT = { Tishri: [1, 2, 10, 15, 16, 22, 23], Nisan: [15, 16, 21, 22], Sivan: [6, 7] };
/** Yom Tov (outside Israel): Rosh Hashana, Yom Kippur, Sukkos, Shemini Atzeres/Simchas Torah, Pesach, Shavuos. Chol Hamoed is not. */
export function isYomTov(iso) { const h = hebrewDate(iso); return !!YT[h.month]?.includes(h.d); }

const MONTH_ALIAS = { Tishrei: 'Tishri', Cheshvan: 'Heshvan', Teves: 'Tevet', Nissan: 'Nisan', Tammuz: 'Tamuz', Iyyar: 'Iyar' };
/** Does a Custom Day (from data/custom-days.json) fall on this date? */
export function customDayOn(d, iso) {
  if (!d || typeof d !== 'object') return false;
  if (d.enabled === false) return false;
  if (d.hebrewMonth) {
    const h = hebrewDate(iso);
    const want = MONTH_ALIAS[d.hebrewMonth] || d.hebrewMonth;
    const monthOk = want === h.month || (want === 'Adar' && /^Adar/.test(h.month)) || (want === 'Adar II' && h.month === 'Adar');
    return monthOk && Number(d.hebrewDay) === h.d && (d.recurring !== false || !d.date || d.date === iso);
  }
  if (d.gregorianMonth) { const [, m, dd] = iso.split('-').map(Number); return d.gregorianMonth === m && d.gregorianDay === dd; }
  if (d.date) return d.date === iso;
  return false;
}
export const hasNoChazanDay = (customDays, iso) => (customDays || []).some((d) => d && d.noChazan === true && customDayOn(d, iso));

/** Which davenings run on this date (a subset of TEFILOS, in order), and why none if none. */
export function tefilosOn(settings, iso, customDays = []) {
  const s = settings && settings.grid ? settings : normalizeSettings(settings);
  const w = dowOf(iso);
  if (w === 6 && !s.shabbos) return { list: [], why: 'Shabbos' };
  if (hasNoChazanDay(customDays, iso)) return { list: [], why: 'No chazan today' };
  if (!s.roshChodesh && isRoshChodesh(iso)) return { list: [], why: 'Rosh Chodesh' };
  if (!s.yomTov && isYomTov(iso)) return { list: [], why: 'Yom Tov' };
  const row = s.grid[w];
  return { list: TEFILOS.filter((t) => row[t]), why: '' };
}

// ── State ────────────────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{4,40}$/;
const uniq = (list) => [...new Set(list)];

export function normalizeAway(a, order) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const [id, ranges] of Object.entries(a)) {
    if (!ID.test(id) || (order && !order.includes(id)) || !Array.isArray(ranges)) continue;
    const rs = [];
    for (const r of ranges.slice(0, LIMITS.ranges)) {
      if (!r || !isISO(r.from)) continue;
      const to = r.to === null || r.to === undefined || r.to === '' ? null : r.to;
      if (to !== null && (!isISO(to) || to < r.from)) continue;
      rs.push({ from: r.from, to });
    }
    if (rs.length) out[id] = rs.sort((x, y) => x.from.localeCompare(y.from));
  }
  return out;
}
export function normalizeCan(c, order) {
  const out = {};
  if (!c || typeof c !== 'object') return out;
  for (const [id, list] of Object.entries(c)) {
    if (!ID.test(id) || (order && !order.includes(id)) || !Array.isArray(list)) continue;
    const t = TEFILOS.filter((x) => list.includes(x));
    if (t.length && t.length < TEFILOS.length) out[id] = t;
  }
  return out;
}
export function normalizeOverrides(o, order, fromISO) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const date of Object.keys(o).slice(0, LIMITS.overrideDays * 2)) {
    if (!isISO(date) || (fromISO && date < fromISO) || !o[date] || typeof o[date] !== 'object') continue;
    for (const t of TEFILOS) {
      const id = o[date][t];
      if (typeof id === 'string' && ID.test(id) && (!order || order.includes(id))) (out[date] ||= {})[t] = id;
    }
    if (Object.keys(out).length >= LIMITS.overrideDays) break;
  }
  return out;
}
function normalizeHistory(h, todayISO) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  const floor = todayISO ? addDays(todayISO, -LIMITS.historyDays) : '';
  for (const date of Object.keys(h)) {
    if (!isISO(date) || date < floor || !h[date] || typeof h[date] !== 'object') continue;
    for (const t of TEFILOS) {
      if (!(t in h[date])) continue;
      const id = h[date][t];
      (out[date] ||= {})[t] = typeof id === 'string' && ID.test(id) ? id : null;
    }
  }
  return out;
}

export const emptyState = (todayISO) => ({
  version: 1, settings: normalizeSettings(), order: [], queue: [], cursor: todayISO || '', away: {}, can: {}, overrides: {}, history: {},
});

/** Any stored value → a clean state. `todayISO` is used to give a never-started rotation its cursor. */
export function normalizeState(file, todayISO) {
  const f = file && typeof file === 'object' ? file : {};
  const order = uniq((Array.isArray(f.order) ? f.order : []).filter((id) => typeof id === 'string' && ID.test(id))).slice(0, LIMITS.order);
  let queue = uniq((Array.isArray(f.queue) ? f.queue : []).filter((id) => order.includes(id)));
  queue = [...queue, ...order.filter((id) => !queue.includes(id))];
  const cursor = isISO(f.cursor) ? f.cursor : (todayISO || '');
  return {
    version: 1,
    settings: normalizeSettings(f.settings),
    order, queue, cursor,
    away: normalizeAway(f.away, order),
    can: normalizeCan(f.can, order),
    overrides: normalizeOverrides(f.overrides, order, cursor || undefined),
    history: normalizeHistory(f.history, todayISO || cursor),
  };
}

/** Drop people who are no longer on the roster (history keeps their id). */
export function reconcile(state, validIds) {
  const ok = new Set(validIds);
  if (state.order.every((id) => ok.has(id))) return state;
  return normalizeState({ ...state, order: state.order.filter((id) => ok.has(id)), queue: state.queue.filter((id) => ok.has(id)) }, state.cursor);
}

export function isAway(state, id, iso) {
  const rs = state.away?.[id];
  if (!rs) return false;
  return rs.some((r) => r.from <= iso && (r.to === null || r.to >= iso));
}
/** Is he away right now / from when until when (the range covering `iso`, or the next one). */
export function awayRange(state, id, iso) {
  const rs = state.away?.[id] || [];
  return rs.find((r) => r.from <= iso && (r.to === null || r.to >= iso)) || rs.find((r) => r.from > iso) || null;
}
export const canLead = (state, id, tefila) => { const c = state.can?.[id]; return !c || c.includes(tefila); };

// ── The walk ─────────────────────────────────────────────────────────────────

const toBack = (queue, id) => { const i = queue.indexOf(id); if (i >= 0) queue.splice(i, 1); queue.push(id); };

/** Who would cover if `due` cannot lead: by the fill rule. Returns an id or null. */
function coverBy(state, queue, due, iso, tefila, rule, led = new Set()) {
  const here = (id) => id !== due && !isAway(state, id, iso) && canLead(state, id, tefila);
  if (rule === 'furthest') {
    // Furthest from his turn; somebody who has already led earlier today only if there is nobody else.
    for (let i = queue.length - 1; i >= 0; i--) if (here(queue[i]) && !led.has(queue[i])) return queue[i];
    for (let i = queue.length - 1; i >= 0; i--) if (here(queue[i])) return queue[i];
    return null;
  }
  if (rule === 'skip' || rule === 'displacedNext') { // next in line after due
    const at = queue.indexOf(due);
    for (let i = at + 1; i < queue.length; i++) if (here(queue[i])) return queue[i];
    for (let i = 0; i < at; i++) if (here(queue[i])) return queue[i];
    return null;
  }
  return null;
}

/** Who the fill rule would suggest for a SWAP of the due person (the swap sheet uses this). */
export function swapSuggestion(state, queue, due, iso, tefila, led = new Set()) {
  const rule = state.settings.fill;
  if (rule === 'manual') return null;
  return coverBy(state, queue, due, iso, tefila, rule === 'skip' ? 'skip' : 'furthest', led);
}

/**
 * One davening. Mutates `queue`. Returns { id, how, displacedId?, due? }.
 * how: 'rotation' | 'swap' | 'cover' (an away person's place filled by the rule) | 'pick' (nobody yet, owner must pick) | 'none'.
 */
function walkSlot(state, queue, iso, tefila, led = new Set()) {
  const r = walkSlotInner(state, queue, iso, tefila, led);
  if (r.id) led.add(r.id);
  return r;
}
function walkSlotInner(state, queue, iso, tefila, led) {
  const rule = state.settings.fill;
  const D = queue.find((id) => canLead(state, id, tefila));
  if (!D) return { id: null, how: 'none' };
  const away = isAway(state, D, iso);
  const ov = state.overrides?.[iso]?.[tefila];
  if (ov && queue.includes(ov) && !(ov === D && !away)) {
    if (ov === D) { toBack(queue, D); return { id: D, how: 'rotation' }; }
    toBack(queue, ov);
    if (rule !== 'displacedNext') toBack(queue, D);
    return { id: ov, how: 'swap', displacedId: D };
  }
  if (!away) { toBack(queue, D); return { id: D, how: 'rotation' }; }
  // D is away: the fill rule.
  if (rule === 'manual') return { id: null, how: 'pick', displacedId: D };
  const cover = coverBy(state, queue, D, iso, tefila, rule === 'furthest' ? 'furthest' : 'skip', led);
  if (!cover) return { id: null, how: 'none', displacedId: D };
  toBack(queue, cover);
  if (rule === 'furthest' || rule === 'skip') toBack(queue, D); // his turn counts as taken
  return { id: cover, how: 'cover', displacedId: D };
}

function walkDay(state, queue, iso, customDays) {
  const { list, why } = tefilosOn(state.settings, iso, customDays);
  const slots = {};
  const led = new Set();
  for (const t of list) slots[t] = walkSlot(state, queue, iso, t, led);
  return { slots, off: why };
}

/**
 * Move the cursor to `todayISO`, freezing every day in between into history. Returns a new state (same object when
 * nothing to do). Settings changes made later never touch what is frozen here.
 */
export function rollover(state, todayISO, customDays = []) {
  if (!isISO(todayISO)) return state;
  if (!state.cursor) return { ...state, cursor: todayISO };
  if (state.cursor >= todayISO) return state;
  const queue = [...state.queue];
  const history = { ...state.history };
  let d = state.cursor;
  const gap = daysBetween(d, todayISO);
  // A very long gap (box off for ages): only the last stretch is worth keeping, but the queue still moves.
  for (let i = 0; d < todayISO && i < LIMITS.maxSkipDays; i++, d = addDays(d, 1)) {
    const { slots } = walkDay(state, queue, d, customDays);
    if (gap - i <= LIMITS.historyDays) {
      const rec = {};
      for (const [t, s] of Object.entries(slots)) rec[t] = s.id;
      if (Object.keys(rec).length) history[d] = rec;
    }
  }
  const floor = addDays(todayISO, -LIMITS.historyDays);
  for (const k of Object.keys(history)) if (k < floor) delete history[k];
  const overrides = Object.fromEntries(Object.entries(state.overrides || {}).filter(([k]) => k >= todayISO));
  return { ...state, queue, cursor: todayISO, history, overrides };
}

/**
 * The assignments for each date in [fromISO, toISO]:
 *   [{ date, dow, off: '' | 'Shabbos' | ..., slots: [{ tefila, id|null, how, displacedId? }] }]
 * Dates before the cursor come from history (never recomputed); the rest are worked out from the cursor.
 */
export function assignments(state, fromISO, toISO, customDays = []) {
  const out = [];
  if (!isISO(fromISO) || !isISO(toISO) || toISO < fromISO) return out;
  const cursor = state.cursor || fromISO;
  const queue = [...state.queue];
  const future = new Map();
  if (toISO >= cursor) {
    for (let d = cursor, i = 0; d <= toISO && i < LIMITS.maxSkipDays; d = addDays(d, 1), i++) {
      const r = walkDay(state, queue, d, customDays);
      if (d >= fromISO) future.set(d, r);
    }
  }
  for (let d = fromISO, i = 0; d <= toISO && i < 400; d = addDays(d, 1), i++) {
    if (d < cursor) {
      const h = state.history?.[d] || {};
      out.push({
        date: d, dow: dowOf(d), off: '', past: true,
        slots: TEFILOS.filter((t) => t in h).map((t) => ({ tefila: t, id: h[t], how: 'history' })),
      });
    } else {
      const r = future.get(d) || { slots: {}, off: '' };
      out.push({ date: d, dow: dowOf(d), off: r.off, past: false, slots: Object.entries(r.slots).map(([tefila, s]) => ({ tefila, ...s })) });
    }
  }
  return out;
}

/** The slot for one date + tefila, or null when that davening does not run. */
export function slotFor(state, iso, tefila, customDays = []) {
  const day1 = assignments(state, iso, iso, customDays)[0];
  return day1?.slots.find((s) => s.tefila === tefila) || null;
}

/**
 * For the swap sheet: who is due for date + tefila, who the fill rule suggests, and everybody who could cover, best first
 * (furthest from his turn first). Ignores any swap already made for that slot.
 */
export function swapOptions(state, iso, tefila, customDays = []) {
  const s = { ...state, overrides: { ...state.overrides, [iso]: { ...(state.overrides?.[iso] || {}) } } };
  delete s.overrides[iso][tefila];
  const cursor = s.cursor || iso;
  if (iso < cursor) return { due: null, suggest: null, candidates: [] };
  const queue = [...s.queue];
  for (let d = cursor; d <= iso; d = addDays(d, 1)) {
    const { list } = tefilosOn(s.settings, d, customDays);
    const led = new Set();
    for (const t of list) {
      if (d === iso && t === tefila) {
        const due = queue.find((id) => canLead(s, id, t)) || null;
        const ok = (id) => id !== due && !isAway(s, id, iso) && canLead(s, id, t);
        const back = [];
        for (let i = queue.length - 1; i >= 0; i--) if (ok(queue[i])) back.push(queue[i]);
        const candidates = [...back.filter((id) => !led.has(id)), ...back.filter((id) => led.has(id))];
        return { due, suggest: due ? swapSuggestion(s, queue, due, iso, t, led) : null, candidates };
      }
      walkSlot(s, queue, d, t, led);
    }
  }
  return { due: null, suggest: null, candidates: [] };
}

/** Next in line / furthest from his turn, right now. */
export function lineUp(state) {
  const q = state.queue || [];
  return { next: q[0] || null, furthest: q.length ? q[q.length - 1] : null, position: Object.fromEntries(q.map((id, i) => [id, i])) };
}

// ── Editing (all return a new state; the caller rolls over to today first) ───

/** Replace the order. `nextId` (optional) = who is due next. Anyone new goes to the back of the line. */
export function setOrder(state, order, nextId = null) {
  const clean = uniq((order || []).filter((id) => typeof id === 'string' && ID.test(id))).slice(0, LIMITS.order);
  let queue = state.queue.filter((id) => clean.includes(id));
  const fresh = clean.filter((id) => !queue.includes(id));
  // Keep the walk going from whoever was due: re-lay the line in the NEW order starting at him.
  const front = nextId && clean.includes(nextId) ? nextId : (queue[0] || fresh[0] || null);
  if (front) {
    const at = clean.indexOf(front);
    queue = [...clean.slice(at), ...clean.slice(0, at)];
    // people added just now should be the furthest from their turn, not wedged in the middle
    if (!nextId && fresh.length) queue = [...queue.filter((id) => !fresh.includes(id)), ...fresh];
  } else queue = [];
  return normalizeState({ ...state, order: clean, queue }, state.cursor);
}

export function setSwap(state, date, tefila, personId) {
  const o = { ...state.overrides, [date]: { ...(state.overrides[date] || {}), [tefila]: personId } };
  return normalizeState({ ...state, overrides: o }, state.cursor);
}
export function clearSwap(state, date, tefila) {
  const o = { ...state.overrides, [date]: { ...(state.overrides[date] || {}) } };
  delete o[date][tefila];
  if (!Object.keys(o[date]).length) delete o[date];
  return normalizeState({ ...state, overrides: o }, state.cursor);
}

/** Mark someone away from `from` (to = null: until back). Overlapping ranges are merged. */
export function setAway(state, id, from, to = null) {
  const rs = [...(state.away[id] || []), { from, to }].sort((a, b) => a.from.localeCompare(b.from));
  const merged = [];
  for (const r of rs) {
    const last = merged[merged.length - 1];
    if (last && (last.to === null || r.from <= addDays(last.to, 1))) last.to = last.to === null || r.to === null ? null : (r.to > last.to ? r.to : last.to);
    else merged.push({ ...r });
  }
  return normalizeState({ ...state, away: { ...state.away, [id]: merged } }, state.cursor);
}
/** "Back": whatever covers today ends yesterday (removed if it never started). Later ranges stay. */
export function setBack(state, id, todayISO) {
  const rs = [];
  for (const r of state.away[id] || []) {
    if (r.from > todayISO) { rs.push(r); continue; }
    if (r.to !== null && r.to < todayISO) { rs.push(r); continue; }
    const to = addDays(todayISO, -1);
    if (to >= r.from) rs.push({ from: r.from, to });
  }
  const away = { ...state.away };
  if (rs.length) away[id] = rs; else delete away[id];
  return normalizeState({ ...state, away }, state.cursor);
}
export function clearAway(state, id) {
  const away = { ...state.away };
  delete away[id];
  return normalizeState({ ...state, away }, state.cursor);
}
export function setCan(state, id, tefilos) {
  const can = { ...state.can, [id]: tefilos };
  return normalizeState({ ...state, can }, state.cursor);
}

// ── Names / schedule matching ────────────────────────────────────────────────

/** "Moshe C." / "Moshe Cohen" from a roster person (same options as the birthdays slide). */
export function nameOf(person, names = 'full') {
  if (!person) return '';
  const full = [person.first, person.last].filter(Boolean).join(' ');
  if (names !== 'short') return full;
  const l = (person.last || '').trim();
  return person.first && l ? `${person.first} ${[...l][0].toUpperCase()}.` : full;
}

const NAME_RE = [
  ['Shacharis', /shacharis|shacharit|shachris|שחרית/i],
  ['Mincha', /mincha|minchah|מנחה/i],
  ['Maariv', /maariv|ma'?ariv|arvit|מעריב/i],
];
/**
 * Which davening is this schedule entry? An explicit `entry.tefila` ('Shacharis' | 'Mincha' | 'Maariv' | 'other') wins;
 * otherwise a category of kind 'davening' + the name (English or Hebrew) containing the tefila.
 */
export function tefilaOfEntry(entry, categories = []) {
  if (!entry) return null;
  if (entry.tefila === 'other') return null;
  if (TEFILOS.includes(entry.tefila)) return entry.tefila;
  const cat = (categories || []).find((c) => c.id === entry.category || c.key === entry.category || c.name === entry.category);
  if (!cat || cat.kind !== 'davening') return null;
  const text = `${entry.name || ''} ${entry.nameHe || ''}`;
  const hit = NAME_RE.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}
export const normalizeTefilaTag = (v) => (TEFILOS.includes(v) ? v : v === 'other' ? 'other' : undefined);

/**
 * What the kiosk and the live preview get: the state without history older than 2 days, plus the names it needs.
 * `roster` = { people }. The kiosk runs `assignments()` itself on this, so kiosk, admin and server agree.
 */
export function forKiosk(state, roster, todayISO) {
  const people = roster?.people || [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const keepFrom = todayISO ? addDays(todayISO, -2) : '';
  const history = Object.fromEntries(Object.entries(state.history || {}).filter(([k]) => k >= keepFrom));
  const ids = uniq([...state.order, ...Object.values(history).flatMap((h) => Object.values(h)).filter(Boolean)]);
  const names = Object.fromEntries(ids.filter((id) => byId.has(id)).map((id) => { const p = byId.get(id); return [id, { first: p.first, last: p.last, ...(p.he ? { he: p.he } : {}) }]; }));
  return {
    settings: state.settings, order: state.order, queue: state.queue, cursor: state.cursor,
    away: state.away, can: state.can, overrides: state.overrides, history, names,
  };
}
