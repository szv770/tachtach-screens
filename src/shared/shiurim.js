/**
 * Shiurim + Guest speaker: pure rules shared by the kiosk, the admin and the server (spec docs/specs/06-SPEAKER-SHIURIM.md).
 *
 * Data (one org document, data/shiurim.json via src/server/shiurimStore.js; class P1 = rebbeim and guest speakers are
 * adults, never students; the admin says 'no student names' under every free-text field):
 *   { version: 1,
 *     settings: { view, weekBy, todaySort, past, cancelledShow, whenNone, language, showWhen, hoursFrom, hoursTo,
 *                 showOnSchedule, showPhotos, showPlace, guestLeadDays, guestAfterMin, guestBio, guestQr, liveView },
 *     people:  [{ id, name, nameHe, photo: { id, focus } | null }],               // order = the order of the By-rebbe page
 *     shiurim: [{ id, personId|null, title, titleHe, place, placeHe, enabled, note, groups, season: {from,until}|null,
 *                 when: { kind:'weekly', days, start, end } | { kind:'linked', entryId, entryName, entryNameHe } }],
 *     guests:  [{ id, name, nameHe, title, titleHe, topic, topicHe, bio, bioHe, place, placeHe, date, start, end, showFrom,
 *                 photo, link, takeover: { on, minutes, at }, banner, archivedAt }],
 *     changes: { 'YYYY-MM-DD': { <shiurId>: { cancelled, start, end, place, note } } } }   // one-day changes (Today card)
 *
 * A photo is only ever an asset id (+ focus); the file lives in the upload area and can move to the private image store
 * later without touching this document. No clocks and no I/O here: every function takes the date or `now` + zone it needs.
 */

import { zonedParts, zonedTimeToUtc, addDays, DEFAULT_TZ } from './announcements.js';
import { getEffectiveSchedule, weeklyEntriesFor } from './scheduleResolution.js';
import {
  DAYS, DAY_EN, DAY_HE, DAY_EN_SHORT, DAY_WORDS, WORDS, WHEN, fill, IMPORT_HEADER, IMPORT_EXAMPLE,
} from './shiurimCopy.js';

export { DAYS, addDays, IMPORT_HEADER };

export const LIMITS = Object.freeze({
  people: 100, shiurim: 300, guests: 100, name: 60, title: 60, place: 60, topic: 100, bio: 200, note: 80, link: 200,
  file: 256 * 1024, importText: 64 * 1024, importLines: 400, importLine: 400, sheetRows: 400, sheetCols: 12, sheetCell: 400,
  changeDates: 60, changesPerDate: 60, groups: 12, takeoverMin: 60,
});
export const GUEST_ARCHIVE_DAYS = 60;
export const CHANGE_KEEP_DAYS = 14;
export const DEFAULT_LENGTH_MIN = 45; // a shiur without an end time counts as 'now' for this long
export const GUEST_DEFAULT_LENGTH_MIN = 60;

export const VIEWS = Object.freeze(['both', 'today', 'week']);
export const WEEK_BY = Object.freeze(['rebbe', 'day']);
export const SORTS = Object.freeze(['time', 'rebbe']);
export const PAST = Object.freeze(['dim', 'hide']);
export const CANCELLED_SHOW = Object.freeze(['mark', 'hide']);
export const WHEN_NONE = Object.freeze(['week', 'hide']);
export const LANGUAGES = Object.freeze(['both', 'en', 'he']);
export const SHOW_WHEN = Object.freeze(['always', 'hours']);
export const FOCUS = Object.freeze(['top', 'center', 'bottom']);

export const DEFAULT_SETTINGS = Object.freeze({
  view: 'both', weekBy: 'rebbe', todaySort: 'time', past: 'dim', cancelledShow: 'mark', whenNone: 'week', language: 'both',
  showWhen: 'always', hoursFrom: '07:00', hoursTo: '22:00', showOnSchedule: true, showPhotos: true, showPlace: true,
  guestLeadDays: 3, guestAfterMin: 0, guestBio: true, guestQr: true, liveView: true,
});

export class ShiurimError extends Error {}

// ── small text + date helpers ─────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{4,48}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;
export const line = (v, max) => String(v ?? '').replace(CTRL, '').replace(/\s+/g, ' ').trim().slice(0, max);
const HEB = /[֐-׿]/;
const LAT = /[A-Za-z]/;
export const hasHeb = (s) => HEB.test(s);
export const isHebOnly = (s) => HEB.test(s) && !LAT.test(s);

export function isISODate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dowOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const dayCodeOf = (iso) => DAYS[dowOf(iso)];
export const weekStartOf = (iso) => addDays(iso, -dowOf(iso));

/** 'H:MM' / 'HH:MM' -> minutes (0..1439), or null. */
export function hm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (mi > 59 || h > 23) return null;
  return h * 60 + mi;
}
export const hhmm = (s) => { const v = hm(s); return v == null ? '' : `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
export const minToHHMM = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
/** minutes since midnight -> '8:15 PM' */
export function fmt12(min) {
  if (min == null) return '';
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const fmtHHMM = (s) => fmt12(hm(s));

let counter = 0;
export function newId(prefix = 'sh') { return `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
const oneOf = (v, list, d) => (list.includes(v) ? v : d);
const intIn = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const norm = (s) => line(s, 200).toLowerCase();

/** An https address only (never javascript:, data:, http: or one with a password). '' when not acceptable. */
export function cleanLink(raw) {
  const s = line(raw, LIMITS.link);
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return '';
  return u.toString().length <= LIMITS.link ? u.toString() : '';
}

// ── normalisers (lenient on load; strict = throw a friendly ShiurimError on save) ─

export function normalizeSettings(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const D = DEFAULT_SETTINGS;
  return {
    view: oneOf(o.view, VIEWS, D.view),
    weekBy: oneOf(o.weekBy, WEEK_BY, D.weekBy),
    todaySort: oneOf(o.todaySort, SORTS, D.todaySort),
    past: oneOf(o.past, PAST, D.past),
    cancelledShow: oneOf(o.cancelledShow, CANCELLED_SHOW, D.cancelledShow),
    whenNone: oneOf(o.whenNone, WHEN_NONE, D.whenNone),
    language: oneOf(o.language, LANGUAGES, D.language),
    showWhen: oneOf(o.showWhen, SHOW_WHEN, D.showWhen),
    hoursFrom: hhmm(o.hoursFrom) || D.hoursFrom,
    hoursTo: hhmm(o.hoursTo) || D.hoursTo,
    showOnSchedule: bool(o.showOnSchedule, D.showOnSchedule),
    showPhotos: bool(o.showPhotos, D.showPhotos),
    showPlace: bool(o.showPlace, D.showPlace),
    guestLeadDays: intIn(o.guestLeadDays, 0, 14, D.guestLeadDays),
    guestAfterMin: intIn(o.guestAfterMin, 0, 240, D.guestAfterMin),
    guestBio: bool(o.guestBio, D.guestBio),
    guestQr: bool(o.guestQr, D.guestQr),
    liveView: bool(o.liveView, D.liveView),
  };
}

export function normalizePhoto(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id ?? '').toLowerCase();
  if (!UUID_RE.test(id)) return null;
  return { id, focus: oneOf(raw.focus, FOCUS, 'top') };
}

const cleanId = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : null);

export function normalizePerson(raw, { strict = false } = {}) {
  if (!raw || typeof raw !== 'object') { if (strict) throw new ShiurimError('Type a name.'); return null; }
  const name = line(raw.name, LIMITS.name), nameHe = line(raw.nameHe, LIMITS.name);
  if (!name && !nameHe) { if (strict) throw new ShiurimError('Type the name (English or Hebrew).'); return null; }
  return { id: cleanId(raw.id) || newId('p'), name, nameHe, photo: normalizePhoto(raw.photo) };
}

export function normalizeDays(raw) {
  const set = new Set((Array.isArray(raw) ? raw : []).map((d) => String(d)));
  return DAYS.filter((d) => set.has(d));
}

export function normalizeWhen(raw, { strict = false } = {}) {
  const bad = (m) => { if (strict) throw new ShiurimError(m); return null; };
  if (!raw || typeof raw !== 'object') return bad('Say when the shiur is.');
  if (raw.kind === 'linked') {
    const entryId = line(raw.entryId, 64), entryName = line(raw.entryName, LIMITS.name), entryNameHe = line(raw.entryNameHe, LIMITS.name);
    if (!entryId && !entryName && !entryNameHe) return bad('Pick the schedule block this shiur follows.');
    return { kind: 'linked', entryId, entryName, entryNameHe };
  }
  const days = normalizeDays(raw.days);
  if (!days.length) return bad('Pick at least one day.');
  const start = hhmm(raw.start);
  if (!start) return bad('Pick a start time.');
  let end = hhmm(raw.end);
  if (end && hm(end) <= hm(start)) { if (strict) throw new ShiurimError('The end time must be after the start time.'); end = ''; }
  return { kind: 'weekly', days, start, end };
}

export function normalizeSeason(raw, { strict = false } = {}) {
  if (raw == null || raw === '' || (typeof raw === 'object' && !raw.from && !raw.until)) return null;
  if (!raw || typeof raw !== 'object' || !isISODate(raw.from) || !isISODate(raw.until)) {
    if (strict) throw new ShiurimError('A season needs a first and a last date.');
    return null;
  }
  if (raw.until < raw.from) { if (strict) throw new ShiurimError('The season must end on or after the day it starts.'); return null; }
  return { from: raw.from, until: raw.until };
}

export function normalizeShiur(raw, people, { strict = false } = {}) {
  if (!raw || typeof raw !== 'object') { if (strict) throw new ShiurimError('Type what the shiur is.'); return null; }
  const title = line(raw.title, LIMITS.title), titleHe = line(raw.titleHe, LIMITS.title);
  if (!title && !titleHe) { if (strict) throw new ShiurimError('Type what the shiur is (English or Hebrew).'); return null; }
  const when = normalizeWhen(raw.when, { strict });
  if (!when) return null;
  const personId = raw.personId && (people || []).some((p) => p.id === raw.personId) ? raw.personId : null;
  if (strict && raw.personId && !personId) throw new ShiurimError('That person is not in the list any more.');
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).map((g) => line(g, 40).toLowerCase()).filter((g) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(g)).slice(0, LIMITS.groups);
  return {
    id: cleanId(raw.id) || newId('s'), personId, title, titleHe, place: line(raw.place, LIMITS.place), placeHe: line(raw.placeHe, LIMITS.place),
    when, groups: [...new Set(groups)], season: normalizeSeason(raw.season, { strict }), enabled: raw.enabled !== false, note: line(raw.note, LIMITS.note),
  };
}

const GUEST_FIELDS = ['name', 'nameHe', 'title', 'titleHe', 'topic', 'topicHe', 'bio', 'bioHe', 'place', 'placeHe'];
export function normalizeGuest(raw, { strict = false } = {}) {
  const bad = (m) => { if (strict) throw new ShiurimError(m); return null; };
  if (!raw || typeof raw !== 'object') return bad('Type the speaker\'s name.');
  const name = line(raw.name, LIMITS.name), nameHe = line(raw.nameHe, LIMITS.name);
  if (!name && !nameHe) return bad('Type the speaker\'s name (English or Hebrew).');
  if (!isISODate(raw.date)) return bad('Pick the date of the talk.');
  const start = hhmm(raw.start);
  let end = hhmm(raw.end);
  if (end && (!start || hm(end) <= hm(start))) { if (strict) throw new ShiurimError(start ? 'The end time must be after the start time.' : 'Add a start time before an end time.'); end = ''; }
  const showFrom = isISODate(raw.showFrom) ? raw.showFrom : null;
  if (showFrom && showFrom > raw.date) return bad('"Shows from" must be on or before the day of the talk.');
  const t = raw.takeover && typeof raw.takeover === 'object' ? raw.takeover : {};
  const g = {
    id: cleanId(raw.id) || newId('g'),
    name, nameHe,
    title: line(raw.title, LIMITS.title), titleHe: line(raw.titleHe, LIMITS.title),
    topic: line(raw.topic, LIMITS.topic), topicHe: line(raw.topicHe, LIMITS.topic),
    bio: line(raw.bio, LIMITS.bio), bioHe: line(raw.bioHe, LIMITS.bio),
    place: line(raw.place, LIMITS.place), placeHe: line(raw.placeHe, LIMITS.place),
    date: raw.date, start, end, showFrom,
    photo: normalizePhoto(raw.photo),
    link: raw.link ? cleanLink(raw.link) : '',
    takeover: { on: t.on === true, minutes: intIn(t.minutes, 1, LIMITS.takeoverMin, 10), at: hhmm(t.at) || null },
    banner: raw.banner === true,
    archivedAt: isISODate(raw.archivedAt) ? raw.archivedAt : null,
  };
  if (strict && raw.link && !g.link) throw new ShiurimError('The link must be a full https:// address.');
  return g;
}

function normalizeChange(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const c = {};
  if (raw.cancelled === true) c.cancelled = true;
  const s = hhmm(raw.start);
  if (s) { c.start = s; const e = hhmm(raw.end); if (e && hm(e) > hm(s)) c.end = e; }
  const place = line(raw.place, LIMITS.place); if (place) c.place = place;
  const note = line(raw.note, LIMITS.note); if (note) c.note = note;
  return Object.keys(c).length ? c : null;
}

export function normalizeChanges(raw, shiurIds, today) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const keep = today ? addDays(today, -CHANGE_KEEP_DAYS) : null;
  for (const date of Object.keys(raw).sort().reverse()) {
    if (!isISODate(date) || (keep && date < keep)) continue;
    const per = raw[date];
    if (!per || typeof per !== 'object' || Array.isArray(per)) continue;
    const day = {};
    for (const id of Object.keys(per)) {
      if (!shiurIds.has(id)) continue;
      const c = normalizeChange(per[id]);
      if (c) day[id] = c;
      if (Object.keys(day).length >= LIMITS.changesPerDate) break;
    }
    if (Object.keys(day).length) out[date] = day;
    if (Object.keys(out).length >= LIMITS.changeDates) break;
  }
  return out;
}

export function normalizeFile(raw, { today } = {}) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const people = [];
  const seen = new Set();
  for (const p of Array.isArray(r.people) ? r.people : []) {
    const n = normalizePerson(p);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id); people.push(n);
    if (people.length >= LIMITS.people) break;
  }
  const shiurim = [];
  const sIds = new Set();
  for (const s of Array.isArray(r.shiurim) ? r.shiurim : []) {
    const n = normalizeShiur(s, people);
    if (!n || sIds.has(n.id)) continue;
    sIds.add(n.id); shiurim.push(n);
    if (shiurim.length >= LIMITS.shiurim) break;
  }
  let guests = [];
  const gIds = new Set();
  for (const g of Array.isArray(r.guests) ? r.guests : []) {
    const n = normalizeGuest(g);
    if (!n || gIds.has(n.id)) continue;
    gIds.add(n.id);
    if (today && !n.archivedAt && n.date < today) n.archivedAt = addDays(n.date, 1); // a talk that is over is archived from the day after (so the 60 days count from then)
    if (today && n.archivedAt && n.archivedAt < addDays(today, -GUEST_ARCHIVE_DAYS)) continue; // purged (its photo goes with the daily clean-up)
    guests.push(n);
  }
  guests = guests.slice(0, LIMITS.guests);
  return { version: 1, settings: normalizeSettings(r.settings), people, shiurim, guests, changes: normalizeChanges(r.changes, sIds, today) };
}

export const emptyFile = () => normalizeFile({});
/** Bytes the document takes on disk (pretty-printed UTF-8, like storage.js writes it), so Hebrew counts two bytes a letter. */
export const fileBytes = (f) => new TextEncoder().encode(JSON.stringify(f, null, 2)).length;
export function isEmpty(file) { return !file || (!file.shiurim?.length && !file.guests?.length); }
export const personName = (p, lang = 'en') => (!p ? '' : lang === 'he' ? (p.nameHe || p.name) : (p.name || p.nameHe));
export const photoIds = (file) => [...(file?.people || []), ...(file?.guests || [])].map((x) => x.photo?.id).filter(Boolean);

// ── the schedule link ─────────────────────────────────────────────────────────

const blockMatches = (link) => {
  const names = [link.entryName, link.entryNameHe].filter(Boolean).map(norm);
  return (e) => !!e && ((link.entryId && e.id === link.entryId) || names.some((n) => n && (norm(e.name) === n || norm(e.nameHe) === n)));
};

/** The weekly schedule block a link points at (by id, then by name), or null when it was deleted. */
export function linkedBlock(link, schedule) {
  const entries = schedule?.entries || [];
  return entries.find((e) => link.entryId && e.id === link.entryId) || entries.find(blockMatches(link)) || null;
}

/**
 * Where a linked shiur is on `dateISO`: { start, end } minutes, { cancelled: true, start, end } when a per-date schedule
 * removed a block that would normally run that weekday, or null (not today / no schedule / block gone or switched off).
 * Per-date entries may not keep the weekly entry's id, so a block is also matched by its name (see test table).
 */
export function resolveLink(link, schedule, scheduleDates, dateISO) {
  if (!schedule) return null;
  const eff = getEffectiveSchedule(schedule, scheduleDates || {}, dateISO);
  const m = blockMatches(link);
  const hit = eff.entries.find((e) => link.entryId && e.id === link.entryId) || eff.entries.find(m);
  const times = (e) => { const start = hm(e.time); let end = hm(e.endTime); if (end != null && start != null && end <= start) end = null; return { start, end }; };
  if (hit) { const t = times(hit); return t.start == null ? null : t; }
  if (eff.source === 'date') {
    const block = linkedBlock(link, schedule);
    if (block && weeklyEntriesFor(schedule, dateISO).some((e) => e === block || (block.id && e.id === block.id))) {
      const t = times(block);
      return t.start == null ? null : { cancelled: true, ...t };
    }
  }
  return null;
}

// ── what is on today ──────────────────────────────────────────────────────────

/**
 * The shiurim of one date, sorted by start: [{ id, shiur, person, start, end, linked, cancelled, reason, moved, note, place, placeHe, groupLabel }].
 * reason = 'schedule' (the schedule removed the linked block that day: never shown on the TV) | 'today' (a one-day
 * cancellation; shown with a Cancelled mark unless settings.cancelledShow = 'hide'). `includeHidden` keeps both (admin).
 * ctx = { schedule, scheduleDates, groups, changesFrom } (changesFrom: one-day changes before it are ignored, so a past day of
 * the week page is not rewritten by old cancellations).
 */
export function shiurimOn(file, dateISO, ctx = {}) {
  if (!file || !isISODate(dateISO)) return [];
  const people = new Map((file.people || []).map((p) => [p.id, p]));
  const code = dayCodeOf(dateISO);
  const useChanges = ctx.changesFrom == null || dateISO >= ctx.changesFrom;
  const today = (file.changes || {})[dateISO] || {};
  const out = [];
  for (const s of file.shiurim || []) {
    if (s.enabled === false) continue;
    if (s.season && (dateISO < s.season.from || dateISO > s.season.until)) continue;
    let start = null, end = null, linked = false, cancelled = false, reason = '';
    if (s.when.kind === 'weekly') {
      if (!s.when.days.includes(code)) continue;
      start = hm(s.when.start); end = hm(s.when.end);
    } else {
      linked = true;
      const r = resolveLink(s.when, ctx.schedule, ctx.scheduleDates, dateISO);
      if (!r) continue;
      start = r.start; end = r.end;
      if (r.cancelled) { cancelled = true; reason = 'schedule'; }
    }
    if (start == null) continue;
    const ch = useChanges ? today[s.id] : null;
    let moved = false;
    if (ch) {
      if (ch.cancelled && !cancelled) { cancelled = true; reason = 'today'; }
      if (ch.start && hm(ch.start) != null) { start = hm(ch.start); end = ch.end ? hm(ch.end) : null; moved = true; }
    }
    if (cancelled && !ctx.includeHidden && (reason === 'schedule' || file.settings?.cancelledShow === 'hide')) continue;
    out.push({
      id: s.id, shiur: s, person: s.personId ? people.get(s.personId) || null : null, start, end, linked, cancelled, reason, moved,
      note: ch?.note || s.note || '', place: ch?.place || s.place, placeHe: ch?.place ? '' : s.placeHe,
      groupLabel: s.groups?.length && !linked ? groupNames(s.groups, ctx.groups) : '',
    });
  }
  return out.sort((a, b) => a.start - b.start || (a.end ?? a.start) - (b.end ?? b.start) || String(a.person?.name || '').localeCompare(String(b.person?.name || '')));
}

function groupNames(ids, groups) {
  const by = new Map((groups || []).map((g) => [g.id, g]));
  return ids.map((id) => by.get(id)?.short || by.get(id)?.name || '').filter(Boolean).join(' & ');
}

/** Sort for the Today list: by time (default) or by rebbe (list order), cancelled last within the same key. */
export function sortRows(rows, file, mode = 'time') {
  if (mode !== 'rebbe') return rows;
  const order = new Map((file?.people || []).map((p, i) => [p.id, i]));
  return [...rows].sort((a, b) => (order.get(a.person?.id) ?? 999) - (order.get(b.person?.id) ?? 999) || a.start - b.start);
}

/** Now / next / past marks for a date's rows at `minutes` (only meaningful when the rows are today's). */
export function currentNext(rows, minutes) {
  const live = (rows || []).filter((r) => !r.cancelled);
  const endOf = (r) => r.end ?? r.start + DEFAULT_LENGTH_MIN;
  const now = live.filter((r) => r.start <= minutes && minutes < endOf(r)).map((r) => r.id);
  const future = live.filter((r) => r.start > minutes);
  const nextStart = future.length ? Math.min(...future.map((r) => r.start)) : null;
  const next = nextStart == null ? [] : future.filter((r) => r.start === nextStart).map((r) => r.id);
  const past = live.filter((r) => endOf(r) <= minutes).map((r) => r.id);
  return { now, next, past };
}

// ── the week ──────────────────────────────────────────────────────────────────

/** The week the By-rebbe / By-day page shows: the calendar week of `today`; on Shabbos it is next week. */
export function focusWeek(today) {
  return dayCodeOf(today) === 'Shabbos' ? addDays(weekStartOf(today), 7) : weekStartOf(today);
}

function weekRows(file, weekStart, today, ctx) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const rows = shiurimOn(file, date, { ...ctx, changesFrom: today }).filter((r) => !r.cancelled);
    out.push({ code: DAYS[i], date, rows });
  }
  return out;
}

/**
 * The week by rebbe: [{ person, lines: [{ days: ['Sun','Tue'], start, end, title, titleHe, place, placeHe, linked }] }], in the people
 * list's order (shiurim without a person last). Days with the same time collapse into one line.
 */
export function byRebbe(file, today, ctx = {}) {
  const week = weekRows(file, focusWeek(today), today, ctx);
  const groups = new Map();
  for (const d of week) {
    for (const r of d.rows) {
      const key = r.person?.id || '';
      if (!groups.has(key)) groups.set(key, { person: r.person, lines: new Map() });
      const g = groups.get(key);
      const lk = `${r.id}|${r.start}|${r.end ?? ''}|${r.place}`;
      if (!g.lines.has(lk)) g.lines.set(lk, { days: [], start: r.start, end: r.end, title: r.shiur.title, titleHe: r.shiur.titleHe, place: r.place, placeHe: r.placeHe, linked: r.linked, note: r.note, groupLabel: r.groupLabel, first: DAYS.indexOf(d.code) });
      g.lines.get(lk).days.push(d.code);
    }
  }
  const order = new Map((file.people || []).map((p, i) => [p.id, i]));
  return [...groups.entries()]
    .sort((a, b) => (order.has(a[0]) ? order.get(a[0]) : 999) - (order.has(b[0]) ? order.get(b[0]) : 999))
    .map(([, g]) => ({ person: g.person, lines: [...g.lines.values()].sort((a, b) => a.first - b.first || a.start - b.start) }));
}

/** The week by day: [{ code, date, today, lines: rows }] for the days that have a shiur. */
export function byDay(file, today, ctx = {}) {
  return weekRows(file, focusWeek(today), today, ctx).filter((d) => d.rows.length).map((d) => ({ code: d.code, date: d.date, today: d.date === today, lines: d.rows }));
}

export function weekHasAny(file, today, ctx = {}) { return weekRows(file, focusWeek(today), today, ctx).some((d) => d.rows.length); }

// ── in the rotation? ──────────────────────────────────────────────────────────

/**
 * Is the SHIURIM slide in the rotation now? It has something to show (today's list, or the week) AND is inside the admin's
 * 'when it shows' window. `data` is the kiosk document (forKiosk), ctx the schedule.
 */
export function shiurimVisible(data, now, tz, ctx = {}) {
  if (!data || !data.shiurim?.length) return false;
  const z = zonedParts(now, tz || DEFAULT_TZ);
  const s = data.settings || DEFAULT_SETTINGS;
  if (s.showWhen === 'hours') {
    const a = hm(s.hoursFrom) ?? 0, b = hm(s.hoursTo) ?? 1440;
    if (!(a <= b ? z.minutes >= a && z.minutes < b : z.minutes >= a || z.minutes < b)) return false;
  }
  const todayRows = shiurimOn(data, z.date, ctx);
  if (s.view === 'week') return weekHasAny(data, z.date, ctx);
  if (todayRows.length) return true;
  if (s.view === 'today' || s.whenNone === 'hide') return false;
  return weekHasAny(data, z.date, ctx);
}

// ── guest speakers ────────────────────────────────────────────────────────────

/** { from, start, end, over }: Date objects. `end` includes the admin's 'keep it up N minutes after' grace. */
export function guestWindow(g, settings, tz) {
  const s = settings || DEFAULT_SETTINGS;
  const z = tz || DEFAULT_TZ;
  const from = zonedTimeToUtc(g.showFrom || addDays(g.date, -s.guestLeadDays), '00:00', z);
  const start = g.start ? zonedTimeToUtc(g.date, g.start, z) : null;
  let end;
  if (g.end) end = zonedTimeToUtc(g.date, g.end, z);
  else if (start) end = new Date(start.getTime() + GUEST_DEFAULT_LENGTH_MIN * 60000);
  else end = zonedTimeToUtc(addDays(g.date, 1), '00:00', z);
  return { from, start, end, over: new Date(end.getTime() + (s.guestAfterMin || 0) * 60000) };
}

/** 'scheduled' (before the window) | 'ahead' | 'today' | 'now' | 'over'. */
export function guestPhase(g, now, settings, tz) {
  const w = guestWindow(g, settings, tz);
  const t = now.getTime();
  if (t >= w.over.getTime()) return 'over';
  if (t < w.from.getTime()) return 'scheduled';
  if (t >= w.end.getTime()) return 'over-grace';
  if (w.start && t >= w.start.getTime()) return 'now';
  if (!w.start && zonedParts(now, tz || DEFAULT_TZ).date === g.date) return 'now';
  return zonedParts(now, tz || DEFAULT_TZ).date === g.date ? 'today' : 'ahead';
}

/** The guests on the screen now: [{ guest, phase: 'ahead'|'today'|'now', whenWords }] sorted by date and time. */
export function guestsActive(data, now, tz) {
  const s = data?.settings || DEFAULT_SETTINGS;
  const out = [];
  for (const g of data?.guests || []) {
    if (g.archivedAt) continue;
    const p = guestPhase(g, now, s, tz);
    if (p === 'scheduled' || p === 'over') continue;
    const phase = p === 'over-grace' ? 'today' : p;
    out.push({ guest: g, phase, whenWords: whenWords(g, now, tz, phase) });
  }
  return out.sort((a, b) => a.guest.date.localeCompare(b.guest.date) || String(a.guest.start).localeCompare(String(b.guest.start)));
}

/** { day: {en,he}, time: '8:15 PM' | '', en, he }: the key fact of a guest card, from the one wording table. */
export function whenWords(g, now, tz, phase) {
  const z = zonedParts(now, tz || DEFAULT_TZ);
  const startMin = hm(g.start);
  const time = startMin == null ? '' : fmt12(startMin);
  let day;
  if (phase === 'now') day = WHEN.now;
  else if (g.date === z.date) day = startMin != null && startMin >= 17 * 60 ? WHEN.tonight : WHEN.today;
  else if (g.date === addDays(z.date, 1)) day = startMin != null && startMin >= 17 * 60 ? WHEN.tomorrowNight : WHEN.tomorrow;
  else {
    const dow = dayCodeOf(g.date);
    const diff = Math.round((Date.parse(`${g.date}T00:00:00Z`) - Date.parse(`${z.date}T00:00:00Z`)) / 86400000);
    if (diff > 1 && diff <= 6) day = { en: DAY_EN[dow], he: DAY_HE[dow] };
    else { const [, m, d] = g.date.split('-').map(Number); day = { en: `${DAY_EN_SHORT[dow]} ${monthShort(m)} ${d}`, he: `${DAY_HE[dow]} ${d}.${m}` }; }
  }
  const join = (d, sep) => (time && phase !== 'now' ? `${d}${sep}${time}` : d);
  return { day, time, en: join(day.en, ' · '), he: join(day.he, ' · ') };
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthShort = (m) => MONTHS[m - 1] || '';

/** 'starts in 2 h 10 min' words for a number of minutes (minute level, kiosk ticks once a minute). */
export function startsInWords(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60), r = m % 60;
  const en = h ? `${h} ${WORDS.hour.en}${r ? ` ${r} ${WORDS.minute.en}` : ''}` : `${r} ${WORDS.minute.en}`;
  const heT = h ? `${h} ${WORDS.hour.he}${r ? ` ${r} ${WORDS.minute.he}` : ''}` : `${r} ${WORDS.minute.he}`;
  return { en: fill(WORDS.startsIn.en, { t: en }), he: fill(WORDS.startsIn.he, { t: heT }) };
}

/** Minutes from `now` to the guest's start today (null when it has no start, is not today or has begun). */
export function minutesToStart(g, now, tz) {
  const z = zonedParts(now, tz || DEFAULT_TZ);
  const s = hm(g.start);
  if (s == null || g.date !== z.date || z.minutes >= s) return null;
  return s - z.minutes;
}

/**
 * Virtual announcement items for a guest (never written to announcements.json): an optional banner on the day and an optional
 * one-time takeover window ('Big words', style welcome). They go through the same selectActive() as real posts.
 */
export function guestTakeoverItems(data, now, tz) {
  const out = [];
  const s = data?.settings || DEFAULT_SETTINGS;
  const z = zonedParts(now, tz || DEFAULT_TZ);
  for (const g of data?.guests || []) {
    if (g.archivedAt || g.date !== z.date) continue;
    const w = guestWindow(g, s, tz);
    const name = g.name || g.nameHe;
    const place = g.place || g.placeHe;
    const phaseNow = guestPhase(g, now, s, tz);
    const ww = whenWords(g, now, tz, phaseNow === 'now' ? 'now' : 'today');
    const iso = (d) => d.toISOString();
    const base = { auto: 'shiurim', readOnly: true, createdAt: iso(w.from), status: 'published', hold: false, enabled: true, content: {}, look: {}, slide: {}, note: {}, takeover: {}, banner: {}, when: { startsAt: null, expiresAt: null, recurrence: null } };
    const parts = (day) => [name, g.start ? fmt12(hm(g.start)) : '', place].filter(Boolean).join(', ') || day;
    if (g.banner) {
      out.push({
        ...base, id: `shiurim-guest-${g.id}-banner`, display: 'banner', updatedAt: `${g.id}:b:${g.start}:${g.place}`,
        content: { headlineEn: `${g.title || WORDS.guest.en} ${ww.day.en.toLowerCase()}: ${parts()}`.slice(0, 280), headlineHe: g.nameHe ? `${g.titleHe || WORDS.guest.he} ${ww.day.he}: ${[g.nameHe, g.start ? fmt12(hm(g.start)) : '', g.placeHe || place].filter(Boolean).join(', ')}`.slice(0, 280) : '' },
        when: { startsAt: iso(zonedTimeToUtc(g.date, '00:00', tz)), expiresAt: iso(w.over), recurrence: null },
      });
    }
    if (g.takeover?.on) {
      const startMin = hm(g.start);
      const at = hm(g.takeover.at) ?? (startMin != null ? Math.max(0, startMin - 15) : 9 * 60);
      const from = zonedTimeToUtc(g.date, minToHHMM(at), tz);
      const until = new Date(from.getTime() + g.takeover.minutes * 60000);
      out.push({
        ...base, id: `shiurim-guest-${g.id}-takeover`, display: 'takeover', updatedAt: `${g.id}:t:${g.start}:${g.takeover.at}:${g.takeover.minutes}`,
        content: {
          headlineEn: `${g.title || WORDS.guest.en} ${ww.day.en.toLowerCase()}`.slice(0, 280), headlineHe: `${g.titleHe || WORDS.guest.he} ${ww.day.he}`.slice(0, 280),
          bodyEn: parts().slice(0, 400), bodyHe: [g.nameHe, g.start ? fmt12(hm(g.start)) : '', g.placeHe || place].filter(Boolean).join(', ').slice(0, 400),
        },
        look: { layout: 'bigwords', style: 'welcome', animation: 'entrance', fit: 'auto' },
        takeover: {},
        when: { startsAt: iso(from), expiresAt: iso(until), recurrence: null },
      });
    }
  }
  return out;
}

// ── a shiur's name on a Schedule row ──────────────────────────────────────────

const rowKeyOf = (e) => norm(e?.name || e?.nameHe);

/**
 * { byId, byName }: the short 'Rabbi Sample · Beis Medrash' line for each schedule block that has a linked shiur today (never a
 * cancelled one). The Schedule page looks a row up by id, then by name (per-date entries may not keep the id).
 */
export function scheduleTagMap(file, dateISO, ctx = {}, lang = 'en') {
  const out = { byId: {}, byName: {} };
  if (!file || file.settings?.showOnSchedule === false) return out;
  for (const r of shiurimOn(file, dateISO, ctx)) {
    if (!r.linked || r.cancelled) continue;
    const who = personName(r.person, lang);
    const where = lang === 'he' ? (r.placeHe || r.place) : (r.place || r.placeHe);
    const text = [who, file.settings?.showPlace === false ? '' : where].filter(Boolean).join(' · ');
    if (!text) continue;
    const l = r.shiur.when;
    if (l.entryId) out.byId[l.entryId] = text;
    for (const n of [l.entryName, l.entryNameHe]) if (n) out.byName[norm(n)] = text;
  }
  return out;
}
export function rowTag(map, entry) {
  if (!map || !entry) return '';
  return (entry.id && map.byId[entry.id]) || map.byName[rowKeyOf(entry)] || (entry.nameHe && map.byName[norm(entry.nameHe)]) || '';
}

// ── the kiosk / live copies ───────────────────────────────────────────────────

/** What /api/state and the SSE event carry: no notes of other people's, no archived guests, one-day changes for today onward. */
export function forKiosk(file, today) {
  const f = file || emptyFile();
  const keepFrom = today ? addDays(today, -1) : '0000-00-00';
  const changes = {};
  for (const [d, v] of Object.entries(f.changes || {})) if (d >= keepFrom) changes[d] = v;
  return {
    version: 1, settings: f.settings, people: f.people, shiurim: f.shiurim, changes,
    guests: (f.guests || []).filter((g) => !g.archivedAt && g.date >= keepFrom).slice(0, 12).map(({ archivedAt, ...g }) => g), // eslint-disable-line no-unused-vars
  };
}

/**
 * What a live viewer may get: guests only inside their window, photos only when the admin's 'photos on the live link'
 * switch is on, no archived or later talks, no notes.
 */
export function forViewer(data, now, tz) {
  if (!data || typeof data !== 'object') return data;
  const live = new Set(guestsActive(data, now, tz).map((x) => x.guest.id));
  const photos = data.settings?.liveView !== false;
  const strip = (x) => (photos ? x : { ...x, photo: null });
  return {
    ...data,
    people: (data.people || []).map(strip),
    guests: (data.guests || []).filter((g) => live.has(g.id)).map(strip),
    shiurim: (data.shiurim || []).map((s) => ({ ...s, note: '' })),
  };
}

// ── the admin's "needs attention" list ────────────────────────────────────────

/** [{ shiurId, kind: 'gone' | 'off' | 'noperson', text }] so a shiur that cannot show tells the admin why. */
export function attention(file, schedule) {
  const out = [];
  for (const s of file?.shiurim || []) {
    if (s.when.kind === 'linked') {
      const b = schedule ? linkedBlock(s.when, schedule) : null;
      if (schedule && !b) out.push({ shiurId: s.id, kind: 'gone', text: `'${s.title || s.titleHe}': the schedule block it follows was deleted. Pick a time or link another block.` });
      else if (b && b.enabled === false) out.push({ shiurId: s.id, kind: 'off', text: `'${s.title || s.titleHe}': the schedule block it follows is switched off.` });
    }
  }
  return out;
}

/** What the admin's list says about when a shiur runs ('Sun, Tue 8:15 PM - 9:00 PM' / 'follows: Seder Gemara'). */
export function whenLabel(s, schedule) {
  if (s.when.kind === 'weekly') return `${dayRangeLabel(s.when.days)} ${fmtHHMM(s.when.start)}${s.when.end ? ` - ${fmtHHMM(s.when.end)}` : ''}`;
  const b = schedule ? linkedBlock(s.when, schedule) : null;
  const t = b ? ` ${fmtHHMM(b.time)}` : '';
  return `Follows '${s.when.entryName || s.when.entryNameHe}'${t}`;
}

/** ['Sun','Mon','Tue','Wed'] -> 'Sun-Wed'; ['Sun','Tue'] -> 'Sun, Tue'. */
export function dayRangeLabel(days, short = DAY_EN_SHORT) {
  const idx = (days || []).map((d) => DAYS.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return '';
  const runs = [];
  for (const i of idx) { const last = runs[runs.length - 1]; if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]); }
  return runs.map(([a, b]) => (b - a >= 2 ? `${short[DAYS[a]]}-${short[DAYS[b]]}` : a === b ? short[DAYS[a]] : `${short[DAYS[a]]}, ${short[DAYS[b]]}`)).join(', ');
}

// ── changes (mutations are pure: file in, file out; they throw ShiurimError) ─────

const clone = (f) => JSON.parse(JSON.stringify(f));
const need = (list, id, what) => { const x = list.find((i) => i.id === id); if (!x) throw new ShiurimError(`That ${what} is not in the list any more.`); return x; };
const pickKeys = (o, keys) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o[k]]));

export function upsertPerson(file, input, id) {
  const f = clone(file);
  const cur = id ? need(f.people, id, 'person') : null;
  if (!cur && f.people.length >= LIMITS.people) throw new ShiurimError(`You can list ${LIMITS.people} people at most.`);
  const merged = { ...(cur || {}), ...pickKeys(input, ['name', 'nameHe', 'photo']), id: cur?.id };
  const p = normalizePerson(merged, { strict: true });
  if (cur) Object.assign(cur, p); else f.people.push(p);
  return { file: f, id: p.id };
}

export function removePerson(file, id) {
  const f = clone(file);
  need(f.people, id, 'person');
  const gone = f.shiurim.filter((s) => s.personId === id).map((s) => s.id);
  f.people = f.people.filter((p) => p.id !== id);
  f.shiurim = f.shiurim.filter((s) => s.personId !== id);
  for (const d of Object.keys(f.changes || {})) { for (const sid of gone) delete f.changes[d][sid]; if (!Object.keys(f.changes[d]).length) delete f.changes[d]; }
  return { file: f, removedShiurim: gone.length };
}

export function movePerson(file, id, dir) {
  const f = clone(file);
  const i = f.people.findIndex((p) => p.id === id);
  if (i < 0) throw new ShiurimError('That person is not in the list any more.');
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= f.people.length) return f;
  [f.people[i], f.people[j]] = [f.people[j], f.people[i]];
  return f;
}

export function upsertShiur(file, input, id) {
  const f = clone(file);
  const cur = id ? need(f.shiurim, id, 'shiur') : null;
  if (!cur && f.shiurim.length >= LIMITS.shiurim) throw new ShiurimError(`You can list ${LIMITS.shiurim} shiurim at most.`);
  const merged = { ...(cur || {}), ...pickKeys(input, ['personId', 'title', 'titleHe', 'place', 'placeHe', 'when', 'groups', 'season', 'enabled', 'note']), id: cur?.id };
  const s = normalizeShiur(merged, f.people, { strict: true });
  if (cur) Object.assign(cur, s); else f.shiurim.push(s);
  return { file: f, id: s.id };
}

export function removeShiur(file, id) {
  const f = clone(file);
  need(f.shiurim, id, 'shiur');
  f.shiurim = f.shiurim.filter((s) => s.id !== id);
  for (const d of Object.keys(f.changes || {})) { delete f.changes[d][id]; if (!Object.keys(f.changes[d]).length) delete f.changes[d]; }
  return f;
}

export function upsertGuest(file, input, id) {
  const f = clone(file);
  const cur = id ? need(f.guests, id, 'guest speaker') : null;
  if (!cur && f.guests.length >= LIMITS.guests) throw new ShiurimError(`You can list ${LIMITS.guests} guest speakers at most. Remove old ones first.`);
  const merged = { ...(cur || {}), ...pickKeys(input, [...GUEST_FIELDS, 'date', 'start', 'end', 'showFrom', 'photo', 'link', 'takeover', 'banner']), id: cur?.id, archivedAt: cur?.archivedAt || null };
  const g = normalizeGuest(merged, { strict: true });
  if (cur) Object.assign(cur, g); else f.guests.push(g);
  return { file: f, id: g.id };
}

/**
 * Guest-speaker takeovers need the takeover permission (red-team 2026-11-01 F8). For a person without it, put every
 * guest's `takeover` back to what was stored before (a new guest: off), whatever the request said, so an edit by them
 * neither turns one on nor silently removes an admin's.
 */
export function keepGuestTakeovers(before, after) {
  if (!after || !Array.isArray(after.guests)) return after;
  const was = new Map((before?.guests || []).map((g) => [g.id, g.takeover]));
  const out = clone(after);
  for (const g of out.guests) g.takeover = was.has(g.id) ? clone(was.get(g.id)) : { on: false, minutes: 10, at: null };
  return out;
}

export function removeGuest(file, id) {
  const f = clone(file);
  need(f.guests, id, 'guest speaker');
  f.guests = f.guests.filter((g) => g.id !== id);
  return f;
}

export function setSettings(file, patch) {
  const f = clone(file);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new ShiurimError('Nothing to change.');
  if ('hoursFrom' in patch && !hhmm(patch.hoursFrom)) throw new ShiurimError('Pick a valid time.');
  if ('hoursTo' in patch && !hhmm(patch.hoursTo)) throw new ShiurimError('Pick a valid time.');
  f.settings = normalizeSettings({ ...f.settings, ...patch });
  return f;
}

export function setPhoto(file, kind, id, photo) {
  const f = clone(file);
  const list = kind === 'guest' ? f.guests : f.people;
  const x = need(list, id, kind === 'guest' ? 'guest speaker' : 'person');
  x.photo = photo ? normalizePhoto(photo) : null;
  if (photo && !x.photo) throw new ShiurimError('That photo is not valid.');
  return f;
}

/** A one-date change of one shiur (null clears it). The Today card calls it with the screen's own today. */
export function setChange(file, date, shiurId, change) {
  const f = clone(file);
  if (!isISODate(date)) throw new ShiurimError('Pick a date.');
  need(f.shiurim, shiurId, 'shiur');
  f.changes = f.changes || {};
  const c = change == null ? null : normalizeChange(change);
  if (change != null && !c) throw new ShiurimError('Nothing to change.');
  if (change != null && c.start && c.end && hm(c.end) <= hm(c.start)) throw new ShiurimError('The end time must be after the start time.');
  if (!c) { if (f.changes[date]) { delete f.changes[date][shiurId]; if (!Object.keys(f.changes[date]).length) delete f.changes[date]; } return f; }
  if (!f.changes[date] && Object.keys(f.changes).length >= LIMITS.changeDates) throw new ShiurimError('Too many one-day changes. They clear themselves after a couple of weeks.');
  f.changes[date] = { ...(f.changes[date] || {}), [shiurId]: c };
  return f;
}

/**
 * Today card ops on the screen's own today: cancel (a one-off 'Cancelled today' note), restore, move (new time and/or place),
 * note (a one-line note on the row).
 */
export function todayOp(file, date, op, a = {}) {
  const cur = ((file.changes || {})[date] || {})[a.shiurId] || {};
  switch (op) {
    case 'cancel': return setChange(file, date, a.shiurId, { ...cur, cancelled: true, note: a.note !== undefined ? a.note : (cur.note || WORDS.cancelledToday.en) });
    case 'restore': return setChange(file, date, a.shiurId, cur.start || cur.place || (cur.note && !cur.cancelled) ? { ...cur, cancelled: false, note: cur.cancelled ? '' : cur.note } : null);
    case 'move': {
      if (!hhmm(a.start)) throw new ShiurimError('Pick the new start time.');
      if (a.end && hm(a.end) != null && hm(a.end) <= hm(a.start)) throw new ShiurimError('The end time must be after the start time.');
      return setChange(file, date, a.shiurId, { ...cur, cancelled: false, start: a.start, end: a.end || '', place: a.place || cur.place || '', note: a.note !== undefined ? a.note : cur.note || '' });
    }
    case 'note': return setChange(file, date, a.shiurId, { ...cur, note: a.note || '' });
    case 'reset': return setChange(file, date, a.shiurId, null);
    default: throw new ShiurimError('Unknown change.');
  }
}

/** Put records back (Undo): upsert by id, remove by id; never replaces the whole document. */
export function restoreRecords(file, { upsert = {}, remove = {} } = {}) {
  const f = clone(file);
  const put = (list, rec, norm_) => { const n = norm_(rec); if (!n) return; const i = list.findIndex((x) => x.id === n.id); if (i >= 0) list[i] = n; else list.push(n); };
  for (const p of upsert.people || []) put(f.people, p, (r) => normalizePerson(r));
  for (const s of upsert.shiurim || []) put(f.shiurim, s, (r) => normalizeShiur(r, f.people));
  for (const g of upsert.guests || []) put(f.guests, g, (r) => normalizeGuest(r));
  const drop = (list, ids) => (Array.isArray(ids) && ids.length ? list.filter((x) => !ids.includes(x.id)) : list);
  f.people = drop(f.people, remove.people); f.shiurim = drop(f.shiurim, remove.shiurim); f.guests = drop(f.guests, remove.guests);
  for (const [date, per] of Object.entries(upsert.changes || {})) {
    if (!isISODate(date) || !per || typeof per !== 'object') continue;
    for (const [sid, ch] of Object.entries(per)) { if (!f.shiurim.some((s) => s.id === sid)) continue; const c = normalizeChange(ch); f.changes[date] = { ...(f.changes[date] || {}), ...(c ? { [sid]: c } : {}) }; }
  }
  return f;
}

// ── import / export ───────────────────────────────────────────────────────────

const LETTER_DAYS = { א: 'Sun', ב: 'Mon', ג: 'Tue', ד: 'Wed', ה: 'Thu', ו: 'Fri', ש: 'Shabbos' };
export function dayFromWord(w) {
  const k = String(w ?? '').toLowerCase().replace(/[׳'"”“״.]/g, '').replace(/\s+/g, ' ').trim();
  if (!k) return null;
  return DAY_WORDS[k] || LETTER_DAYS[k] || DAY_WORDS[k.replace(/^יום /, '')] || null;
}

function parseDays(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  if (/^(daily|every ?day|all week|כל יום|יומי)$/i.test(t)) return DAYS.slice(0, 6);
  const set = new Set();
  for (const part of t.split(/\s*(?:,|&|\+|\/|;|\band\b)\s*/i)) {
    const p = part.trim();
    if (!p) continue;
    const range = p.split(/\s*[-–—]\s*|\s+(?:to|through|thru|עד)\s+/i);
    if (range.length === 2) {
      const a = dayFromWord(range[0]), b = dayFromWord(range[1]);
      if (!a || !b) return null;
      let i = DAYS.indexOf(a); const j = DAYS.indexOf(b);
      for (let n = 0; n < 8; n++) { set.add(DAYS[i]); if (i === j) break; i = (i + 1) % 7; }
    } else if (range.length === 1) {
      const d = dayFromWord(p); if (!d) return null; set.add(d);
    } else return null;
  }
  return DAYS.filter((d) => set.has(d));
}

/** '8:15 PM - 9:00 PM' | '8:15-9:00 PM' | '20:15-21:00' | '1:30 PM' -> { start, end, warn } or null. */
export function parseTimeRange(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const sides = t.split(/\s*(?:-|–|—|\bto\b|\buntil\b|עד)\s*/i).filter(Boolean);
  if (sides.length < 1 || sides.length > 2) return null;
  const one = (x) => { const m = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?$/i.exec(x.trim()); if (!m) return null; return { h: +m[1], mi: m[2] == null ? 0 : +m[2], ap: m[3] ? m[3].toLowerCase() : '', lead0: /^0\d/.test(x.trim()), colon: m[2] != null }; };
  const a = one(sides[0]); const b = sides[1] ? one(sides[1]) : null;
  if (!a || (sides[1] && !b)) return null;
  const warns = [];
  const to24 = (x, inherit) => {
    if (x.mi > 59 || x.h > 23) return null;
    const ap = x.ap || inherit;
    if (ap) { if (x.h < 1 || x.h > 12) return null; return (x.h % 12) * 60 + x.mi + (ap === 'p' ? 720 : 0); }
    if (x.h === 0 || x.h >= 13 || x.lead0) return x.h * 60 + x.mi;
    if (x.h === 12) return 12 * 60 + x.mi;
    if (x.h <= 6) { warns.push('assumed PM'); return (x.h + 12) * 60 + x.mi; }
    warns.push('assumed AM, write PM if it is the evening');
    return x.h * 60 + x.mi;
  };
  let start = to24(a, b && !a.ap ? b.ap : '');
  const end = b ? to24(b, '') : null;
  if (start == null || (b && end == null)) return null;
  if (b && end != null && start >= end && !a.ap && b.ap) { const alt = to24(a, b.ap === 'p' ? 'a' : 'p'); if (alt != null && alt < end) start = alt; }
  if (end != null && end <= start) return null;
  return { start: minToHHMM(start), end: end == null ? '' : minToHHMM(end), warn: [...new Set(warns)] };
}

/** 'English / עברית' -> { en, he }. A Hebrew-only text goes to he; mixed text stays English. */
function splitBi(raw, max) {
  const s = line(raw, max * 2 + 3);
  if (s.includes(' / ')) { const [a, b] = s.split(' / ').map((x) => x.trim()); if (HEB.test(b) && !HEB.test(a)) return { en: line(a, max), he: line(b, max) }; if (HEB.test(a) && !HEB.test(b)) return { en: line(b, max), he: line(a, max) }; }
  if (isHebOnly(s)) return { en: '', he: line(s, max) };
  return { en: line(s, max), he: '' };
}

const SEASON = /^season:?\s*(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to|–|—|-)\s*(\d{4}-\d{2}-\d{2})$/i;
const HEADER_FIRST = new Set(['rebbe', 'rabbi', 'who', 'name', 'teacher', 'person', 'speaker', 'מרצה', 'רב', 'שם']);

function parseRow(cells, ctx, lineNo, warnings) {
  const f = cells.map((c) => line(c, LIMITS.sheetCell));
  while (f.length && !f[f.length - 1]) f.pop();
  if (f.length < 4) throw new ShiurimError(`Line ${lineNo}: need at least who | what | where | days and time (or schedule: block).`);
  const [who, what, where, whenText, ...extras] = f;
  const person = ['', '-', '–', '—'].includes(who) ? null : splitBi(who, LIMITS.name);
  const title = splitBi(what, LIMITS.title);
  if (!title.en && !title.he) throw new ShiurimError(`Line ${lineNo}: the shiur needs a name.`);
  const place = splitBi(where, LIMITS.place);
  const shiur = { title: title.en, titleHe: title.he, place: place.en, placeHe: place.he, enabled: true, note: '', season: null, groups: [] };
  const link = /^(?:schedule|block|לוח(?: זמנים)?)\s*[:=]\s*(.+)$/i.exec(whenText);
  let rest = extras;
  if (link) {
    const name = norm(link[1]);
    const blocks = (ctx.schedule?.entries || []).filter((e) => norm(e.name) === name || norm(e.nameHe) === name);
    if (!ctx.schedule) throw new ShiurimError(`Line ${lineNo}: the schedule is not available to link to '${line(link[1], 60)}'.`);
    if (!blocks.length) throw new ShiurimError(`Line ${lineNo}: no schedule block is named '${line(link[1], 60)}'.`);
    if (blocks.length > 1) warnings.push({ line: lineNo, message: `Several schedule blocks are named '${line(link[1], 60)}'; the first one is used.` });
    shiur.when = { kind: 'linked', entryId: blocks[0].id || '', entryName: line(blocks[0].name, LIMITS.name), entryNameHe: line(blocks[0].nameHe, LIMITS.name) };
  } else {
    // days and time may share one cell ('Sun, Tue 8:15 PM') or sit in two
    let daysText = whenText, timeText = extras[0] ?? '';
    const split = /^(.*?)(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\s*(?:(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)?)\s*$/i.exec(whenText);
    if (split && split[1].trim() && !parseTimeRange(extras[0] ?? '')) { daysText = split[1].trim(); timeText = split[2]; } else rest = extras.slice(1);
    const days = parseDays(daysText);
    if (!days || !days.length) throw new ShiurimError(`Line ${lineNo}: could not read the days '${line(daysText, 40)}'. Try Sun, Tue or Mon-Thu.`);
    const tr = parseTimeRange(timeText);
    if (!tr) throw new ShiurimError(`Line ${lineNo}: could not read the time '${line(timeText, 40)}'. Try 8:15 PM - 9:00 PM.`);
    for (const w of tr.warn) warnings.push({ line: lineNo, message: `Time ${w}.` });
    shiur.when = { kind: 'weekly', days, start: tr.start, end: tr.end };
  }
  for (const x of rest) {
    if (!x) continue;
    let m;
    if ((m = SEASON.exec(x))) {
      if (!isISODate(m[1]) || !isISODate(m[2]) || m[2] < m[1]) throw new ShiurimError(`Line ${lineNo}: the season dates are not valid.`);
      shiur.season = { from: m[1], until: m[2] };
    } else if ((m = /^note:?\s*(.+)$/i.exec(x))) shiur.note = line(m[1], LIMITS.note);
    else if (/^(off|disabled|paused)$/i.test(x)) shiur.enabled = false;
    else throw new ShiurimError(`Line ${lineNo}: do not know '${line(x, 40)}'. Use season 2026-11-01..2027-03-15, note: ..., or off.`);
  }
  return { person, shiur };
}

/**
 * Paste / spreadsheet import. `rows` = an array of cell arrays (from .xlsx/.csv), `text` = the 'TachTach shiurim v1' lines
 * ('|' or tab separated). All-or-nothing: any error leaves nothing to apply. Returns { people, shiurim, errors, warnings, counts }.
 * ctx = { schedule } (to resolve 'schedule: Block name').
 */
export function parseShiurimInput({ text, rows } = {}, file, ctx = {}) {
  const errors = [], warnings = [];
  const raw = [];
  if (Array.isArray(rows)) {
    if (rows.length > LIMITS.sheetRows) errors.push({ line: 0, message: `Too many rows (limit ${LIMITS.sheetRows}).` });
    rows.slice(0, LIMITS.sheetRows).forEach((r, i) => {
      if (!Array.isArray(r)) return;
      const cells = r.slice(0, LIMITS.sheetCols).map((c) => (c == null ? '' : String(c)));
      if (!cells.some((c) => c.trim())) return;
      if (i === 0 && HEADER_FIRST.has(cells[0].trim().toLowerCase())) return;
      raw.push({ n: i + 1, cells });
    });
  } else {
    const t = String(text ?? '');
    if (t.length > LIMITS.importText) errors.push({ line: 0, message: 'That text is too long to import.' });
    const lines = t.slice(0, LIMITS.importText).split(/\r?\n/);
    if (lines.length > LIMITS.importLines) errors.push({ line: 0, message: `Too many lines (limit ${LIMITS.importLines}).` });
    lines.slice(0, LIMITS.importLines).forEach((l, i) => {
      const s = l.trim();
      if (!s || s.startsWith('#')) return;
      if (s.length > LIMITS.importLine) { errors.push({ line: i + 1, message: 'This line is too long.' }); return; }
      const sep = s.includes('|') ? '|' : s.includes('\t') ? '\t' : null;
      if (!sep) { errors.push({ line: i + 1, message: 'Separate the parts with | (who | what | where | days | time).' }); return; }
      raw.push({ n: i + 1, cells: s.split(sep) });
    });
  }
  const people = new Map(); // key -> { name, nameHe, existingId }
  const existing = file?.people || [];
  const find = (p) => existing.find((e) => (p.en && norm(e.name) === norm(p.en)) || (p.he && norm(e.nameHe) === norm(p.he)));
  const shiurim = [];
  for (const { n, cells } of raw) {
    try {
      const r = parseRow(cells, ctx, n, warnings);
      let key = null;
      if (r.person) {
        const ex = find(r.person);
        key = ex ? `id:${ex.id}` : `new:${norm(r.person.en || r.person.he)}`;
        if (!people.has(key)) people.set(key, { key, name: r.person.en, nameHe: r.person.he, existingId: ex?.id || null });
      }
      shiurim.push({ line: n, personKey: key, ...r.shiur });
    } catch (e) {
      if (e instanceof ShiurimError) errors.push({ line: n, message: e.message.replace(/^Line \d+: /, '') }); else throw e;
    }
  }
  errors.sort((a, b) => a.line - b.line);
  const newPeople = [...people.values()].filter((p) => !p.existingId);
  if (existing.length + newPeople.length > LIMITS.people) errors.push({ line: 0, message: `That would make more than ${LIMITS.people} people.` });
  return { people: [...people.values()], shiurim, errors, warnings, counts: { shiurim: shiurim.length, newPeople: newPeople.length } };
}

/** Apply a clean parse: 'replace' swaps the whole shiurim list, 'add' appends (skipping an identical shiur already there). */
export function applyImport(file, parsed, { mode = 'replace' } = {}) {
  if (parsed.errors.length) throw new ShiurimError('Fix the lines marked first.');
  const f = clone(file);
  const ids = new Map();
  for (const p of parsed.people) {
    if (p.existingId) { ids.set(p.key, p.existingId); continue; }
    const n = normalizePerson({ name: p.name, nameHe: p.nameHe });
    f.people.push(n); ids.set(p.key, n.id);
  }
  if (f.people.length > LIMITS.people) throw new ShiurimError(`That would make more than ${LIMITS.people} people.`);
  const sig = (s) => JSON.stringify([s.personId, s.title, s.titleHe, s.when]);
  const base = mode === 'replace' ? [] : f.shiurim;
  const seen = new Set(base.map(sig));
  const next = [...base];
  for (const r of parsed.shiurim) {
    const s = normalizeShiur({ ...r, personId: r.personKey ? ids.get(r.personKey) : null }, f.people, { strict: true });
    if (seen.has(sig(s))) continue;
    seen.add(sig(s)); next.push(s);
  }
  if (next.length > LIMITS.shiurim) throw new ShiurimError(`That would make more than ${LIMITS.shiurim} shiurim.`);
  f.shiurim = next;
  const keep = new Set(next.map((s) => s.id));
  for (const d of Object.keys(f.changes)) { for (const id of Object.keys(f.changes[d])) if (!keep.has(id)) delete f.changes[d][id]; if (!Object.keys(f.changes[d]).length) delete f.changes[d]; }
  return f;
}

const joinBi = (en, he) => (en && he ? `${en} / ${he}` : en || he || '');
/** 'Copy as text' in the import format (round-trips through parseShiurimInput). */
export function formatShiurimText(file) {
  const people = new Map((file.people || []).map((p) => [p.id, p]));
  const out = [IMPORT_HEADER];
  for (const s of file.shiurim || []) {
    const p = people.get(s.personId);
    const cells = [p ? joinBi(p.name, p.nameHe) : '-', joinBi(s.title, s.titleHe), joinBi(s.place, s.placeHe)];
    if (s.when.kind === 'linked') cells.push(`schedule: ${s.when.entryName || s.when.entryNameHe}`);
    else cells.push(dayRangeLabel(s.when.days), `${fmtHHMM(s.when.start)}${s.when.end ? ` - ${fmtHHMM(s.when.end)}` : ''}`);
    if (s.season) cells.push(`season ${s.season.from}..${s.season.until}`);
    if (s.note) cells.push(`note: ${s.note}`);
    if (!s.enabled) cells.push('off');
    out.push(cells.join(' | '));
  }
  return out.join('\n');
}

/** The sentence for the Claude button: turn a printed shiur list (PDF/photo) into the import lines. */
export function shiurimClaudePrompt() {
  return [
    'Turn the attached shiur list into lines for my school\'s screen, one shiur per line, exactly in this format',
    '(parts separated by |, times like 8:15 PM, days like Sun, Tue or Mon-Thu; add Hebrew after English with " / " when the list has both):',
    '',
    IMPORT_EXAMPLE,
    '',
    'Rules: one line per shiur and per set of days; keep names exactly as written; if the time is a range write both ends; do not invent anything that is not on the list; output only the lines.',
  ].join('\n');
}

// ── small display helpers (shared so the admin preview and the TV agree) ──────

const HONORIFICS = /^(?:rabbi|rav|reb|dr\.?|mr\.?|mrs\.?|harav|הרב|ר׳|ר'|רב|ד"ר|מר)\s+/i;
/** The letter in the circle when there is no photo: the first letter after Rabbi / Rav / Dr. */
export function monogram(name) {
  let s = line(name, 80);
  for (let i = 0; i < 2; i++) s = s.replace(HONORIFICS, '');
  const m = /[A-Za-z֐-׿]/.exec(s);
  return m ? m[0].toUpperCase() : '?';
}

/** Which of an English and a Hebrew text to draw under the admin's language choice: [first, second] (second may be ''). */
export function pickLang(en, he, language = 'both') {
  if (language === 'en') return [en || he || '', ''];
  if (language === 'he') return [he || en || '', ''];
  return [en || he || '', en && he ? he : ''];
}

/** Upload file names for a photo asset id (the only place that knows the naming; the private store replaces it later). */
export const photoFile = (id, thumb = false) => `spk-${id}${thumb ? '-t' : ''}.jpg`;
export const photoUrl = (id, thumb = false) => `/uploads/${photoFile(id, thumb)}`;
