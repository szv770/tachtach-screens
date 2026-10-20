/**
 * The roster: ONE list of bochurim (data/roster.json) that every feature that needs people pulls from.
 * Today that is the birthday slide; the chazan chart will read the same list.
 *
 * Pure (no fs, no React): used by the server routes, the kiosk and the admin, and unit tested.
 *
 * A person is { id, first, last, month, day, he? }. `month` is Intl's English Hebrew-month name
 * ('Tishri', 'Heshvan', 'Adar I', 'Adar II', 'Adar', ...), `day` 1-30. Only the HEBREW birthday is
 * stored; an English date typed or imported is converted once, and never shown.
 */

export const LIMITS = Object.freeze({ people: 1000, name: 40, he: 60 });

/** The 14 names a Hebrew month can have, in Intl's spelling, with the label shown in the admin / on the slide. */
export const MONTHS = Object.freeze([
  { key: 'Tishri', en: 'Tishrei', he: 'תשרי', days: 30 },
  { key: 'Heshvan', en: 'Cheshvan', he: 'חשון', days: 30 },
  { key: 'Kislev', en: 'Kislev', he: 'כסלו', days: 30 },
  { key: 'Tevet', en: 'Teves', he: 'טבת', days: 29 },
  { key: 'Shevat', en: 'Shevat', he: 'שבט', days: 30 },
  { key: 'Adar I', en: 'Adar I', he: 'אדר א׳', days: 30 },
  { key: 'Adar II', en: 'Adar II', he: 'אדר ב׳', days: 29 },
  { key: 'Adar', en: 'Adar', he: 'אדר', days: 29 },
  { key: 'Nisan', en: 'Nissan', he: 'ניסן', days: 30 },
  { key: 'Iyar', en: 'Iyar', he: 'אייר', days: 29 },
  { key: 'Sivan', en: 'Sivan', he: 'סיון', days: 30 },
  { key: 'Tamuz', en: 'Tammuz', he: 'תמוז', days: 29 },
  { key: 'Av', en: 'Av', he: 'אב', days: 30 },
  { key: 'Elul', en: 'Elul', he: 'אלול', days: 29 },
]);
const MONTH_BY_KEY = Object.freeze(Object.fromEntries(MONTHS.map((m) => [m.key, m])));
export const isMonthKey = (k) => Object.prototype.hasOwnProperty.call(MONTH_BY_KEY, k);

// ── Settings (stored beside the people in roster.json) ───────────────────────

export const DEFAULT_BIRTHDAYS = Object.freeze({
  fridayIsWeekend: false, // true: a Friday birthday also shows Thursday + Sunday (default: Friday is a normal school day)
  lookAhead: 2,           // days of "coming up" (and of "just was") in the small strip
  names: 'full',          // 'full' = first + last, 'short' = first + last initial
  rail: true,             // a small card in the rail on a birthday day
});

export function normalizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const la = parseInt(o.lookAhead, 10);
  return {
    fridayIsWeekend: o.fridayIsWeekend === true,
    lookAhead: Number.isFinite(la) ? Math.min(7, Math.max(0, la)) : DEFAULT_BIRTHDAYS.lookAhead,
    names: o.names === 'short' ? 'short' : 'full',
    rail: o.rail !== false,
  };
}

// ── People ───────────────────────────────────────────────────────────────────

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Validate a day against its month ('Elul' has no 30th). */
export function validDay(month, day) {
  const m = MONTH_BY_KEY[month];
  return !!m && Number.isInteger(day) && day >= 1 && day <= m.days;
}

/** One person → clean row, or { error }. `id` is kept when it looks right, else made up by `makeId`. */
export function normalizePerson(p, makeId = defaultId) {
  if (!p || typeof p !== 'object') return { error: 'Not a person.' };
  const first = clean(p.first, LIMITS.name);
  const last = clean(p.last, LIMITS.name);
  if (!first && !last) return { error: 'Add a name.' };
  const day = parseInt(p.day, 10);
  if (!isMonthKey(p.month)) return { error: 'Pick the Hebrew month.' };
  if (!validDay(p.month, day)) return { error: `${MONTH_BY_KEY[p.month].en} has no day ${p.day}.` };
  const id = typeof p.id === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(p.id) ? p.id : makeId();
  const out = { id, first, last, month: p.month, day };
  const he = clean(p.he, LIMITS.he);
  if (he) out.he = he;
  return out;
}

let seq = 0;
function defaultId() {
  seq += 1;
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${seq.toString(36)}`;
}

export function normalizePeople(list, makeId = defaultId) {
  const people = [];
  const errors = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, LIMITS.people).forEach((raw, index) => {
    const p = normalizePerson(raw, makeId);
    if (p.error) { errors.push({ index, error: p.error }); return; }
    if (seen.has(p.id)) p.id = makeId();
    seen.add(p.id);
    people.push(p);
  });
  return { people, errors };
}

/** Whole file ({ people, birthdays }) → clean file. Bad rows are dropped. */
export function normalizeRosterFile(file, makeId = defaultId) {
  const f = file && typeof file === 'object' ? file : {};
  return { people: normalizePeople(f.people, makeId).people, birthdays: normalizeSettings(f.birthdays) };
}

export const fullName = (p) => [p.first, p.last].filter(Boolean).join(' ');
/** "Moshe C." — what the 'short' names setting shows. */
export function shortName(p) {
  const l = (p.last || '').trim();
  return p.first && l ? `${p.first} ${[...l][0].toUpperCase()}.` : fullName(p);
}
export const displayName = (p, names = 'full') => (names === 'short' ? shortName(p) : fullName(p));

export const sortPeople = (people) => [...people].sort((a, b) => fullName(a).localeCompare(fullName(b), 'en', { sensitivity: 'base' }));

// ── Hebrew date helpers ──────────────────────────────────────────────────────

let heFmt = null;
const hdCache = new Map();
/** Hebrew date of a civil 'YYYY-MM-DD' → { y, month, d, leap }. */
export function hebrewDateOf(dateISO) {
  if (hdCache.has(dateISO)) return hdCache.get(dateISO);
  if (!heFmt) heFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const [y, m, d] = dateISO.split('-').map(Number);
  const parts = heFmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hy = parseInt(get('year'), 10);
  const out = { y: hy, month: String(get('month') || '').trim(), d: parseInt(get('day'), 10), leap: (7 * hy + 1) % 19 < 7 };
  if (hdCache.size > 800) hdCache.clear();
  hdCache.set(dateISO, out);
  return out;
}

const GEM = [['ט', 9], ['ח', 8], ['ז', 7], ['ו', 6], ['ה', 5], ['ד', 4], ['ג', 3], ['ב', 2], ['א', 1]];
/** 23 → כ״ג, 15 → ט״ו, 30 → ל׳. */
export function gematriaDay(n) {
  if (!Number.isInteger(n) || n < 1 || n > 30) return '';
  let s = '';
  let r = n;
  if (r >= 20) { s += r >= 30 ? 'ל' : 'כ'; r -= r >= 30 ? 30 : 20; } else if (r >= 10) { s += 'י'; r -= 10; }
  if (n === 15) return 'ט״ו';
  if (n === 16) return 'ט״ז';
  for (const [ch, v] of GEM) if (r === v) s += ch;
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}
const GEM_VALUE = Object.freeze({ א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30 });
/** כ״ג → 23 (null when it is not a day of the month). */
export function dayFromGematria(text) {
  const t = String(text || '').replace(/[֑-ׇ"'׳״’“”.]/g, '');
  if (!t || t.length > 3 || /[^א-ת]/.test(t)) return null;
  let n = 0;
  for (const ch of t) { if (!(ch in GEM_VALUE)) return null; n += GEM_VALUE[ch]; }
  return n >= 1 && n <= 30 ? n : null;
}

export const birthdayLabel = (p, lang = 'en') => (lang === 'he'
  ? `${gematriaDay(p.day)} ${MONTH_BY_KEY[p.month]?.he || ''}`.trim()
  : `${p.day} ${MONTH_BY_KEY[p.month]?.en || ''}`.trim());

// ── When is the birthday? ────────────────────────────────────────────────────

/**
 * Does the stored month fall on Hebrew month name `now` (Intl's name) in a year that is/isn't a leap year?
 * Adar (born in a regular year) is Adar II in a leap year; Adar I / Adar II (born in a leap year) are Adar in a regular one.
 */
function monthMatches(stored, nowMonth, leap) {
  if (!leap) return stored === nowMonth || ((stored === 'Adar I' || stored === 'Adar II') && nowMonth === 'Adar');
  if (stored === 'Adar') return nowMonth === 'Adar II';
  return stored === nowMonth;
}

export const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const dow = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); };

/** Is the Hebrew birthday of `p` on civil date `iso`? (A 30th that the month lacks moves to the 1st of the next month.) */
export function isBirthdayOn(p, iso) {
  const h = hebrewDateOf(iso);
  if (monthMatches(p.month, h.month, h.leap) && h.d === p.day) return true;
  if (p.day === 30 && h.d === 1) {
    const prev = hebrewDateOf(addDays(iso, -1));
    return prev.d === 29 && monthMatches(p.month, prev.month, prev.leap);
  }
  return false;
}

/** Civil dates (YYYY-MM-DD) on which the birthday falls within [fromISO, toISO]. */
export function birthdayDatesBetween(p, fromISO, toISO) {
  const out = [];
  for (let d = fromISO, i = 0; d <= toISO && i < 400; d = addDays(d, 1), i++) if (isBirthdayOn(p, d)) out.push(d);
  return out;
}

/**
 * The days a birthday B is announced. Normally just B. A Shabbos birthday (and a Friday one when
 * `fridayIsWeekend`) has no school to show it on, so it shows the Thursday before and the Sunday after.
 */
export function showDaysFor(b, { fridayIsWeekend = false } = {}) {
  const w = dow(b);
  if (w === 6) return [addDays(b, -2), addDays(b, 1)];
  if (w === 5 && fridayIsWeekend) return [addDays(b, -1), addDays(b, 2)];
  return [b];
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Shabbos'];
export const weekdayName = (iso) => WEEKDAYS[dow(iso)];

/**
 * What the screen says on `todayISO`.
 *   today    — shown big: { person, kind: 'today' | 'early' (birthday is this Shabbos) | 'late' (was over Shabbos), date }
 *   recent   — small strip: birthdays of the last `lookAhead` days, not already in `today`
 *   upcoming — small strip: the next `lookAhead` days, not already in `today`
 * Each small item = { person, date, label: 'Yesterday' | 'Tomorrow' | 'Monday' | 'Shabbos' }.
 */
export function birthdaysFor(people, todayISO, settings) {
  const s = normalizeSettings(settings);
  const from = addDays(todayISO, -3); // a Shabbos birthday is still shown on the Sunday after (and a Friday one, 2 days after)
  const to = addDays(todayISO, Math.max(s.lookAhead, 3));
  const today = [];
  const recent = [];
  const upcoming = [];
  for (const person of Array.isArray(people) ? people : []) {
    for (const b of birthdayDatesBetween(person, from, to)) {
      const shows = showDaysFor(b, s);
      if (shows.includes(todayISO)) {
        today.push({ person, date: b, kind: b === todayISO ? 'today' : b > todayISO ? 'early' : 'late' });
        continue;
      }
      const sinceB = daysBetween(b, todayISO);
      const untilB = -sinceB;
      const item = { person, date: b, label: relLabel(b, todayISO) };
      if (sinceB >= 1 && sinceB <= s.lookAhead) recent.push(item);
      else if (untilB >= 1 && untilB <= s.lookAhead) upcoming.push(item);
    }
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || fullName(a.person).localeCompare(fullName(b.person));
  today.sort(byDate); recent.sort(byDate); upcoming.sort(byDate);
  return { today, recent, upcoming };
}

function daysBetween(a, b) { // b - a, in days
  const t = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}
function relLabel(date, today) {
  const n = daysBetween(today, date);
  if (dow(date) === 6) return 'Shabbos';
  if (n === -1) return 'Yesterday';
  if (n === 1) return 'Tomorrow';
  return weekdayName(date);
}

/** Is there anything to put on the big slide today? (The slide is left out of the rotation when not.) */
export const hasBirthdaysToday = (people, todayISO, settings) => birthdaysFor(people, todayISO, settings).today.length > 0;

/** What the kiosk and the live preview get: the people trimmed to what the screen needs. */
export function forKiosk(file) {
  const f = normalizeRosterFile(file);
  return { people: f.people.map(({ id, first, last, month, day, he }) => ({ id, first, last, month, day, ...(he ? { he } : {}) })), birthdays: f.birthdays };
}

// ── Reading a sheet (CSV / Excel / pasted) ───────────────────────────────────

const strip = (s) => String(s ?? '').replace(/[֑-ׇ]/g, '');

// Hebrew + common English/Yiddish spellings -> month key. Checked in order (Adar I / II before Adar).
const MONTH_PATTERNS = [
  ['Adar II', /\badar\s*(2|ii|b|bet|beis|bais|sheni|shaini)\b|אדר\s*(ב|שני)(?![א-ת])/],
  ['Adar I', /\badar\s*(1|i|a|aleph|alef|rishon|raishon)\b|אדר\s*(א|ראשון)(?![א-ת])/],
  ['Adar', /\badar\b|אדר/],
  ['Tishri', /\btish?rei?\b|תשרי/],
  ['Heshvan', /\b(mar)?c?he?shvan\b|\bcheshwan\b|חשוון|חשון|מרחשון|מרחשוון/],
  ['Kislev', /\bkis?lev\b|כסלו|כסליו/],
  ['Tevet', /\bte(v|ve)t\b|\bteves\b|\btaves\b|\btebeth\b|טבת/],
  ['Shevat', /\bshevat\b|\bshvat\b|\bshebat\b|שבט/],
  ['Nisan', /\bnis+an\b|ניסן/],
  ['Iyar', /\biyar\b|\biyyar\b|\bayar\b|אייר|איר/],
  ['Sivan', /\bsivan\b|\bsiwan\b|סיון|סיוון/],
  ['Tamuz', /\btam+uz\b|תמוז/],
  ['Av', /\b(menachem\s+)?av\b|\bab\b|מנחם\s*אב|(^|\s)אב(?![א-ת])/],
  ['Elul', /\belul\b|אלול/],
];

/** 'כ״ג אדר' / '23 Adar II' / 'Adar 2, 23' → { month, day } or null. */
export function parseHebrewBirthday(text) {
  let t = strip(text).toLowerCase().replace(/["'׳״\u2019]/g, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 60) return null;
  let month = null;
  for (const [key, re] of MONTH_PATTERNS) {
    const m = t.match(re);
    if (m) { month = key; t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); break; }
  }
  if (!month) return null;
  let day = null;
  for (const tok of t.split(' ').filter(Boolean)) {
    const dm = tok.match(/^(\d{1,2})(st|nd|rd|th)?$/);
    if (dm) { const n = parseInt(dm[1], 10); if (n >= 1 && n <= 30) { day = n; break; } continue; }
    const g = dayFromGematria(tok);
    if (g) { day = g; break; }
  }
  if (!day) return null;
  if (!validDay(month, day)) return null;
  return { month, day };
}

const ENG_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n) => String(n).padStart(2, '0');
function validISO(y, m, d) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}

/** An English (civil) date in a cell → 'YYYY-MM-DD', or null. A real Date (Excel) is read in UTC. */
export function parseEnglishDate(cell) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) return validISO(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  const t = String(cell ?? '').trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validISO(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})$/);
  if (m) {
    let [, a, sep, b, y] = m; a = +a; b = +b; y = +y;
    if (y < 100) y += y > 40 ? 1900 : 2000;
    const dayFirst = sep === '.' || a > 12; // M/D/Y (US) unless a dot or an impossible month
    return dayFirst ? validISO(y, b, a) : validISO(y, a, b);
  }
  m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m && ENG_MONTHS[m[1].slice(0, 3).toLowerCase()]) return validISO(+m[3], ENG_MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m && ENG_MONTHS[m[2].slice(0, 3).toLowerCase()]) return validISO(+m[3], ENG_MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  return null;
}

/** An English date → the Hebrew birthday { month, day } of that day (daytime date; it does not look at sunset). */
export function hebrewBirthdayFromISO(iso) {
  const h = hebrewDateOf(iso);
  // Intl names the month the way the roster stores it (a leap year's Adar I / Adar II keep that name).
  return isMonthKey(h.month) ? { month: h.month, day: h.d } : null;
}

/** CSV / TSV / pasted text → rows of cells. Handles quotes and "name - date" lines. */
export function parseDelimited(text) {
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const sample = lines.slice(0, 20).join('\n');
  const count = (re) => (sample.match(re) || []).length;
  const delim = count(/\t/g) >= lines.length / 2 ? '\t'
    : count(/,/g) >= Math.min(lines.length, 3) / 2 ? ','
      : count(/;/g) >= lines.length / 2 ? ';'
        : count(/\|/g) >= lines.length / 2 ? '|'
          : count(/\s[-–—]\s/g) >= lines.length / 2 ? 'dash' : ',';
  return lines.map((line) => {
    if (delim === 'dash') return line.split(/\s[-–—]\s/).map((c) => c.trim());
    const cells = [];
    let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

const HEADER_RE = /name|first|last|family|sur|birth|b-?day|date|dob|hebrew|שם|פרטי|משפחה|תאריך|יום\s*הולדת/i;

/**
 * Rows of cells (from a CSV, an Excel sheet or pasted text) → people.
 * Per row: a Hebrew date cell wins; an English date cell is converted. Every other text cell is the name:
 * two or more = first, last; one = "First Last" (or "Last, First"). A header row is skipped (and read for
 * "first" / "last" columns when it has them).
 * → { people: [{ first, last, month, day, from: 'hebrew' | 'english' }], skipped: [{ row, why, text }] }
 */
export function parseRosterRows(rows) {
  const data = (Array.isArray(rows) ? rows : []).map((r) => (Array.isArray(r) ? r : [r])).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  const people = [];
  const skipped = [];
  if (!data.length) return { people, skipped };

  const dateOf = (c) => {
    const heb = c instanceof Date ? null : parseHebrewBirthday(c);
    if (heb) return { ...heb, from: 'hebrew' };
    const iso = parseEnglishDate(c);
    if (iso) { const b = hebrewBirthdayFromISO(iso); if (b) return { ...b, from: 'english' }; }
    return null;
  };

  let start = 0;
  let firstCol = -1;
  let lastCol = -1;
  const head = data[0];
  if (!head.some((c) => dateOf(c)) && head.some((c) => HEADER_RE.test(String(c)))) {
    start = 1;
    head.forEach((c, i) => {
      const t = String(c).toLowerCase();
      if (/first|given|פרטי/.test(t)) firstCol = i;
      else if (/last|family|sur|משפחה/.test(t)) lastCol = i;
    });
  }

  for (let r = start; r < data.length; r++) {
    const row = data[r];
    const text = row.map((c) => (c instanceof Date ? '' : String(c ?? ''))).join(' | ');
    let found = null;
    let usedIdx = -1;
    // Hebrew dates first, then English
    for (const wantHebrew of [true, false]) {
      row.forEach((c, i) => { if (!found) { const d = dateOf(c); if (d && (d.from === 'hebrew') === wantHebrew) { found = d; usedIdx = i; } } });
      if (found) break;
    }
    if (!found) { skipped.push({ row: r + 1, why: 'No birthday found.', text }); continue; }
    const cellsOf = row.filter((c, i) => i !== usedIdx && !(c instanceof Date) && String(c ?? '').trim() && !dateOf(c) && !/^\d+$/.test(String(c).trim()));
    let first = ''; let last = '';
    if (firstCol >= 0 || lastCol >= 0) {
      first = String(row[firstCol] ?? '').trim(); last = String(row[lastCol] ?? '').trim();
    } else if (cellsOf.length >= 2) {
      first = String(cellsOf[0]).trim(); last = cellsOf.slice(1).map((c) => String(c).trim()).join(' ');
    } else if (cellsOf.length === 1) {
      const full = String(cellsOf[0]).trim();
      if (full.includes(',')) { const [l, f] = full.split(',').map((x) => x.trim()); first = f || ''; last = l || ''; }
      else { const i = full.indexOf(' '); first = i > 0 ? full.slice(0, i) : full; last = i > 0 ? full.slice(i + 1).trim() : ''; }
    }
    if (!first && !last) { skipped.push({ row: r + 1, why: 'No name found.', text }); continue; }
    people.push({ first, last, month: found.month, day: found.day, from: found.from });
  }
  return { people, skipped };
}

/** Same person already in the roster? (name + Hebrew birthday) */
export const samePerson = (a, b) => fullName(a).toLowerCase() === fullName(b).toLowerCase() && a.month === b.month && a.day === b.day;
