/**
 * Quick messages: saved templates with blanks. Pure (no IO) so the server
 * (validation + ownership), the admin (the "+" sheet, editor, preview) and the
 * tests share one definition.
 *
 * A template: { id, ownerId (a person's id = personal; null = shared), text,
 * textHe, blanks: [{ key, label, type }], focus (blank key shown BIG, or null),
 * display, style, length: { kind: 'minutes'|'eod'|'forever', minutes? }, order }.
 *
 * `text` holds {key} placeholders. Posting turns a filled template into an
 * ordinary announcement using the 'notice' layout: what comes before the focus
 * blank is the small line above, the focus value is large (auto-fit), what
 * comes after is the small line below.
 */
import { to12h } from './announcements.js';
import { normalizeStyleId } from './takeoverStyles.js';

export const BLANK_TYPES = ['name', 'person', 'place', 'day', 'time', 'text'];
export const BLANK_TYPE_LABEL = { name: 'Name', person: 'Person', place: 'Place', day: 'Day', time: 'Time', text: 'Free text' };
/** Types whose recent values are remembered per person as quick chips. */
export const RECENT_TYPES = ['name', 'person', 'place'];
export const TEMPLATE_DISPLAYS = ['slide', 'banner', 'takeover'];
export const LENGTH_KINDS = ['minutes', 'eod', 'forever'];

export const LIMITS = { text: 300, label: 30, blanks: 6, value: 120, recents: 8, templates: 200 };
const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;
const PLACEHOLDER_RE = /\{([a-z][a-z0-9_]{0,23})\}/g;

/** Day chips: stored key -> [English, Hebrew]. */
export const DAYS = [
  ['today', 'Today', 'היום'], ['tomorrow', 'Tomorrow', 'מחר'],
  ['sun', 'Sunday', 'יום ראשון'], ['mon', 'Monday', 'יום שני'], ['tue', 'Tuesday', 'יום שלישי'],
  ['wed', 'Wednesday', 'יום רביעי'], ['thu', 'Thursday', 'יום חמישי'], ['fri', 'Friday', 'יום שישי'], ['shabbos', 'Shabbos', 'שבת'],
];
const DAY_BY_KEY = Object.fromEntries(DAYS.map(([k, en, he]) => [k, { en, he }]));

export class TemplateError extends Error {}

const str = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').slice(0, max);
const line = (v, max) => str(v, max).replace(/\s+/g, ' ').trim();

/** Placeholder keys used in a text, in order of first use. */
export function placeholdersIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(PLACEHOLDER_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Split text into [{ text } | { blank }] segments. */
export function segments(text) {
  const out = [];
  let last = 0;
  const s = String(text ?? '');
  for (const m of s.matchAll(PLACEHOLDER_RE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ blank: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** "Bochur name" -> "bochur_name" (a safe blank key). */
export function keyFromLabel(label) {
  const k = String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'b$1').slice(0, 24);
  return KEY_RE.test(k) ? k : '';
}

export function sanitizeLength(l) {
  const kind = LENGTH_KINDS.includes(l?.kind) ? l.kind : 'eod';
  if (kind !== 'minutes') return { kind };
  const n = Math.round(Number(l?.minutes));
  return { kind, minutes: Number.isFinite(n) && n >= 1 && n <= 10080 ? n : 60 };
}

/**
 * Whitelist + validate a template from a request body (create or full update).
 * Never reads id / ownerId / createdAt from the body: the server sets those.
 */
export function sanitizeTemplate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TemplateError('Invalid template.');
  const text = str(body.text, LIMITS.text).trim();
  if (!text) throw new TemplateError('Type the message first.');
  const textHe = str(body.textHe, LIMITS.text).trim();
  const rawBlanks = Array.isArray(body.blanks) ? body.blanks : [];
  if (rawBlanks.length > LIMITS.blanks) throw new TemplateError(`A template can have at most ${LIMITS.blanks} blanks.`);
  const blanks = [];
  for (const b of rawBlanks) {
    if (!b || typeof b !== 'object') throw new TemplateError('Invalid blank.');
    const key = String(b.key ?? '');
    if (!KEY_RE.test(key)) throw new TemplateError(`Blank name "${key.slice(0, 20)}" must be lowercase letters, numbers or _.`);
    if (blanks.some((x) => x.key === key)) throw new TemplateError(`Blank "${key}" is listed twice.`);
    blanks.push({ key, label: line(b.label, LIMITS.label) || key, type: BLANK_TYPES.includes(b.type) ? b.type : 'text' });
  }
  const used = [...new Set([...placeholdersIn(text), ...placeholdersIn(textHe)])];
  for (const k of used) if (!blanks.some((b) => b.key === k)) throw new TemplateError(`The message uses {${k}} but it is not in the list of blanks.`);
  // a blank nobody uses is just dropped
  const kept = blanks.filter((b) => used.includes(b.key));
  const focus = kept.some((b) => b.key === body.focus) ? body.focus : (kept[0]?.key || null);
  const display = TEMPLATE_DISPLAYS.includes(body.display) ? body.display : 'slide';
  return {
    text, textHe, blanks: kept, focus, display,
    style: body.style ? normalizeStyleId(body.style) : null,
    length: sanitizeLength(body.length),
  };
}

/** One value as text in one language ('en' | 'he'). */
export function formatValue(blank, value, lang = 'en') {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (blank.type === 'day') return DAY_BY_KEY[v]?.[lang] || v;
  if (blank.type === 'time') return /^\d{1,2}:\d{2}$/.test(v) ? to12h(v) : v;
  return v;
}

/** Which blanks still have no value. */
export function missingBlanks(tpl, values) {
  return (tpl.blanks || []).filter((b) => !String(values?.[b.key] ?? '').trim());
}

/** Fill a text: { pre, focus, post } where focus is the filled `tpl.focus` blank (or all text when none). */
export function fillText(text, tpl, values, lang) {
  const segs = segments(text);
  const render = (list) => list.map((s) => (s.blank ? formatValue((tpl.blanks || []).find((b) => b.key === s.blank) || { type: 'text' }, values?.[s.blank], lang) : s.text)).join('').replace(/\s+/g, ' ').trim();
  const at = tpl.focus ? segs.findIndex((s) => s.blank === tpl.focus) : -1;
  if (at < 0) return { pre: '', focus: render(segs), post: '' };
  return { pre: render(segs.slice(0, at)), focus: render(segs.slice(at, at + 1)), post: render(segs.slice(at + 1)) };
}

/** The whole message as one plain sentence (activity text, toast, list row). */
export function fillPlain(tpl, values, lang = 'en') {
  const t = fillText(lang === 'he' ? (tpl.textHe || tpl.text) : tpl.text, { ...tpl, focus: null }, values, lang);
  return t.focus;
}

/** The 'notice' content for the announcement: pre / focus / post in English and Hebrew. */
export function noticeContent(tpl, values) {
  const en = fillText(tpl.text, tpl, values, 'en');
  const he = tpl.textHe ? fillText(tpl.textHe, tpl, values, 'he') : { pre: '', focus: '', post: '' };
  // the focus is shown once when both languages would print the same thing (a name, a place)
  if (he.focus && he.focus === en.focus) he.focus = '';
  return { pre: en.pre, focus: en.focus, post: en.post, preHe: he.pre, focusHe: he.focus, postHe: he.post };
}

/** Expiry ISO for a length, from `now` (eod = 23:59 local time of the server's/browser's zone as given by `endOfDay`). */
export function expiryFor(length, now, endOfDay) {
  const l = sanitizeLength(length);
  if (l.kind === 'forever') return null;
  if (l.kind === 'minutes') return new Date(now.getTime() + l.minutes * 60000).toISOString();
  return endOfDay(now).toISOString();
}

export function lengthLabel(length) {
  const l = sanitizeLength(length);
  if (l.kind === 'forever') return 'Until I remove it';
  if (l.kind === 'eod') return 'Until end of day';
  const m = l.minutes;
  if (m < 60) return `${m} min`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? '' : 's'}`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/**
 * The announcement (a POST /api/announcements body) a filled template makes.
 * `endOfDay(date) -> Date` is passed in because the browser and the tests
 * decide what "today" means.
 */
export function buildAnnouncement(tpl, values, { now = new Date(), endOfDay = (d) => { const e = new Date(d); e.setHours(23, 59, 0, 0); return e; }, display, length, style } = {}) {
  const miss = missingBlanks(tpl, values);
  if (miss.length) throw new TemplateError(`Fill in: ${miss.map((b) => b.label).join(', ')}.`);
  const disp = TEMPLATE_DISPLAYS.includes(display) ? display : tpl.display;
  const notice = noticeContent(tpl, values);
  const plain = fillPlain(tpl, values, 'en');
  const content = { notice, headlineEn: plain, headlineHe: tpl.textHe ? fillPlain(tpl, values, 'he') : '' };
  return {
    status: 'published',
    display: disp,
    hold: false,
    content,
    look: { layout: 'notice', style: style !== undefined ? (style ? normalizeStyleId(style) : null) : (tpl.style ?? null), fit: 'auto' },
    slide: { duration: 15, label: '' },
    when: { startsAt: null, expiresAt: expiryFor(length || tpl.length, now, endOfDay), recurrence: null },
  };
}

/** Templates this person may see: their own + shared. Others' personal ones never leave the server. */
export function visibleTo(templates, userId) {
  return (templates || []).filter((t) => t.ownerId == null || (userId != null && t.ownerId === userId));
}

export function sortTemplates(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

/** Add a value to a person's recents (newest first, no duplicates, capped). */
export function pushRecent(list, value) {
  const v = line(value, LIMITS.value);
  if (!v) return Array.isArray(list) ? list : [];
  const rest = (Array.isArray(list) ? list : []).filter((x) => x.toLowerCase() !== v.toLowerCase());
  return [v, ...rest].slice(0, LIMITS.recents);
}
