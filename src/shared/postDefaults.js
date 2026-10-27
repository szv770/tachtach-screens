/**
 * The Post sheet's pure rules (docs/specs/01-MESSAGE-POSTING.md): which button style is on, what a new post
 * starts as, the "For" and "Later" chips, the body a sheet makes, and the (privacy-safe) words used in the
 * toast and History. No IO, no clock (callers pass `now`), no site values (callers pass the org's time zone),
 * so the admin, the server and the tests share it. Tests: test/postDefaults.test.js.
 */
import { zonedParts, zonedTimeToUtc, addDays, to12h } from './announcements.js';

// ── Button style setting (settings.post.style; org scope) ──────────────────────────────────────────────────────

export const POST_STYLES = Object.freeze(['sheet', 'classic']);
export const DEFAULT_POST_STYLE = 'sheet';
export const POST_STYLE_LABEL = Object.freeze({ sheet: 'New Post sheet', classic: 'Classic four cards' });

/** 'sheet' (one Post sheet) or 'classic' (the four cards). Missing or unknown = the default, so a bad file never breaks the + button. */
export function postStyle(settings) {
  const v = settings?.post?.style;
  return POST_STYLES.includes(v) ? v : DEFAULT_POST_STYLE;
}

// ── What a post can be ─────────────────────────────────────────────────────────────────────────────────────────

export const POST_KINDS = Object.freeze([
  { display: 'slide', label: 'Slide', effect: 'Takes its turn with the other slides.' },
  { display: 'banner', label: 'Banner', effect: 'A strip along the bottom. Never stops the slides.' },
  { display: 'note', label: 'Side note', effect: 'A small card in the side column.' },
  { display: 'takeover', label: 'Takeover', effect: 'Covers the whole screen and pauses everything.' },
]);

/** The kinds this person may pick: Takeover only with the capability (the server enforces it too; this only hides the chip). */
export function kindsFor(canTakeover) {
  return POST_KINDS.filter((k) => k.display !== 'takeover' || canTakeover);
}

export function effectNote(display, { minutes = null } = {}) {
  const k = POST_KINDS.find((x) => x.display === display) || POST_KINDS[0];
  return display === 'takeover' && minutes ? `${k.effect} Pauses every other slide for ${minutes} min.` : k.effect;
}

export const MESSAGE_SOFT_LIMIT = 140;
export const MESSAGE_HARD_LIMIT = 280;

const HEBREW = /[֐-׿]/;
export const hasHebrew = (s) => HEBREW.test(String(s ?? ''));

const TIME_RE = /\b(\d{1,2})(?:[:.](\d{2}))\s*(am|pm|a\.m\.|p\.m\.)?|\b(\d{1,2})\s*(am|pm)\b/i;

/** The first time in a text as 'HH:MM' (24h), or null. "2:15" has no am/pm: 1-6 read as afternoon (a school day), 7-11 as morning. */
export function findTime(text) {
  const m = TIME_RE.exec(String(text ?? ''));
  if (!m) return null;
  let h = Number(m[1] ?? m[4]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const ap = String(m[3] ?? m[5] ?? '').toLowerCase().replace(/\./g, '');
  if (min > 59 || h > 23) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h >= 1 && h <= 6) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** A layout for the words typed. Only a suggestion: the sheet never changes a layout the person chose. */
export function suggestLayout(text) {
  const t = String(text ?? '').trim();
  if (!t) return 'bigwords';
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3 && lines.slice(1).every((l) => /^([-*•]|\d+[.)])\s*\S/.test(l) || l.length <= 60)) return 'list';
  if (lines.length === 1 && t.split(/\s+/).length <= 14 && findTime(t)) return 'quicktime';
  return 'bigwords';
}

// ── Remembered defaults (per device: localStorage, see PostSheet) ──────────────────────────────────────────────

export const PREF_LIMITS = Object.freeze({ starred: 12, recentTemplates: 8 });
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LENGTH_KEYS = ['15', '60', 'eod', 'shabbos', 'forever'];

const idList = (v, max) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === 'string' && ID_RE.test(x)))].slice(0, max);

/** Whatever was stored -> a safe prefs object. Wrong ids/values are dropped. Holds ids and chip keys only, never message text. */
export function sanitizePrefs(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const last = r.last && typeof r.last === 'object' ? r.last : {};
  return {
    starred: idList(r.starred, PREF_LIMITS.starred),
    recentTemplates: idList(r.recentTemplates, PREF_LIMITS.recentTemplates),
    last: {
      display: POST_KINDS.some((k) => k.display === last.display) ? last.display : null,
      lengthKey: LENGTH_KEYS.includes(last.lengthKey) ? last.lengthKey : null,
    },
  };
}

/** What a new post starts as: the last display + length used, else Slide + Rest of today. A takeover is never the default. */
export function defaultsFor(prefs, { canTakeover = false, lengthKeys = LENGTH_KEYS } = {}) {
  const p = sanitizePrefs(prefs);
  const display = p.last.display && p.last.display !== 'takeover' ? p.last.display : 'slide';
  const lengthKey = p.last.lengthKey && lengthKeys.includes(p.last.lengthKey) ? p.last.lengthKey : 'eod';
  return { display: kindsFor(canTakeover).some((k) => k.display === display) ? display : 'slide', lengthKey };
}

/** After a post: remember its display and length, and (when it came from a template) put the template first in "recent". */
export function recordPost(prefs, { templateId = null, display, lengthKey } = {}) {
  const p = sanitizePrefs(prefs);
  const recentTemplates = templateId && ID_RE.test(String(templateId))
    ? [templateId, ...p.recentTemplates.filter((x) => x !== templateId)].slice(0, PREF_LIMITS.recentTemplates)
    : p.recentTemplates;
  return sanitizePrefs({ ...p, recentTemplates, last: { display, lengthKey: lengthKey === 'pick' ? p.last.lengthKey : lengthKey } });
}

export function toggleStar(prefs, id) {
  const p = sanitizePrefs(prefs);
  if (!ID_RE.test(String(id))) return p;
  const starred = p.starred.includes(id) ? p.starred.filter((x) => x !== id) : [id, ...p.starred].slice(0, PREF_LIMITS.starred);
  return { ...p, starred };
}

/** Starred first (in the order starred), then recent, no repeats, only templates that still exist; capped. */
export function quickPicks(templates, prefs, max = 6) {
  const p = sanitizePrefs(prefs);
  const byId = new Map((templates || []).map((t) => [t.id, t]));
  const out = []; const seen = new Set();
  for (const id of [...p.starred, ...p.recentTemplates]) {
    const t = byId.get(id);
    if (t && !seen.has(id)) { seen.add(id); out.push({ template: t, starred: p.starred.includes(id) }); }
  }
  return out.slice(0, max);
}

// ── "For" chips and "Later" chips (all in the org's time zone) ─────────────────────────────────────────────────

const TZ_FALLBACK = 'UTC';
const safeZone = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return TZ_FALLBACK; } };

/** "4:22 PM" / "16:22" -> 'HH:MM' or null. */
export function parseClock(s) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(am|pm)?\s*$/i.exec(String(s ?? ''));
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; if (/p/i.test(m[3]) && h !== 12) h += 12; if (/a/i.test(m[3]) && h === 12) h = 0; } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "Wed 7:00 AM" style label of an instant in a zone. */
export function whenLabel(ms, { tz, now }) {
  const z = safeZone(tz);
  const a = zonedParts(new Date(ms), z); const b = zonedParts(now, z);
  const time = to12h(`${String(a.hh).padStart(2, '0')}:${String(a.mm).padStart(2, '0')}`);
  if (a.date === b.date) return time;
  if (a.date === addDays(b.date, 1)) return `tomorrow ${time}`;
  const day = new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'short' }).format(new Date(ms));
  const diff = Math.round((Date.parse(a.date) - Date.parse(b.date)) / 86400000);
  if (diff > 0 && diff < 7) return `${day} ${time}`;
  return `${new Intl.DateTimeFormat('en-US', { timeZone: z, month: 'short', day: 'numeric' }).format(new Date(ms))}, ${time}`;
}

const SHABBOS_NEAR_MS = 72 * 3600000;

/**
 * "For" chips. `shabbosEndIso` (from /api/announcements/shabbos-end) adds "Until end of Shabbos" only when it is within 3 days.
 * Each chip: { key, label, minutes? | eod? | untilIso? }. "Pick a time" is a control in the sheet, not a chip here.
 */
export function lengthChips(now, { shabbosEndIso = null } = {}) {
  const chips = [
    { key: '15', label: '15 min', minutes: 15 },
    { key: '60', label: '1 hour', minutes: 60 },
    { key: 'eod', label: 'Rest of today', eod: true },
  ];
  const end = shabbosEndIso ? Date.parse(shabbosEndIso) : NaN;
  if (Number.isFinite(end) && end > now.getTime() && end - now.getTime() <= SHABBOS_NEAR_MS) chips.push({ key: 'shabbos', label: 'Until end of Shabbos', untilIso: new Date(end).toISOString() });
  chips.push({ key: 'forever', label: 'Until I remove it' });
  return chips;
}

/** When a chip ends, counted from `startMs` ("For" counts from the start time, so Later + 1 hour is an hour after it starts). */
export function expiryFor(chip, startMs, tz) {
  if (!chip || chip.key === 'forever') return null;
  if (chip.key === 'pick') return chip.expiresAt || null;
  if (chip.untilIso) return chip.untilIso;
  if (chip.minutes) return new Date(startMs + chip.minutes * 60000).toISOString();
  if (chip.eod) {
    const date = zonedParts(new Date(startMs), safeZone(tz)).date;
    return zonedTimeToUtc(date, '23:59', safeZone(tz)).toISOString();
  }
  return null;
}

/**
 * "Later" chips: Tonight 6:00 PM (only before 6), Before candle lighting (today, Friday only, 30 min before, from
 * today's candle-lighting time text), Tomorrow 7:00 AM, After Shabbos (from shabbosEndIso). Pick is a control in the sheet.
 * Each: { key, label, startsAtIso }.
 */
export function laterChips(now, { tz, candleLighting = null, shabbosEndIso = null } = {}) {
  const z = safeZone(tz);
  const p = zonedParts(now, z);
  const out = [];
  const at = (date, hm) => zonedTimeToUtc(date, hm, z);
  if (p.minutes < 18 * 60 - 1) out.push({ key: 'tonight', label: 'Tonight 6:00 PM', startsAtIso: at(p.date, '18:00').toISOString() });
  const cl = parseClock(candleLighting);
  if (p.dow === 5 && cl) {
    const t = at(p.date, cl).getTime() - 30 * 60000;
    if (t > now.getTime() + 5 * 60000) out.push({ key: 'candles', label: `Before candle lighting ${to12h(zonedHM(t, z))}`, startsAtIso: new Date(t).toISOString() });
  }
  out.push({ key: 'tomorrow', label: 'Tomorrow 7:00 AM', startsAtIso: at(addDays(p.date, 1), '07:00').toISOString() });
  const end = shabbosEndIso ? Date.parse(shabbosEndIso) : NaN;
  if (Number.isFinite(end) && end > now.getTime()) out.push({ key: 'after-shabbos', label: 'After Shabbos', startsAtIso: new Date(end).toISOString() });
  return out;
}

function zonedHM(ms, tz) {
  const a = zonedParts(new Date(ms), tz);
  return `${String(a.hh).padStart(2, '0')}:${String(a.mm).padStart(2, '0')}`;
}

// ── The body a sheet posts ─────────────────────────────────────────────────────────────────────────────────────

const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').trim();

/**
 * A POST /api/announcements body from what the sheet holds. Same shape the composer and quick messages make (the
 * server validates it exactly the same), so nothing is lost when "More options" opens the composer with it.
 * `layout`: 'auto' (use suggestLayout, display slide/takeover only) or an explicit layout the person chose.
 * @returns {{ body: object|null, error: string|null }}
 */
export function buildPostBody({ text = '', textHe = '', display = 'slide', layout = 'auto', chip = null, startsAtIso = null, now = new Date(), tz } = {}) {
  const en = clean(text); const he = clean(textHe);
  if (!en && !he) return { body: null, error: 'What should the screen say?' };
  if (en.length > MESSAGE_HARD_LIMIT || he.length > MESSAGE_HARD_LIMIT) return { body: null, error: `Keep it under ${MESSAGE_HARD_LIMIT} characters, or make it a Letter or Sicha under More options.` };
  // Hebrew typed in the main box belongs in the Hebrew field
  const headlineHe = he || (!(/[A-Za-z]/.test(en)) && hasHebrew(en) ? en : '');
  const headlineEn = headlineHe && !he && headlineHe === en ? '' : en;
  const usesLayout = display === 'slide' || display === 'takeover';
  let useLayout = layout === 'auto' ? (usesLayout ? suggestLayout(headlineEn || headlineHe) : 'bigwords') : layout;
  if (!usesLayout) useLayout = 'bigwords';
  const content = { headlineEn, headlineHe };
  const t = usesLayout && useLayout === 'quicktime' ? findTime(headlineEn) : null;
  if (useLayout === 'quicktime') {
    if (!t) useLayout = 'bigwords';
    else content.quicktime = { time: t, name: headlineEn.replace(TIME_RE, '').replace(/\s+/g, ' ').replace(/\s*[-–:,]\s*$/, '').trim(), nameHe: headlineHe };
    if (content.quicktime && !content.quicktime.name && !content.quicktime.nameHe) { useLayout = 'bigwords'; delete content.quicktime; }
  }
  if (useLayout === 'list') {
    const lines = headlineEn.split('\n').map((l) => l.trim()).filter(Boolean);
    content.list = { heading: lines[0] || '', headingHe: '', items: lines.slice(1).map((l) => ({ text: l.replace(/^([-*•]|\d+[.)])\s*/, ''), textHe: '', day: '', time: '' })) };
  }
  const startMs = startsAtIso ? Date.parse(startsAtIso) : now.getTime();
  const body = {
    status: 'published',
    display,
    hold: false,
    content,
    look: { layout: useLayout, style: null, fit: 'auto' },
    slide: { duration: 15, label: '' },
    when: { startsAt: startsAtIso || null, expiresAt: expiryFor(chip, startMs, tz), recurrence: null },
  };
  return { body, error: null };
}

/** Button words: what pressing Post will do. */
export function postButtonLabel({ display = 'slide', chip = null, startsAtIso = null, now = new Date(), tz } = {}) {
  if (startsAtIso) return `Schedule for ${whenLabel(Date.parse(startsAtIso), { tz, now })}`;
  const k = POST_KINDS.find((x) => x.display === display);
  if (display === 'slide' || !k) return 'Post to screen';
  const until = chip?.key === 'eod' ? ' for today' : '';
  return `Post as ${k.label.toLowerCase()}${until}`;
}

// ── Words kept after the post (privacy: spec Q2, option B) ──────────────────────────────────────────────────────

/** History / Undo line for a post: at most 40 characters. Message text can name a student, so nothing longer is ever kept. */
export const HISTORY_TEXT_MAX = 40;
export function historyText(text, max = HISTORY_TEXT_MAX) {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The toast line after posting. It never contains the message text (a toast can be screenshotted on a shared phone). */
export function postedSummary({ display = 'slide', expiresAt = null, startsAt = null, now = new Date(), tz } = {}) {
  const k = (POST_KINDS.find((x) => x.display === display) || POST_KINDS[0]).label.toLowerCase();
  if (startsAt && Date.parse(startsAt) > now.getTime()) return `Scheduled ${k} for ${whenLabel(Date.parse(startsAt), { tz, now })}`;
  return expiresAt ? `On the screen: ${k} until ${whenLabel(Date.parse(expiresAt), { tz, now })}` : `On the screen: ${k} until you remove it`;
}
