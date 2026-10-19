/**
 * Unified announcements — shared pure logic.
 *
 * Used by the kiosk (what to render right now), the admin (status tabs,
 * timing summaries, takeover-conflict detection) and the server (migration,
 * archive auto-delete). No DOM, no Node APIs: everything here is plain JS so
 * it runs in all three places and under `node --test`.
 *
 * Item shape (data/announcements.json → items[]):
 *   { id, createdAt, updatedAt, status: 'draft'|'published',
 *     display: 'slide'|'banner'|'note'|'takeover', hold,
 *     content: { headlineEn, headlineHe, bodyEn, bodyHe, subtitle, target, attribution },
 *     look: { style, template, fit: 'auto'|'fixed', maxFontPx, fullscreen },
 *     slide: { duration, label }, note: { icon, order }, takeover: { group, rotateSec },
 *     banner: { size, speed, repeat },
 *     when: { startsAt, expiresAt, lastDurationMin,
 *             recurrence: null | { days, monthDays, windows:[{start,end}], from, until } },
 *     enabled, legacy }
 *
 * Time model: startsAt/expiresAt are absolute instants (ISO strings).
 * Recurrence (days, month days, windows, from/until) is wall-clock in the
 * configured timezone (settings.location.timezone, default America/New_York),
 * so it behaves the same on the Pi, in a browser in another zone, or on a
 * UTC server.
 */

import { DAY_CODES } from './scheduleDays.js';

export const DEFAULT_TZ = 'America/New_York';
export const DISPLAYS = ['slide', 'banner', 'note', 'takeover'];
export const STATUSES = ['draft', 'live', 'scheduled', 'paused', 'archived'];
export const DEFAULT_ARCHIVE_DAYS = 30;
export const DEFAULT_TAKEOVER_ROTATE_SEC = 10;

const DAY_ALIASES = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, shabbos: 6, shabbat: 6, sat: 6, saturday: 6,
};

/** 0-6 day index for any accepted day spelling, or -1. */
export function dayIndexOf(code) {
  if (typeof code === 'number' && code >= 0 && code <= 6) return code;
  if (typeof code !== 'string') return -1;
  const i = DAY_ALIASES[code.trim().toLowerCase()];
  return i === undefined ? -1 : i;
}

/** Canonical day code ('Sun'…'Shabbos') for any accepted spelling, or null. */
export function canonicalDay(code) {
  const i = dayIndexOf(code);
  return i < 0 ? null : DAY_CODES[i];
}

// ── Timezone helpers ────────────────────────────────────────────────────────

const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function safeTz(tz) {
  if (!tz) return DEFAULT_TZ;
  try {
    partsFormatter(tz).format(0);
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

const WEEKDAY_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Wall-clock parts of an instant in a timezone.
 * @returns {{y:number,m:number,d:number,hh:number,mm:number,ss:number,dow:number,date:string,minutes:number}}
 */
export function zonedParts(when, tz = DEFAULT_TZ) {
  const t = when instanceof Date ? when : new Date(when);
  const out = {};
  for (const p of partsFormatter(safeTz(tz)).formatToParts(t)) out[p.type] = p.value;
  const y = +out.year, m = +out.month, d = +out.day;
  const hh = +out.hour % 24, mm = +out.minute, ss = +out.second;
  return {
    y, m, d, hh, mm, ss,
    dow: WEEKDAY_IDX[out.weekday],
    date: `${out.year}-${out.month}-${out.day}`,
    minutes: hh * 60 + mm,
  };
}

/** Offset (ms) of tz from UTC at a given instant. */
function tzOffsetMs(ms, tz) {
  const p = zonedParts(new Date(ms), tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` reads `dateISO` `time`.
 * time is 'HH:MM' (24h). Non-existent DST times roll forward.
 */
export function zonedTimeToUtc(dateISO, time = '00:00', tz = DEFAULT_TZ) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = String(time).split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  let ms = guess - tzOffsetMs(guess, tz);
  // Second pass handles instants right next to a DST change.
  const off2 = tzOffsetMs(ms, tz);
  ms = guess - off2;
  return new Date(ms);
}

/** 'YYYY-MM-DD' + n days (calendar arithmetic, no timezone involved). */
export function addDays(dateISO, n) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function dowOfDate(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 'HH:MM' → minutes, or null. Accepts 'H:MM' too. */
export function hmToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

function toMs(v) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ── Recurrence ──────────────────────────────────────────────────────────────

function hasRecurrence(rec) {
  if (!rec || typeof rec !== 'object') return false;
  return (rec.days?.length || 0) + (rec.monthDays?.length || 0) + (rec.windows?.length || 0) > 0
    || !!rec.from || !!rec.until;
}

/** Does a calendar date (YYYY-MM-DD in tz) pass the day/month-day/range filters? */
export function dateMatches(rec, dateISO) {
  if (!rec) return true;
  if (rec.from && dateISO < rec.from) return false;
  if (rec.until && dateISO > rec.until) return false;
  if (Array.isArray(rec.days) && rec.days.length) {
    const dow = dowOfDate(dateISO);
    if (!rec.days.some((c) => dayIndexOf(c) === dow)) return false;
  }
  if (Array.isArray(rec.monthDays) && rec.monthDays.length) {
    const dom = +dateISO.slice(8, 10);
    if (!rec.monthDays.map(Number).includes(dom)) return false;
  }
  return true;
}

function validWindows(rec) {
  return (rec?.windows || [])
    .map((w) => ({ s: hmToMinutes(w?.start), e: hmToMinutes(w?.end) }))
    .filter((w) => w.s != null && w.e != null && w.s !== w.e);
}

/**
 * Is the recurrence rule satisfied at instant `now`?
 * - No windows: the whole matching day.
 * - Window start < end: that span on matching days.
 * - Window start > end (crosses midnight, e.g. 22:00–02:00): the evening part
 *   belongs to the matching day, the after-midnight part to the day before
 *   (so "Thu 22:00–02:00" covers Thu night into Fri morning, not Fri night).
 */
export function recurrenceMatches(rec, now = new Date(), { tz = DEFAULT_TZ } = {}) {
  if (!hasRecurrence(rec)) return true;
  const p = zonedParts(now, tz);
  const wins = validWindows(rec);
  if (!wins.length) return dateMatches(rec, p.date);
  for (const w of wins) {
    if (w.s < w.e) {
      if (p.minutes >= w.s && p.minutes < w.e && dateMatches(rec, p.date)) return true;
    } else {
      if (p.minutes >= w.s && dateMatches(rec, p.date)) return true;
      if (p.minutes < w.e && dateMatches(rec, addDays(p.date, -1))) return true;
    }
  }
  return false;
}

// ── Status ──────────────────────────────────────────────────────────────────

export function isDraft(item) {
  return item?.status === 'draft';
}

/**
 * The instant this item stopped for good (expiresAt passed, or the
 * recurrence's `until` date is over), or null if it can still show.
 */
export function endedAt(item, now = new Date(), { tz = DEFAULT_TZ } = {}) {
  const nowMs = now.getTime();
  const exp = toMs(item?.when?.expiresAt);
  if (exp != null && exp <= nowMs) return new Date(exp);
  const rec = item?.when?.recurrence;
  if (hasRecurrence(rec) && rec.until) {
    // Last possible moment: end of `until` day, plus a midnight-crossing window tail.
    const wins = validWindows(rec);
    const crossTail = wins.filter((w) => w.s > w.e).reduce((mx, w) => Math.max(mx, w.e), 0);
    const end = zonedTimeToUtc(addDays(rec.until, 1), '00:00', tz).getTime() + crossTail * 60000;
    if (end <= nowMs) return new Date(end);
  }
  return null;
}

/** Is the item on screen right now? Drafts and paused items never are. */
export function isActive(item, now = new Date(), { tz = DEFAULT_TZ } = {}) {
  if (!item || isDraft(item)) return false;
  if (item.enabled === false) return false;
  const nowMs = now.getTime();
  const start = toMs(item.when?.startsAt);
  if (start != null && nowMs < start) return false;
  const exp = toMs(item.when?.expiresAt);
  if (exp != null && nowMs >= exp) return false;
  return recurrenceMatches(item.when?.recurrence, now, { tz });
}

/** 'draft' | 'archived' | 'paused' | 'live' | 'scheduled' */
export function status(item, now = new Date(), opts = {}) {
  if (isDraft(item)) return 'draft';
  if (endedAt(item, now, opts)) return 'archived';
  if (item?.enabled === false) return 'paused';
  return isActive(item, now, opts) ? 'live' : 'scheduled';
}

/**
 * Next instant (Date) at which isActive(item) flips, looking up to 9 days
 * ahead, or null if it never changes in that horizon.
 */
export function nextChange(item, now = new Date(), { tz = DEFAULT_TZ } = {}) {
  if (!item || isDraft(item) || item.enabled === false) return null;
  const nowMs = now.getTime();
  const cands = new Set();
  const start = toMs(item.when?.startsAt);
  const exp = toMs(item.when?.expiresAt);
  if (start != null) cands.add(start);
  if (exp != null) cands.add(exp);
  const rec = item.when?.recurrence;
  if (hasRecurrence(rec)) {
    const today = zonedParts(now, tz).date;
    const wins = validWindows(rec);
    for (let i = -1; i <= 9; i++) {
      const day = addDays(today, i);
      cands.add(zonedTimeToUtc(day, '00:00', tz).getTime());
      for (const w of wins) {
        const sh = `${String(Math.floor(w.s / 60)).padStart(2, '0')}:${String(w.s % 60).padStart(2, '0')}`;
        const eh = `${String(Math.floor(w.e / 60) % 24).padStart(2, '0')}:${String(w.e % 60).padStart(2, '0')}`;
        cands.add(zonedTimeToUtc(day, sh, tz).getTime());
        cands.add(zonedTimeToUtc(w.e >= 1440 ? addDays(day, 1) : day, eh, tz).getTime());
      }
    }
  }
  const nowActive = isActive(item, now, { tz });
  const sorted = [...cands].filter((c) => c > nowMs && c - nowMs <= 10 * 86400000).sort((a, b) => a - b);
  for (const c of sorted) {
    if (isActive(item, new Date(c), { tz }) !== nowActive) return new Date(c);
  }
  return null;
}

// ── Kiosk selection ─────────────────────────────────────────────────────────

function newestKey(item) {
  return toMs(item?.when?.startsAt) ?? toMs(item?.createdAt) ?? 0;
}

/** Sort newest first (start time, falling back to creation time). */
export function byNewest(a, b) {
  return newestKey(b) - newestKey(a) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
}

/**
 * The single takeover to show now, or null.
 * Newest active takeover wins. If it belongs to a share group
 * (takeover.group), every active member of that group rotates full screen,
 * switching every takeover.rotateSec seconds (default 10).
 */
export function pickTakeover(items, now = new Date(), opts = {}) {
  const active = (items || []).filter((i) => i?.display === 'takeover' && isActive(i, now, opts)).sort(byNewest);
  if (!active.length) return null;
  const winner = active[0];
  const group = winner.takeover?.group;
  if (!group) return winner;
  const members = active
    .filter((i) => i.takeover?.group === group)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  if (members.length < 2) return winner;
  const sec = Math.max(3, Number(winner.takeover?.rotateSec) || DEFAULT_TAKEOVER_ROTATE_SEC);
  const idx = Math.floor(now.getTime() / (sec * 1000)) % members.length;
  return members[idx];
}

/**
 * Split items into what the kiosk shows right now.
 * @returns {{ slides: object[], holds: object[], banners: object[], notes: object[], takeover: object|null, activeKey: string }}
 *   slides — active rotation slides (hold === false), oldest first
 *   holds — active hold slides, newest first (the first one replaces the slide area)
 */
export function selectActive(items, now = new Date(), opts = {}) {
  const live = (items || []).filter((i) => isActive(i, now, opts));
  const byCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  const slides = live.filter((i) => i.display === 'slide' && !i.hold).sort(byCreated);
  const holds = live.filter((i) => i.display === 'slide' && i.hold).sort(byNewest);
  const banners = live.filter((i) => i.display === 'banner').sort(byCreated);
  const notes = live.filter((i) => i.display === 'note').sort((a, b) =>
    (Number(a.note?.order) || 0) - (Number(b.note?.order) || 0) || byCreated(a, b));
  const takeover = pickTakeover(items, now, opts);
  const activeKey = live.map((i) => `${i.id}:${i.updatedAt || ''}`).join('|') + `#${takeover?.id || ''}`;
  return { slides, holds, banners, notes, takeover, activeKey };
}

// ── Takeover conflicts (admin) ──────────────────────────────────────────────

/** [start, end) of an item's absolute window in ms (null = open-ended). */
function span(item, nowMs) {
  return {
    s: toMs(item?.when?.startsAt) ?? nowMs,
    e: toMs(item?.when?.expiresAt) ?? Infinity,
  };
}

/**
 * Other takeovers (live or scheduled, not drafts/paused/archived) whose
 * start–end overlaps the candidate's. Recurrence is ignored here on purpose:
 * overlapping date ranges are worth asking about even if windows differ.
 */
export function findTakeoverConflicts(candidate, items, now = new Date(), opts = {}) {
  if (candidate?.display !== 'takeover' || isDraft(candidate)) return [];
  const nowMs = now.getTime();
  const c = span(candidate, nowMs);
  return (items || []).filter((o) => {
    if (!o || o.id === candidate.id || o.display !== 'takeover') return false;
    const st = status(o, now, opts);
    if (st !== 'live' && st !== 'scheduled') return false;
    const r = span(o, nowMs);
    return c.s < r.e && r.s < c.e;
  });
}

// ── Formatting (admin summaries) ────────────────────────────────────────────

function fmtTime(ms, tz) {
  return new Intl.DateTimeFormat('en-US', { timeZone: safeTz(tz), hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
}

/** "9:00 PM" today, "Thu 9:00 PM" within a week, "Oct 21, 9:00 PM" otherwise. */
export function formatWhen(ms, now = new Date(), { tz = DEFAULT_TZ } = {}) {
  const tzs = safeTz(tz);
  const a = zonedParts(new Date(ms), tzs);
  const b = zonedParts(now, tzs);
  const t = fmtTime(ms, tzs);
  if (a.date === b.date) return t;
  if (a.date === addDays(b.date, 1)) return `tomorrow ${t}`;
  const diffDays = Math.round((Date.parse(a.date) - Date.parse(b.date)) / 86400000);
  if (diffDays > 0 && diffDays < 7) {
    return `${DAY_CODES[a.dow]} ${t}`;
  }
  const md = new Intl.DateTimeFormat('en-US', { timeZone: tzs, month: 'short', day: 'numeric' }).format(new Date(ms));
  return `${md}, ${t}`;
}

function hm12(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${String(m).padStart(2, '0')}`, ap };
}

function windowLabel(w) {
  const a = hm12(w.s), b = hm12(w.e);
  return a.ap === b.ap ? `${a.text}–${b.text} ${b.ap}` : `${a.text} ${a.ap}–${b.text} ${b.ap}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Mon–Thu", "Every day", "Sun, Tue, Shabbos" */
export function daysLabel(days) {
  const idx = [...new Set((days || []).map(dayIndexOf).filter((i) => i >= 0))].sort((a, b) => a - b);
  if (!idx.length || idx.length === 7) return 'Every day';
  const runs = [];
  let start = idx[0], prev = idx[0];
  for (let k = 1; k <= idx.length; k++) {
    if (idx[k] === prev + 1) { prev = idx[k]; continue; }
    runs.push(prev - start >= 2 ? `${DAY_CODES[start]}–${DAY_CODES[prev]}` : start === prev ? DAY_CODES[start] : `${DAY_CODES[start]}, ${DAY_CODES[prev]}`);
    start = prev = idx[k];
  }
  return runs.join(', ');
}

/** One-line repeat summary: "Mon–Thu 7:00–9:30 AM", "on the 1st, 15th", … */
export function recurrenceLabel(rec) {
  if (!hasRecurrence(rec)) return '';
  const bits = [];
  if (rec.days?.length) bits.push(daysLabel(rec.days));
  if (rec.monthDays?.length) bits.push(`on the ${rec.monthDays.map(Number).sort((a, b) => a - b).map(ordinal).join(', ')}`);
  if (!rec.days?.length && !rec.monthDays?.length) bits.push('Every day');
  const wins = validWindows(rec);
  if (wins.length) bits.push(wins.map(windowLabel).join(', '));
  if (rec.from && rec.until) bits.push(`${rec.from} → ${rec.until}`);
  else if (rec.from) bits.push(`from ${rec.from}`);
  else if (rec.until) bits.push(`until ${rec.until}`);
  return bits.join(' ');
}

/** Short human timing summary for an admin row. */
export function describeTiming(item, now = new Date(), opts = {}) {
  const st = status(item, now, opts);
  const start = toMs(item?.when?.startsAt);
  const exp = toMs(item?.when?.expiresAt);
  const rep = recurrenceLabel(item?.when?.recurrence);
  const parts = [];
  if (st === 'archived') {
    const end = endedAt(item, now, opts);
    return `Ended ${formatWhen(end.getTime(), now, opts)}`;
  }
  if (start != null && start > now.getTime()) parts.push(`Starts ${formatWhen(start, now, opts)}`);
  if (rep) parts.push(rep);
  if (exp != null) parts.push(`until ${formatWhen(exp, now, opts)}`);
  else if (!rep) parts.push('Until removed');
  if (st === 'scheduled' && rep) {
    const nc = nextChange(item, now, opts);
    if (nc) parts.push(`· next ${formatWhen(nc.getTime(), now, opts)}`);
  }
  const s = parts.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Content helpers ─────────────────────────────────────────────────────────

export const LAYOUTS = ['bigwords', 'event', 'list', 'quicktime', 'quote', 'sicha', 'letter', 'notice', 'classic'];
/** Phase 2b inspiration layouts (quote / sicha excerpt / letter). */
export const INSPIRATION_LAYOUTS = ['quote', 'sicha', 'letter'];

/** Effective layout. Banners and side notes are always plain text. */
export function layoutOf(item) {
  const l = item?.look?.layout;
  return LAYOUTS.includes(l) ? l : 'classic';
}

/** "13:45" → "1:45 PM" (also accepts already-12h text, returned as is). */
export function to12h(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return String(hhmm ?? '').trim();
  const h = +m[1] % 24;
  const ap = h < 12 ? 'AM' : 'PM';
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${ap}`;
}

const nonEmpty = (v) => !!String(v ?? '').trim();

/** A list item is a plain string (old data) or { text, textHe, day, time }. */
export function listItemText(x) {
  if (x && typeof x === 'object') return [x.text, x.textHe].filter(nonEmpty).join(' ');
  return String(x ?? '');
}

/** Main text for list rows / previews (layout-aware). */
export function primaryText(item) {
  const c = item?.content || {};
  const usesLayout = item?.display === 'slide' || item?.display === 'takeover';
  const layout = usesLayout ? layoutOf(item) : 'bigwords';
  if (layout === 'event') {
    const e = c.event || {};
    const when = [e.day, e.time ? to12h(e.time) : ''].filter(nonEmpty).join(' ');
    return [e.title || e.titleHe, when, e.place || e.placeHe].filter(nonEmpty).join(' · ');
  }
  if (layout === 'list') {
    const l = c.list || {};
    return [l.heading || l.headingHe, ...(l.items || []).map(listItemText).filter(nonEmpty)].filter(nonEmpty).join(' · ');
  }
  if (layout === 'notice') {
    const n = c.notice || {};
    return [n.pre, n.focus || n.focusHe, n.post].filter(nonEmpty).join(' ') || c.headlineEn || c.headlineHe || '';
  }
  if (layout === 'quicktime') {
    const q = c.quicktime || {};
    return [q.name || q.nameHe, q.time ? to12h(q.time) : q.big, q.place].filter(nonEmpty).join(' ');
  }
  if (layout === 'quote') return [c.quote?.text || c.quote?.textHe, c.quote?.source].filter(nonEmpty).join(' — ');
  if (layout === 'sicha') return c.sicha?.title || c.sicha?.titleHe || String(c.sicha?.body || '').slice(0, 80);
  if (layout === 'letter') return [c.letter?.salutation, String(c.letter?.body || '').slice(0, 80)].filter(nonEmpty).join(' ');
  return c.headlineHe || c.headlineEn || c.bodyHe || c.bodyEn || '';
}

export function hasText(item) {
  const c = item?.content || {};
  const usesLayout = item?.display === 'slide' || item?.display === 'takeover';
  const layout = usesLayout ? layoutOf(item) : 'bigwords';
  if (layout === 'event') return nonEmpty(c.event?.title) || nonEmpty(c.event?.titleHe);
  if (layout === 'list') return nonEmpty(c.list?.heading) || nonEmpty(c.list?.headingHe) || (c.list?.items || []).some((x) => nonEmpty(listItemText(x)));
  if (layout === 'notice') return nonEmpty(c.notice?.focus) || nonEmpty(c.notice?.focusHe) || nonEmpty(c.notice?.pre) || nonEmpty(c.notice?.post);
  if (layout === 'quicktime') return (nonEmpty(c.quicktime?.time) || nonEmpty(c.quicktime?.big)) && (nonEmpty(c.quicktime?.name) || nonEmpty(c.quicktime?.nameHe));
  if (layout === 'quote') return nonEmpty(c.quote?.text) || nonEmpty(c.quote?.textHe);
  if (layout === 'sicha') return nonEmpty(c.sicha?.body);
  if (layout === 'letter') return nonEmpty(c.letter?.body);
  return nonEmpty(c.headlineHe) || nonEmpty(c.headlineEn) || nonEmpty(c.bodyHe) || nonEmpty(c.bodyEn);
}

/** Minutes between start (or created) and expiry, or null. */
export function durationMinutes(item) {
  const s = toMs(item?.when?.startsAt) ?? toMs(item?.createdAt);
  const e = toMs(item?.when?.expiresAt);
  if (s == null || e == null || e <= s) return null;
  return Math.round((e - s) / 60000);
}

/** Days after ending that an archived item is auto-deleted. */
export function archiveDaysFrom(settings) {
  const n = Number(settings?.announcements?.archiveDays);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_ARCHIVE_DAYS;
}

/** Should cleanup delete this item now? Archived for at least `days` days. */
export function shouldPurge(item, now = new Date(), days = DEFAULT_ARCHIVE_DAYS, opts = {}) {
  if (isDraft(item)) return false;
  const end = endedAt(item, now, opts);
  if (!end) return false;
  return now.getTime() - end.getTime() >= days * 86400000;
}
