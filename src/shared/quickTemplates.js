/**
 * Quick Announcement helpers — pure, shared by the server (validation of the
 * saved list) and the admin (the quick-send sheet). Tests: test/quickTemplates.test.js.
 *
 * A template is a saved message: { id, label, textHe, textEn, duration }.
 * Text may hold {day} (the sheet asks "which day?") and {time} (it asks for a
 * time); duration is '15' | '60' | 'eod' | 'day' | 'forever' where 'day'
 * means "until the end of the day that was picked" (so "No school tomorrow"
 * stays up through tomorrow, not just today).
 */
import { DEFAULT_TZ, zonedParts, zonedTimeToUtc, addDays, to12h } from './announcements.js';

export const MAX_TEMPLATES = 24;
export const DURATIONS = ['15', '60', 'eod', 'day', 'forever'];

export const DEFAULT_QUICK_TEMPLATES = [
  { id: 'no-school', label: 'No school', textHe: 'אין לימודים {day}', textEn: 'No school {day}', duration: 'day' },
  { id: 'early-dismissal', label: 'Early dismissal', textHe: 'שחרור מוקדם {day} בשעה {time}', textEn: 'Early dismissal {day} at {time}', duration: 'day' },
  { id: 'mincha-time', label: 'Mincha time', textHe: 'מנחה {day} בשעה {time}', textEn: 'Mincha {day} at {time}', duration: 'day' },
  { id: 'shacharis-time', label: 'Shacharis time', textHe: 'שחרית {day} בשעה {time}', textEn: 'Shacharis {day} at {time}', duration: 'day' },
  { id: 'buses-late', label: 'Buses running late', textHe: 'האוטובוסים מתעכבים', textEn: 'Buses are running late', duration: '60' },
];

const clip = (v, n) => String(v ?? '').replace(/\s+$/g, '').slice(0, n);

/** Whitelist + clamp a template list (also used on whatever the file holds). */
export function sanitizeTemplates(list) {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    if (!t || typeof t !== 'object') continue;
    const textHe = clip(t.textHe, 240);
    const textEn = clip(t.textEn, 240);
    if (!textHe.trim() && !textEn.trim()) continue;
    let id = clip(t.id, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `t${out.length + 1}`;
    while (seen.has(id)) id += '_';
    seen.add(id);
    const label = clip(t.label, 40).trim() || clip(textEn || textHe, 40).trim();
    out.push({ id, label, textHe, textEn, duration: DURATIONS.includes(t.duration) ? t.duration : 'eod' });
    if (out.length >= MAX_TEMPLATES) break;
  }
  return out;
}

export const usesDay = (t) => /\{day\}/.test(`${t?.textHe || ''} ${t?.textEn || ''}`);
export const usesTime = (t) => /\{time\}/.test(`${t?.textHe || ''} ${t?.textEn || ''}`);

const HE_DAY = ['ביום ראשון', 'ביום שני', 'ביום שלישי', 'ביום רביעי', 'ביום חמישי', 'ביום שישי', 'בשבת'];
const EN_DAY = ['on Sunday', 'on Monday', 'on Tuesday', 'on Wednesday', 'on Thursday', 'on Friday', 'on Shabbos'];

/**
 * The days offered when a template asks "which day?": today, tomorrow, then
 * the rest of the week by name (skipping the two already covered).
 * @returns {{key:string,label:string,dateISO:string,he:string,en:string}[]}
 */
export function dayChoices(now = new Date(), tz = DEFAULT_TZ) {
  const p = zonedParts(now, tz);
  const out = [
    { key: 'today', label: 'Today', dateISO: p.date, he: 'היום', en: 'today' },
    { key: 'tomorrow', label: 'Tomorrow', dateISO: addDays(p.date, 1), he: 'מחר', en: 'tomorrow' },
  ];
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
  for (let n = 2; n <= 6; n++) {
    const dow = (p.dow + n) % 7;
    out.push({ key: `d${n}`, label: names[dow], dateISO: addDays(p.date, n), he: HE_DAY[dow], en: EN_DAY[dow] });
  }
  return out;
}

/** "13:45" from <input type="time"> → Hebrew "1:45", English "1:45 PM". */
export function timeWords(hhmm) {
  const en = to12h(hhmm);
  return { he: en.replace(/\s*[AP]M$/i, ''), en };
}

/** Replace {day} / {time}. Missing fills leave the placeholder out cleanly. */
export function fillTemplate(t, { day = null, time = '' } = {}) {
  const tw = time ? timeWords(time) : null;
  const fill = (s, lang) => String(s || '')
    .replace(/\{day\}/g, day ? day[lang] : '')
    .replace(/\{time\}/g, tw ? tw[lang] : '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
  return { textHe: fill(t.textHe, 'he'), textEn: fill(t.textEn, 'en') };
}

/** When the message should stop: ISO string, or null for "until I remove it". */
export function expiryFor(duration, { now = new Date(), tz = DEFAULT_TZ, day = null } = {}) {
  if (duration === 'forever') return null;
  if (duration === '15' || duration === '60') return new Date(now.getTime() + Number(duration) * 60000).toISOString();
  const dateISO = duration === 'day' && day ? day.dateISO : zonedParts(now, tz).date;
  return zonedTimeToUtc(dateISO, '23:59', tz).toISOString();
}

/**
 * Recurrence for "every week on…": whole matching days, no end date.
 * `days` are day codes ('Sun'…'Shabbos'); returns null when none are picked.
 */
export function weeklyRecurrence(days) {
  const list = [...new Set(days || [])];
  return list.length ? { days: list, monthDays: [], windows: [], from: null, until: null } : null;
}
