/**
 * "TachTach schedule v1" — the paste-in text format for date schedules, its
 * parser and its inverse formatter ("Copy as text"). Pure; used by the admin
 * (live preview, day editor text mode) and the server (authoritative
 * re-parse on apply, all-or-nothing).
 *
 *   # TachTach schedule v1
 *   @ 2026-10-16 Fri  Erev Shabbos Bereishis
 *   7:05 AM | Shacharis | שחרית | Davening | alert 10
 *   6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
 *   6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening
 *
 *   @ 2026-10-17 Shabbos
 *   9:30 AM | Shacharis | שחרית | Davening | alert 10
 *
 *   @ 2026-10-24 clear        ← date goes back to the weekly schedule
 *
 * Forgiving where it's safe (12 h or 24 h times, names in either order, any
 * category case, `@ this Friday`), strict about anything that would put the
 * wrong thing on the screen (bad dates/times, duplicate dates): those are
 * errors and the admin's Apply button stays disabled.
 *
 * A text that starts with `{` is read as JSON in the schedule-dates.json shape:
 *   { "2026-10-17": { "label": "", "entries": [ { "time": "09:30", ... } ] },
 *     "2026-10-24": null }          ← null / {"clear": true} = clear
 */
import { normalizeTefilaTag } from './chazan.js';
import {
  isISODate, weekdayOfISO, upcomingWeekdayISO, addDaysISO, minutesOf, sortEntriesByTime, WEEKDAY_LONG,
} from './scheduleResolution.js';
import { DAY_CODES } from './scheduleDays.js';
import { sanitizeStages, isKind, kindOf, inferKind, KINDS } from './scheduleStages.js';
import { sanitizeGroupFields, matchGroups, splitGroupTimeField, splitOnlyField, ownSlots, groupWord, groupsOn } from './scheduleGroups.js';

export const FORMAT_NAME = 'TachTach schedule v1';
export const FORMAT_HEADER = `# ${FORMAT_NAME}`;

/** Minutes-before choices the admin offers. Other values 0–120 are accepted. */
export const ALERT_CHOICES = [0, 1, 2, 5, 10, 15];

/**
 * Icon keys — keep in sync with SCHEDULE_ICON_MAP in ScheduleIcons.jsx
 * (that file is JSX so the server can't import it; a unit test checks this).
 */
export const ICON_NAMES = [
  'book', 'prayer', 'meal', 'test', 'bed', 'bus', 'sports', 'bell',
  'megaphone', 'clock', 'coffee', 'music', 'candle', 'star', 'calendar', 'sparkle',
];

const HEBREW_RE = /[֐-׿]/;
export const hasHebrew = (s) => HEBREW_RE.test(s || '');

const WEEKDAY_WORDS = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, erev: null,
  sat: 6, saturday: 6, shabbos: 6, shabbat: 6, shabbes: 6, shabbath: 6,
};
function weekdayWord(word) {
  const w = String(word || '').toLowerCase().replace(/[.,:;]+$/, '');
  const v = WEEKDAY_WORDS[w];
  return v === undefined || v === null ? -1 : v;
}

// ── Times ──────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');
const toHHMM = (mins) => `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`;

/**
 * Read one time as typed by a person or Claude.
 * Accepts 7:05 AM, 7:05am, 7:05 a.m., 7 PM, 19:05, 0705? (no), 7.05pm, noon, midnight.
 * @returns {{ mins: number, meridiem: 'AM'|'PM'|null, hour: number, leadingZero: boolean } | null}
 */
export function parseTimeToken(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'noon' || s === '12 noon') return { mins: 720, meridiem: 'PM', hour: 12, leadingZero: false };
  if (s === 'midnight') return { mins: 0, meridiem: 'AM', hour: 12, leadingZero: false };
  const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|a|p)?$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  const mer = m[3] ? (m[3][0] === 'a' ? 'AM' : 'PM') : null;
  if (m[2] === undefined && !mer) return null; // a bare "7" is too ambiguous
  if (minute > 59) return null;
  if (mer) {
    if (hour < 1 || hour > 12) return null;
    let h = hour % 12;
    if (mer === 'PM') h += 12;
    return { mins: h * 60 + minute, meridiem: mer, hour, leadingZero: false };
  }
  if (hour > 23) return null;
  return { mins: hour * 60 + minute, meridiem: null, hour, leadingZero: m[1].length === 2 && m[1][0] === '0' };
}

function withMeridiem(tok, mer) {
  const h = tok.hour % 12 + (mer === 'PM' ? 12 : 0);
  return h * 60 + (tok.mins % 60);
}

/**
 * Read a time or a range ("6:40 PM - 7:30 PM", "6:40-7:30 PM", "11:30 to 1 PM").
 * One side's AM/PM is borrowed by the other when only one side has it.
 * @returns {{ time: string, endTime: string, warnings: string[] } | { error: string }}
 */
export function parseTimeRange(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { error: 'Missing time.' };
  const parts = s.split(/\s*(?:-|–|—|\bto\b|\buntil\b|\btill\b)\s*/i).filter((p) => p !== '');
  if (parts.length > 2) return { error: `Couldn't read the time "${s}".` };
  const start = parseTimeToken(parts[0]);
  if (!start) return { error: `Couldn't read the time "${parts[0]}". Use e.g. 7:05 AM or 19:05.` };
  let end = null;
  if (parts.length === 2) {
    end = parseTimeToken(parts[1]);
    if (!end) return { error: `Couldn't read the end time "${parts[1]}". Use e.g. 7:30 PM or 19:30.` };
  }
  let startMins = start.mins;
  let endMins = end ? end.mins : null;
  if (end) {
    if (!start.meridiem && end.meridiem && start.hour >= 1 && start.hour <= 12) {
      startMins = withMeridiem(start, end.meridiem);
      if (startMins > endMins) startMins = withMeridiem(start, end.meridiem === 'PM' ? 'AM' : 'PM');
    } else if (start.meridiem && !end.meridiem && end.hour >= 1 && end.hour <= 12) {
      endMins = withMeridiem(end, start.meridiem);
      if (endMins < startMins && start.meridiem === 'AM') endMins = withMeridiem(end, 'PM');
    }
  }
  const warnings = [];
  const anyMeridiem = start.meridiem || end?.meridiem;
  const ambiguous = (tok, mins) => !anyMeridiem && !tok.leadingZero && tok.hour >= 1 && tok.hour <= 6 && mins < 7 * 60;
  if (ambiguous(start, startMins)) {
    warnings.push(`"${parts[0]}" was read as ${formatTime12(toHHMM(startMins))} (24-hour). Add AM or PM if you meant the afternoon.`);
  } else if (end && ambiguous(end, endMins)) {
    warnings.push(`"${parts[1]}" was read as ${formatTime12(toHHMM(endMins))} (24-hour). Add AM or PM if you meant the afternoon.`);
  }
  if (end && endMins < startMins) {
    warnings.push(`Ends (${formatTime12(toHHMM(endMins))}) before it starts (${formatTime12(toHHMM(startMins))}).`);
  }
  return { time: toHHMM(startMins), endTime: end ? toHHMM(endMins) : '', warnings };
}

/** "HH:MM" → "7:05 AM". */
export function formatTime12(time24) {
  const mins = minutesOf(time24);
  if (mins == null) return time24 || '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Add minutes to "HH:MM", clamped to the same day (23:59 max). */
export function addMinutesToTime(time24, delta) {
  const mins = minutesOf(time24);
  if (mins == null) return '';
  return toHHMM(Math.max(0, Math.min(23 * 60 + 59, mins + delta)));
}

// ── Categories ─────────────────────────────────────────────────────────────

export function slugifyCategory(name) {
  const slug = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'category';
}

/**
 * Find a category by id or name, case-insensitive; "Meal" also matches
 * "Meals" and vice versa.
 */
export function findCategory(categories, value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  const list = categories || [];
  const variants = new Set([v, v.endsWith('s') ? v.slice(0, -1) : `${v}s`]);
  for (const key of variants) {
    const hit = list.find((c) => String(c.id || '').toLowerCase() === key || String(c.name || '').trim().toLowerCase() === key);
    if (hit) return hit;
  }
  return null;
}

/** Category name for display/export (falls back to the raw id). */
export function categoryLabel(categories, id) {
  if (!id) return '';
  return (categories || []).find((c) => c.id === id)?.name || id;
}

/** Unique id for a new category, not colliding with existing ones. */
export function newCategoryId(categories, name) {
  const base = slugifyCategory(name);
  const taken = new Set((categories || []).map((c) => c.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ── Options ────────────────────────────────────────────────────────────────

const OPTION_STARTERS = new Set(['alert', 'takeover', 'slide', 'icon', 'off', 'disabled', 'hidden', 'started', 'badge', 'nobadge', 'kind', 'tefila']);
function isOptionField(field, ctx) {
  const first = String(field || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  if (OPTION_STARTERS.has(first) || /^alert\d+$/.test(first)) return true;
  // Group fields ("Aleph 6:30 PM - 8:30 PM", "only Aleph, Bais") count once groups are configured.
  return !!(ctx?.groups && (splitGroupTimeField(field, ctx.groups) || splitOnlyField(field, ctx.groups)));
}

function parseOptions(fields, warn, err) {
  const opts = {};
  const tokens = fields.join(' ').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase().replace(/[,;]+$/, '');
    let m;
    if (t === 'alert' || (m = t.match(/^alert(\d+)$/))) {
      const nTok = m ? m[1] : tokens[i + 1];
      if (!m) i++;
      const n = Number(String(nTok ?? '').replace(/(m|min|mins|minutes?)$/i, ''));
      if (!Number.isInteger(n) || n < 0 || n > 120) {
        err(`"alert" needs a number of minutes (1, 2, 5, 10 or 15), got "${nTok ?? ''}".`);
        continue;
      }
      opts.alertBefore = n;
      if (/^(m|min|mins|minute|minutes)$/i.test(tokens[i + 1] || '')) i++;
      if (n > 0 && !ALERT_CHOICES.includes(n)) warn(`alert ${n} isn't one of the usual choices (1, 2, 5, 10, 15) — it will still work.`);
    } else if (t === 'takeover' || t === 'full-screen' || t === 'fullscreen') {
      opts.countdownDisplay = 'takeover';
    } else if (t === 'slide') {
      opts.countdownDisplay = 'slide';
    } else if (t === 'icon') {
      const name = String(tokens[i + 1] || '').toLowerCase();
      i++;
      if (ICON_NAMES.includes(name)) opts.icon = name;
      else warn(`Unknown icon "${tokens[i] ?? ''}" — ignored. Icons: ${ICON_NAMES.join(', ')}.`);
    } else if (t === 'started' || t === 'just-started') {
      // "started 3" = "just started" message for 3 minutes; "started 0" = none
      const n = Number(String(tokens[i + 1] ?? '').replace(/(m|min|mins|minutes?)$/i, ''));
      i++;
      if (Number.isInteger(n) && n >= 0 && n <= 30) {
        opts.justStarted = n;
        if (/^(m|min|mins|minute|minutes)$/i.test(tokens[i + 1] || '')) i++;
      } else err(`"started" needs a number of minutes from 0 to 30, got "${tokens[i] ?? ''}".`);
    } else if (t === 'badge') {
      opts.inSession = true;
    } else if (t === 'nobadge') {
      opts.inSession = false;
    } else if (t === 'kind') {
      const k = String(tokens[i + 1] || '').toLowerCase().replace(/[,;]+$/, '');
      i++;
      if (isKind(k)) opts.kind = k;
      else warn(`Unknown kind "${tokens[i] ?? ''}" — ignored. Kinds: ${KINDS.join(', ')}.`);
    } else if (t === 'tefila') {
      // "tefila Mincha" = this row is the Mincha davening (shows the chazan's name); "tefila other" = not a davening
      const v = String(tokens[i + 1] || '').toLowerCase().replace(/[,;]+$/, '');
      i++;
      const tag = normalizeTefilaTag(v === 'other' ? 'other' : v.charAt(0).toUpperCase() + v.slice(1));
      if (tag) opts.tefila = tag;
      else warn(`Unknown tefila "${tokens[i] ?? ''}" — ignored. Use Shacharis, Mincha, Maariv or other.`);
    } else if (t === 'off' || t === 'disabled' || t === 'hidden') {
      opts.enabled = false;
    } else {
      warn(`Unknown option "${tokens[i]}" — ignored.`);
    }
  }
  return opts;
}

// ── Entry lines ────────────────────────────────────────────────────────────

/**
 * Parse one entry line. `ctx` = { categories, newCats: Map(lower name → {id,name}) }.
 * @returns {{ entry?: object, errors: string[], warnings: string[] }}
 */
export function parseEntryLine(line, ctx) {
  const errors = [];
  const warnings = [];
  const fields = line.split('|').map((f) => f.trim());
  const tr = parseTimeRange(fields[0]);
  if (tr.error) return { errors: [tr.error], warnings };
  warnings.push(...tr.warnings);

  // Options: trailing fields that start with an option word.
  let end = fields.length;
  while (end > 2 && isOptionField(fields[end - 1], ctx)) end--;
  const allOpt = fields.slice(end);
  const isGroupField = (f) => !!(splitGroupTimeField(f, ctx.groups) || splitOnlyField(f, ctx.groups));
  const groupFields = allOpt.filter(isGroupField);
  const optFields = allOpt.filter((f) => !isGroupField(f));
  const mid = fields.slice(1, end);
  while (mid.length > 1 && mid[mid.length - 1] === '') mid.pop();

  let names = [];
  let catText = '';
  if (mid.length === 0 || mid.every((f) => f === '')) {
    return { errors: ['Missing a name. Expected: time | English name | Hebrew name | Category | options'], warnings };
  } else if (mid.length === 1) {
    names = [mid[0]];
  } else if (mid.length === 2) {
    const [a, b] = mid;
    if (b && !hasHebrew(b) && (findCategory(ctx.categories, b) || !hasHebrew(a))) {
      names = [a]; catText = b;
    } else {
      names = [a, b];
    }
  } else if (mid.length === 3) {
    names = [mid[0], mid[1]];
    catText = mid[2];
  } else {
    return { errors: [`Too many fields (${fields.length}). Expected: time | English name | Hebrew name | Category | options`], warnings };
  }

  let name = '';
  let nameHe = '';
  const filled = names.filter((n) => n !== '');
  if (filled.length === 0) return { errors: ['Missing a name.'], warnings };
  const he = filled.filter(hasHebrew);
  const en = filled.filter((n) => !hasHebrew(n));
  if (filled.length === 1) {
    if (he.length) nameHe = he[0]; else name = en[0];
  } else if (he.length === 1) {
    nameHe = he[0]; name = en[0];
  } else if (he.length === 2) {
    nameHe = he[0]; name = he[1];
    warnings.push('Both names are in Hebrew; the second one is used as the English name.');
  } else {
    name = en[0]; nameHe = en[1];
    warnings.push(`The Hebrew name "${en[1]}" has no Hebrew letters.`);
  }

  let category = '';
  let categoryIsNew = false;
  let categoryDefaultAlert = 0;
  let categoryKind = 'other';
  if (catText) {
    const hit = findCategory(ctx.categories, catText);
    if (hit) {
      category = hit.id;
      categoryDefaultAlert = Number(hit.defaultAlert) > 0 ? Math.min(120, Math.round(Number(hit.defaultAlert))) : 0;
      categoryKind = kindOf(hit);
    } else {
      const key = catText.trim().toLowerCase();
      let nc = ctx.newCats.get(key);
      if (!nc) {
        nc = { id: newCategoryId([...(ctx.categories || []), ...ctx.newCats.values()], catText), name: catText.trim() };
        ctx.newCats.set(key, nc);
      }
      category = nc.id;
      categoryIsNew = true;
      warnings.push(`New category "${nc.name}" — it will be created.`);
    }
  }

  const opts = parseOptions(optFields, (w) => warnings.push(w), (e) => errors.push(e));
  const gx = parseGroupFields(groupFields, ctx.groups, tr, warnings, errors);
  if (errors.length) return { errors, warnings };
  if (categoryIsNew) {
    // A new category's kind: the line's "kind X", else guessed from its name.
    const nc = ctx.newCats.get(catText.trim().toLowerCase());
    if (nc) { if (opts.kind) nc.kind = opts.kind; else if (!nc.kind) nc.kind = inferKind(nc.name) || 'other'; categoryKind = nc.kind; }
  } else if (opts.kind && opts.kind !== categoryKind) {
    warnings.push(`"kind ${opts.kind}" only applies to a new category; "${catText.trim()}" is already ${categoryKind}. Change it in Schedule > Categories.`);
  }
  // No explicit "alert N": use the category's default reminder. An explicit
  // "alert 0" means none.
  const alertFromDefault = opts.alertBefore === undefined && categoryDefaultAlert > 0;
  const alertBefore = opts.alertBefore ?? (alertFromDefault ? categoryDefaultAlert : 0);
  if (opts.countdownDisplay === 'takeover' && !alertBefore) {
    warnings.push('"takeover" only matters with an alert (e.g. "alert 10 takeover").');
  }
  // Stage fields (see scheduleStages.js). An explicit "alert N" on a quiet kind (break/meal) is an
  // opt-in to that countdown for this block.
  const stages = sanitizeStages({
    justStarted: opts.justStarted,
    inSession: opts.inSession,
    countdown: opts.alertBefore > 0 && (categoryKind === 'break' || categoryKind === 'meal') ? true : undefined,
  });
  return {
    entry: {
      name, nameHe, time: tr.time, endTime: tr.endTime, category,
      alertBefore,
      ...(alertFromDefault ? { alertFromDefault: true } : {}),
      countdownDisplay: opts.countdownDisplay || 'slide',
      enabled: opts.enabled !== false,
      icon: opts.icon || '',
      ...(opts.tefila ? { tefila: opts.tefila } : {}),
      ...(stages ? { stages } : {}),
      ...(gx.groupTimes ? { groupTimes: gx.groupTimes } : {}),
      ...(gx.groups ? { groups: gx.groups } : {}),
      ...(categoryIsNew ? { categoryIsNew: true } : {}),
    },
    errors, warnings,
  };
}

/**
 * The group fields of a line: "Aleph 6:30 PM - 8:30 PM" (own times for those groups; the line's own time
 * stays the base for everyone else) and "only Aleph, Bais" (the block is for those groups only).
 */
function parseGroupFields(fields, groups, base, warnings, errors) {
  const out = {};
  for (const f of fields) {
    const only = splitOnlyField(f, groups);
    if (only) {
      const { ids, unknown } = matchGroups(only, groups);
      unknown.forEach((u) => warnings.push(`Unknown group "${u}" in "only ${only}" — ignored.`));
      out.groups = [...new Set([...(out.groups || []), ...ids])];
      continue;
    }
    const sp = splitGroupTimeField(f, groups);
    const { ids, unknown } = matchGroups(sp.names, groups);
    unknown.forEach((u) => warnings.push(`Unknown group "${u}" — ignored. Groups: ${groups.map((g) => g.name).join(', ')}.`));
    const r = parseTimeRange(sp.range);
    if (r.error) { errors.push(`${sp.names}: ${r.error}`); continue; }
    warnings.push(...r.warnings);
    if (base?.endTime && !r.endTime) warnings.push(`${sp.names} has a start but no end time, while everyone else ends ${formatTime12(base.endTime)}.`);
    out.groupTimes = out.groupTimes || {};
    for (const id of ids) out.groupTimes[id] = { time: r.time, endTime: r.endTime || '' };
  }
  return out;
}

/** The group fields of an entry as text ("Bais + Gimmel 8:00 PM - 10:00 PM", "only Aleph"). */
function formatGroupFields(e, groups) {
  if (!groupsOn(groups)) return [];
  const out = ownSlots(e, groups).map((s) => {
    const names = s.ids.map((id) => groupWord(groups.find((g) => g.id === id))).join(' + ');
    return `${names} ${formatTime12(s.time)}${s.endTime ? ` - ${formatTime12(s.endTime)}` : ''}`;
  });
  if (Array.isArray(e.groups) && e.groups.length) {
    const ids = e.groups.filter((id) => groups.some((g) => g.id === id));
    if (ids.length && ids.length < groups.length) out.push(`only ${ids.map((id) => groupWord(groups.find((g) => g.id === id))).join(', ')}`);
  }
  return out;
}

// ── Date headers ───────────────────────────────────────────────────────────

/**
 * Parse the text after "@".
 * @returns {{ date?: string, label: string, clear: boolean, errors: string[], warnings: string[] }}
 */
export function parseDateHeader(rest, todayISO) {
  const errors = [];
  const warnings = [];
  let s = String(rest || '').trim();
  let date = null;
  let writtenWeekday = -1;
  let m;

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?=\s|$|[,|])/))) {
    const iso = `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
    if (!isISODate(iso)) errors.push(`"${m[0]}" isn't a real date.`);
    else date = iso;
    s = s.slice(m[0].length);
  } else if ((m = s.match(/^(?:([A-Za-z]+)[,.]?\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=\s|$|[,|])/)) && (!m[1] || weekdayWord(m[1]) >= 0)) {
    if (m[1]) writtenWeekday = weekdayWord(m[1]);
    const mo = Number(m[2]);
    const da = Number(m[3]);
    let year;
    if (m[4]) year = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
    else {
      // No year: the nearest such date from ~1 month ago to ~11 months ahead.
      const ty = Number((todayISO || '').slice(0, 4)) || new Date().getFullYear();
      year = ty;
      const cand = `${ty}-${pad2(mo)}-${pad2(da)}`;
      if (isISODate(cand) && todayISO && cand < addDaysISO(todayISO, -31)) year = ty + 1;
    }
    const iso = `${year}-${pad2(mo)}-${pad2(da)}`;
    if (!isISODate(iso)) errors.push(`"${m[0]}" isn't a real date.`);
    else date = iso;
    s = s.slice(m[0].length);
  } else if ((m = s.match(/^(?:(this|next|coming|upcoming)\s+)?([A-Za-z]+)(?=\s|$|[,|])/i)) && (weekdayWord(m[2]) >= 0 || /^(today|tomorrow)$/i.test(m[2]))) {
    if (!todayISO) {
      errors.push('Relative dates need today\'s date.');
    } else if (/^today$/i.test(m[2])) {
      date = todayISO;
    } else if (/^tomorrow$/i.test(m[2])) {
      date = addDaysISO(todayISO, 1);
    } else {
      const wd = weekdayWord(m[2]);
      const next = (m[1] || '').toLowerCase() === 'next';
      date = upcomingWeekdayISO(todayISO, wd, next ? 1 : 0);
    }
    s = s.slice(m[0].length);
  } else {
    errors.push(`Couldn't read the date "${s || '(empty)'}". Use @ YYYY-MM-DD (e.g. @ 2026-10-16 Fri).`);
    return { label: '', clear: false, errors, warnings };
  }

  // Optional weekday after the date ("@ 2026-10-16 Fri ...") — checked.
  s = s.replace(/^[\s,|:–—-]+/, '');
  const firstWord = s.split(/\s+/)[0] || '';
  if (writtenWeekday < 0 && weekdayWord(firstWord) >= 0) {
    writtenWeekday = weekdayWord(firstWord);
    s = s.slice(firstWord.length).replace(/^[\s,|:–—-]+/, '');
  }
  if (date && writtenWeekday >= 0 && writtenWeekday !== weekdayOfISO(date)) {
    warnings.push(`${date} is a ${WEEKDAY_LONG[weekdayOfISO(date)]}, but the header says "${WEEKDAY_LONG[writtenWeekday]}". Check the date.`);
  }
  let clear = false;
  const w2 = s.split(/\s+/)[0] || '';
  if (/^clear$/i.test(w2)) {
    clear = true;
    s = s.slice(w2.length).trim();
  }
  const label = s.replace(/^[\s,|:–—-]+/, '').trim();
  return { date: date || undefined, label, clear, errors, warnings };
}

// ── Weekly headers ─────────────────────────────────────────────────────────

/** Header forms shown to Claude / in docs. `weekdays` means Sun–Thu (the yeshiva school days). */
export const WEEKLY_EXAMPLE_HEADERS = ['"@ daily"', '"@ weekdays" (= Sun-Thu)', '"@ every Sun-Thu"', '"@ Fri"', '"@ Shabbos"', '"@ Mon, Wed"'];

const RANGE_SPLIT = /\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b|\buntil\b)\s*/i;

/** weekdayWord that also accepts plurals ("Fridays", "Sundays"). */
function weekdayWordLoose(word) {
  const direct = weekdayWord(word);
  if (direct >= 0) return direct;
  const w = String(word || '').toLowerCase();
  return w.endsWith('s') ? weekdayWord(w.slice(0, -1)) : -1;
}

/**
 * Parse the text after "@" as a WEEKLY rule header: which weekdays the lines
 * below repeat on. Accepts `daily`, `weekdays` (= Sun–Thu), `every Sun-Thu`,
 * `Fri`, `Shabbos`, `Mon, Wed`, `Mon-Wed`, `Thu-Sun` (wraps), `Fridays`.
 *
 * @returns {null | { days: number[], codes: string[], errors: string[] }}
 *   null = this isn't a weekly header (it's a date header or garbage).
 */
export function parseWeeklyHeader(rest) {
  let s = String(rest || '').trim().toLowerCase().replace(/[:.]+$/, '').trim();
  if (!s || /\d/.test(s) || /^(this|next|coming|upcoming|today|tomorrow)\b/.test(s)) return null;
  const done = (days, errors = []) => {
    const set = [...new Set(days)].sort((a, b) => a - b);
    return { days: set, codes: set.map((d) => DAY_CODES[d]), errors };
  };
  if (/^(daily|every ?day|each day|all week|every day|7 days)$/.test(s)) return done([0, 1, 2, 3, 4, 5, 6]);
  if (/^(every |each )?weekdays?$/.test(s)) return done([0, 1, 2, 3, 4]);
  s = s.replace(/^(every|each|on)\s+/, '');
  const items = s.split(/\s*(?:,|&|\+|\band\b)\s*/).filter(Boolean);
  const days = [];
  let recognized = 0;
  const bad = [];
  for (const item of items) {
    const parts = item.split(RANGE_SPLIT).filter(Boolean);
    if (parts.length === 1) {
      const d = weekdayWordLoose(parts[0]);
      if (d >= 0) { days.push(d); recognized++; } else bad.push(item);
    } else if (parts.length === 2) {
      const a = weekdayWordLoose(parts[0]);
      const b = weekdayWordLoose(parts[1]);
      if (a >= 0 && b >= 0) {
        recognized++;
        for (let d = a; ; d = (d + 1) % 7) { days.push(d); if (d === b) break; }
      } else bad.push(item);
    } else bad.push(item);
  }
  if (!recognized) return null;
  if (bad.length) {
    return done(days, [`Couldn't read the days "${bad.join(', ')}". Use e.g. @ every Sun-Thu, @ Fri, @ Shabbos, @ weekdays or @ daily.`]);
  }
  return done(days);
}

/** Header text for a set of day indexes: daily / every Sun-Thu / Fri / Mon, Wed. */
export function weeklyHeaderFor(dayIdx) {
  const set = [...new Set(dayIdx)].sort((a, b) => a - b);
  if (set.length === 7) return 'daily';
  if (set.length === 1) return DAY_CODES[set[0]];
  const contiguous = set.every((d, i) => i === 0 || d === set[i - 1] + 1);
  if (contiguous && set.length >= 3) return `every ${DAY_CODES[set[0]]}-${DAY_CODES[set[set.length - 1]]}`;
  return set.map((d) => DAY_CODES[d]).join(', ');
}

function entryDayIdx(e) {
  const list = Array.isArray(e?.days) ? e.days : [];
  const idx = list.map((d) => weekdayWordLoose(String(d))).filter((d) => d >= 0);
  return idx.length ? [...new Set(idx)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

// ── Whole text ─────────────────────────────────────────────────────────────

/**
 * Parse pasted text (or JSON) into per-date schedules.
 *
 * @param {string} text
 * @param {{ categories?: object[], today?: string }} opts  today = YYYY-MM-DD (for "this Friday")
 * A text is EITHER dated ("@ 2026-10-16 …") OR weekly ("@ every Sun-Thu …",
 * "@ Fri", "@ daily") — never both. Weekly texts return `mode: 'weekly'`,
 * `days: []` and `weekly: { rules, entries }` (entries carry `days` codes).
 *
 * @returns {{
 *   format: 'text'|'json',
 *   mode: 'dates'|'weekly',
 *   weekly: null | { rules: Array<{ codes: string[], line: number, count: number }>, entries: object[] },
 *   days: Array<{ date: string, label: string, clear: boolean, entries: object[], line: number|null }>,
 *   errors: Array<{ line: number|null, date?: string, message: string }>,
 *   warnings: Array<{ line: number|null, date?: string, message: string }>,
 *   newCategories: Array<{ id: string, name: string }>,
 * }}
 */
export function parseScheduleText(text, opts = {}) {
  const src = String(text ?? '');
  if (/^\s*\{/.test(src)) return parseScheduleJSON(src, opts);

  const ctx = { categories: opts.categories || [], newCats: new Map(), groups: Array.isArray(opts.groups) && opts.groups.length ? opts.groups : null };
  const days = [];
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const rules = []; // weekly rule headers
  let current = null; // day/rule being filled (null before the first header, or a broken header)
  let broken = false;

  const lines = src.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    let line = rawLine.replace(/‏|‎/g, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('```') || line.startsWith('//')) return;
    if (line.startsWith('@')) {
      const wk = parseWeeklyHeader(line.slice(1));
      if (wk) {
        wk.errors.forEach((message) => errors.push({ line: lineNo, message }));
        if (days.length) {
          errors.push({ line: lineNo, message: 'A weekly header (@ every Sun-Thu, @ Fri, @ daily …) can\'t be mixed with dated headers (@ 2026-10-16). Paste weekly and dated schedules separately.' });
          current = null; broken = true; return;
        }
        if (wk.errors.length || !wk.days.length) { current = null; broken = true; return; }
        current = { weekly: true, codes: wk.codes, entries: [], line: lineNo, header: line.slice(1).trim() };
        broken = false;
        rules.push(current);
        return;
      }
      if (rules.length) {
        errors.push({ line: lineNo, message: 'A date header (@ 2026-10-16) can\'t be mixed with weekly headers (@ every Sun-Thu, @ Fri …). Paste them separately.' });
        current = null; broken = true; return;
      }
      const h = parseDateHeader(line.slice(1), opts.today);
      h.errors.forEach((message) => errors.push({ line: lineNo, message }));
      if (!h.date) { current = null; broken = true; return; }
      h.warnings.forEach((message) => warnings.push({ line: lineNo, date: h.date, message }));
      if (seen.has(h.date)) {
        errors.push({ line: lineNo, date: h.date, message: `${h.date} appears twice (also on line ${seen.get(h.date)}). Put all of a day's items under one @ header.` });
        current = null; broken = true; return;
      }
      seen.set(h.date, lineNo);
      current = { date: h.date, label: h.label, clear: h.clear, entries: [], line: lineNo };
      broken = false;
      days.push(current);
      return;
    }
    line = line.replace(/^(?:[-*•]\s+|\d+[.)]\s+(?=\d))/, '');
    if (!current) {
      if (!broken) errors.push({ line: lineNo, message: 'This line comes before any "@ date" header. Start each day with e.g. "@ 2026-10-16 Fri".' });
      return;
    }
    if (!line.includes('|')) {
      errors.push({ line: lineNo, date: current.date, message: `Couldn't read "${line.slice(0, 60)}". Expected: time | English name | Hebrew name | Category | options` });
      return;
    }
    if (current.clear) {
      errors.push({ line: lineNo, date: current.date, message: `${current.date} is marked "clear" (back to the weekly schedule) but has items. Remove "clear" or the items.` });
      return;
    }
    const r = parseEntryLine(line, ctx);
    const where = current.weekly ? {} : { date: current.date };
    r.errors.forEach((message) => errors.push({ line: lineNo, ...where, message }));
    r.warnings.forEach((message) => warnings.push({ line: lineNo, ...where, message }));
    if (r.entry) current.entries.push({ ...r.entry, line: lineNo });
  });

  if (!days.length && !rules.length && !errors.length) {
    errors.push({ line: null, message: 'No "@ date" headers found. Each day starts with a line like "@ 2026-10-16 Fri" (or, for a weekly schedule, "@ every Sun-Thu").' });
  }
  for (const d of days) d.entries = sortEntriesByTime(d.entries);
  let weekly = null;
  if (rules.length) {
    for (const r of rules) {
      if (!r.entries.length) warnings.push({ line: r.line, message: `"@ ${r.header}" has no items.` });
    }
    const flat = rules.flatMap((r) => r.entries.map((e) => ({ ...e, days: [...r.codes] })));
    weekly = {
      rules: rules.map((r) => ({ codes: r.codes, header: r.header, line: r.line, count: r.entries.length })),
      entries: sortEntriesByTime(flat),
    };
  }
  return { format: 'text', mode: weekly ? 'weekly' : 'dates', weekly, days, errors, warnings, newCategories: [...ctx.newCats.values()] };
}

/** JSON flavour (schedule-dates.json shape, optionally wrapped in {dates:{…}}). */
export function parseScheduleJSON(text, opts = {}) {
  const errors = [];
  const warnings = [];
  const days = [];
  const ctx = { categories: opts.categories || [], newCats: new Map(), groupIds: opts.groupIds || null };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { format: 'json', mode: 'dates', weekly: null, days, errors: [{ line: null, message: `Not valid JSON: ${e.message}` }], warnings, newCategories: [] };
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && obj.dates && typeof obj.dates === 'object') obj = obj.dates;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { format: 'json', mode: 'dates', weekly: null, days, errors: [{ line: null, message: 'JSON must be an object keyed by date: { "2026-10-17": { "entries": [...] } }' }], warnings, newCategories: [] };
  }
  for (const [date, value] of Object.entries(obj)) {
    if (!isISODate(date)) { errors.push({ line: null, message: `"${date}" isn't a YYYY-MM-DD date.` }); continue; }
    if (value === null || value?.clear === true) { days.push({ date, label: '', clear: true, entries: [], line: null }); continue; }
    const list = Array.isArray(value) ? value : value?.entries;
    if (!Array.isArray(list)) { errors.push({ line: null, date, message: `${date}: "entries" must be a list.` }); continue; }
    const day = { date, label: typeof value?.label === 'string' ? value.label : '', clear: false, entries: [], line: null };
    list.forEach((e, i) => {
      const where = `${date} item ${i + 1}`;
      const r = normalizeEntryInput(e, ctx);
      r.errors.forEach((m) => errors.push({ line: null, date, message: `${where}: ${m}` }));
      r.warnings.forEach((m) => warnings.push({ line: null, date, message: `${where}: ${m}` }));
      if (r.entry) day.entries.push(r.entry);
    });
    day.entries = sortEntriesByTime(day.entries);
    days.push(day);
  }
  if (!days.length && !errors.length) errors.push({ line: null, message: 'No dates found in the JSON.' });
  return { format: 'json', mode: 'dates', weekly: null, days, errors, warnings, newCategories: [...ctx.newCats.values()] };
}

/**
 * Validate/normalize one entry object (JSON import, day-editor saves). Times
 * may be "HH:MM" or "7:05 PM". Categories are matched like the text format;
 * unknown ones are recorded in ctx.newCats.
 */
export function normalizeEntryInput(e, ctx = { categories: [], newCats: new Map() }) {
  const errors = [];
  const warnings = [];
  if (!e || typeof e !== 'object') return { errors: ['Not an object.'], warnings };
  const str = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
  const name = str(e.name).slice(0, 200);
  const nameHe = str(e.nameHe).slice(0, 200);
  if (!name && !nameHe) errors.push('Missing a name.');
  const tr = parseTimeRange(str(e.time) + (str(e.endTime) ? ` - ${str(e.endTime)}` : ''));
  if (tr.error) errors.push(tr.error);
  else warnings.push(...tr.warnings);
  let category = '';
  let categoryIsNew = false;
  const catIn = str(e.category);
  if (catIn) {
    const hit = findCategory(ctx.categories, catIn);
    if (hit) category = hit.id;
    else {
      const key = catIn.toLowerCase();
      let nc = ctx.newCats.get(key);
      if (!nc) {
        nc = { id: newCategoryId([...(ctx.categories || []), ...ctx.newCats.values()], catIn), name: catIn,
          kind: isKind(e.categoryKind) ? e.categoryKind : (inferKind(catIn) || 'other') };
        ctx.newCats.set(key, nc);
      }
      category = nc.id;
      categoryIsNew = true;
      warnings.push(`New category "${nc.name}" — it will be created.`);
    }
  }
  const alert = e.alertBefore === undefined || e.alertBefore === '' || e.alertBefore === null ? 0 : Number(e.alertBefore);
  if (!Number.isInteger(alert) || alert < 0 || alert > 120) errors.push(`alertBefore must be 0–120 minutes, got "${e.alertBefore}".`);
  const display = (e.countdownDisplay || e.alertDisplay) === 'takeover' ? 'takeover' : 'slide';
  let icon = str(e.icon).toLowerCase();
  if (icon && !ICON_NAMES.includes(icon)) { warnings.push(`Unknown icon "${icon}" — ignored.`); icon = ''; }
  // Groups (src/shared/scheduleGroups.js): per-group times + "only these groups"; ctx.groupIds = configured ids
  const gf = sanitizeGroupFields(e, Array.isArray(ctx.groupIds) ? ctx.groupIds : null);
  errors.push(...gf.errors);
  warnings.push(...gf.warnings);
  if (errors.length) return { errors, warnings };
  const entry = {
    name, nameHe, time: tr.time, endTime: tr.endTime, category,
    alertBefore: alert, countdownDisplay: display, enabled: e.enabled !== false, icon,
  };
  if (typeof e.id === 'string' && e.id.length <= 64) entry.id = e.id;
  const tefilaTag = normalizeTefilaTag(e.tefila);
  if (tefilaTag) entry.tefila = tefilaTag;
  const stages = sanitizeStages(e.stages);
  if (stages) entry.stages = stages;
  if (gf.groupTimes) entry.groupTimes = gf.groupTimes;
  if (gf.groups) entry.groups = gf.groups;
  if (categoryIsNew) entry.categoryIsNew = true;
  return { entry, errors, warnings };
}

/** Strip parser-only fields (line numbers, flags) before storing an entry. */
export function storableEntry(e) {
  const { line, categoryIsNew, alertFromDefault, ...rest } = e || {}; // eslint-disable-line no-unused-vars
  return rest;
}

// ── Formatter ("Copy as text") ─────────────────────────────────────────────

/** One entry as a text line. */
export function formatEntryLine(e, categories, groups = null) {
  const time = formatTime12(e.time) + (e.endTime ? ` - ${formatTime12(e.endTime)}` : '');
  const cat = categoryLabel(categories, e.category);
  const opts = [];
  if (e.alertBefore > 0) opts.push(`alert ${e.alertBefore}${(e.countdownDisplay || e.alertDisplay) === 'takeover' ? ' takeover' : ''}`);
  else if (Number(findCategory(categories, e.category)?.defaultAlert) > 0) opts.push('alert 0'); // keep an explicit "no alert" through a round trip
  if (e.icon) opts.push(`icon ${e.icon}`);
  if (normalizeTefilaTag(e.tefila)) opts.push(`tefila ${e.tefila}`);
  const st = sanitizeStages(e.stages);
  if (st?.justStarted !== undefined) opts.push(`started ${st.justStarted}`);
  if (st?.inSession !== undefined) opts.push(st.inSession ? 'badge' : 'nobadge');
  if (e.enabled === false) opts.push('off');
  const fields = [time, e.name || '', e.nameHe || '', cat, ...formatGroupFields(e, groups), ...opts];
  while (fields.length > 2 && fields[fields.length - 1] === '') fields.pop();
  return fields.join(' | ');
}

/**
 * Format days back into the text format.
 * @param {Array<{date: string, label?: string, clear?: boolean, entries?: object[]}>} days
 * @param {{ categories?: object[], header?: boolean }} opts
 */
export function formatScheduleText(days, { categories = [], header = true, groups = null } = {}) {
  const out = [];
  if (header) out.push(FORMAT_HEADER);
  (days || []).forEach((d, i) => {
    if (i > 0 || header) out.push('');
    const wd = isISODate(d.date) ? DAY_CODES[weekdayOfISO(d.date)] : '';
    if (d.clear) { out.push(`@ ${d.date} ${wd} clear`.replace(/\s+/g, ' ')); return; }
    out.push(`@ ${d.date}${wd ? ` ${wd}` : ''}${d.label ? `  ${d.label}` : ''}`);
    for (const e of sortEntriesByTime(d.entries || [])) out.push(formatEntryLine(e, categories, groups));
  });
  return out.join('\n') + '\n';
}

/**
 * Format weekly entries ("Copy weekly schedule as text"): one `@` header per
 * distinct set of days (daily first, then by first day), items in time order.
 * Round-trips through parseScheduleText.
 */
export function formatWeeklyText(entries, { categories = [], header = true, groups = null } = {}) {
  const byDays = new Map();
  for (const e of entries || []) {
    const idx = entryDayIdx(e);
    const key = idx.join(',');
    if (!byDays.has(key)) byDays.set(key, { idx, entries: [] });
    byDays.get(key).entries.push(e);
  }
  const ordered = [...byDays.values()].sort((a, b) => (b.idx.length === 7) - (a.idx.length === 7) || a.idx[0] - b.idx[0] || b.idx.length - a.idx.length);
  const out = [];
  if (header) out.push(FORMAT_HEADER);
  ordered.forEach((g, i) => {
    if (i > 0 || header) out.push('');
    out.push(`@ ${weeklyHeaderFor(g.idx)}`);
    for (const e of sortEntriesByTime(g.entries)) out.push(formatEntryLine(e, categories, groups));
  });
  return out.join('\n') + '\n';
}
