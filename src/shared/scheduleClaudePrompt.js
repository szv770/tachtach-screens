/**
 * Text the admin copies into Claude chat so Claude answers in
 * "TachTach schedule v1" (see schedulePaste.js). Pure — the admin fills in
 * the school's categories and the zmanim it got from /api/schedule/zmanim.
 * docs/SCHEDULE_FORMAT.md holds a generated copy for reference.
 */
import { FORMAT_HEADER, ICON_NAMES, formatTime12 } from './schedulePaste.js';
import { weekdayOfISO, formatDateLong, minutesOf } from './scheduleResolution.js';
import { DAY_CODES } from './scheduleDays.js';

/** Minutes before shkia that candles are lit (Chabad.org standard for most cities). */
export const CANDLE_LIGHTING_MINUTES = 18;

/** "6:46 PM" / "18:46" → "HH:MM", or null. */
function zmanTo24(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) {
    h %= 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
  }
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * The times worth telling Claude for one date, from that date's zmanim
 * (cache.json / Chabad.org keys: sunset, tzeit7083deg, …).
 * @returns {{ shkia?: string, candleLighting?: string, shabbosEnds?: string, tzeis?: string }}
 */
export function keyTimesForDate(dateISO, zmanim) {
  const out = {};
  if (!zmanim) return out;
  const sunset = zmanTo24(zmanim.sunset);
  const tzeit = zmanTo24(zmanim.tzeit7083deg || zmanim.tzeit);
  if (sunset) out.shkia = formatTime12(sunset);
  if (tzeit) out.tzeis = formatTime12(tzeit);
  const w = weekdayOfISO(dateISO);
  if (w === 5 && sunset) {
    const mins = minutesOf(sunset) - CANDLE_LIGHTING_MINUTES;
    out.candleLighting = formatTime12(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  }
  if (w === 6 && tzeit) out.shabbosEnds = out.tzeis;
  return out;
}

const PLACEHOLDER = (what) => `[${what}: NOT AVAILABLE — please fill in]`;

function categoryList(categories) {
  const names = (categories || []).map((c) => c.name).filter(Boolean);
  return names.length ? names.join(', ') : 'Davening, Shiur, Seder, Meals, Mivtzoim, Farbrengen, Events, Trips, Breaks';
}

const EXAMPLE = `${FORMAT_HEADER}
@ 2026-10-16 Fri  Erev Shabbos Bereishis
7:05 AM | Shacharis | שחרית | Davening | alert 10
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening | alert 10
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening`;

/** The format rules (shared by the prompt and the Claude Project guide). */
export function formatRules({ categories } = {}) {
  return [
    'Output ONLY one code block in this exact format, nothing else:',
    '',
    '```',
    FORMAT_HEADER,
    '@ YYYY-MM-DD DayName  optional label',
    'H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options',
    '```',
    '',
    'Rules:',
    '- One "@" header per calendar date, then that day\'s items, one per line, in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY\'s date.',
    '- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.',
    '- Give every item an English name and a Hebrew name (Hebrew letters), in that order.',
    `- Category must be one of: ${categoryList(categories)}.`,
    '- Options are optional, space-separated, at the end of the line:',
    '    alert N      show a countdown N minutes before (N = 1, 2, 5, 10 or 15)',
    '    takeover     make that countdown full-screen (use with alert, e.g. "alert 15 takeover")',
    `    icon NAME    one of: ${ICON_NAMES.join(', ')}`,
    '    off          keep the item but hide it',
    '- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.',
    '- Don\'t add commentary, notes or extra columns. If something is unclear, make your best guess and I\'ll fix it.',
    '',
    'Example:',
    '```',
    EXAMPLE,
    '```',
  ].join('\n');
}

/**
 * "Copy format guide for a Claude Project" — rules only, no dates, written as
 * standing instructions.
 */
export function buildFormatGuide({ categories, schoolName } = {}) {
  return [
    `You format ${schoolName ? `${schoolName}'s` : 'our yeshiva\'s'} schedules for the TV screen in the hallway (the "TachTach" screen). Whenever I ask for a schedule (e.g. "make this Shabbos: …"), answer in the format below so I can paste it straight in.`,
    '',
    formatRules({ categories }),
    '',
    'If I give you an existing schedule in this format and ask for changes, return the whole changed day(s) in the same format.',
  ].join('\n');
}

/**
 * "Copy Claude prompt" — rules + the target dates + those dates' zmanim.
 *
 * @param {{
 *   dates: string[],                         YYYY-MM-DD, e.g. this Friday + Shabbos
 *   zmanimByDate?: Record<string, object|null>,
 *   parsha?: string,                         e.g. "Bereishis"
 *   categories?: object[],
 *   location?: string,                       e.g. "Miami Beach 33139"
 * }} opts
 */
export function buildClaudePrompt({ dates = [], zmanimByDate = {}, parsha = '', categories = [], location = '' } = {}) {
  const sorted = [...dates].sort();
  const isShabbos = sorted.some((d) => weekdayOfISO(d) === 5 || weekdayOfISO(d) === 6);
  const dateWords = sorted.map((d) => `${formatDateLong(d)} (@ ${d})`);
  const lines = [
    'You format yeshiva schedules for our TV screen.',
    '',
    formatRules({ categories }),
    '',
    `Make the schedule for: ${dateWords.join(' and ') || '[DATES — please fill in]'}${parsha ? ` (Parshas ${parsha})` : ''}${location ? `, ${location}` : ''}.`,
  ];

  const zLines = [];
  for (const d of sorted) {
    const w = weekdayOfISO(d);
    const t = keyTimesForDate(d, zmanimByDate?.[d]);
    const label = `${DAY_CODES[w]} ${d}`;
    if (w === 5) {
      zLines.push(`- ${label}: candle lighting ${t.candleLighting || PLACEHOLDER('candle lighting')}, shkia ${t.shkia || PLACEHOLDER('shkia')}`);
    } else if (w === 6) {
      zLines.push(`- ${label}: shkia ${t.shkia || PLACEHOLDER('shkia')}, Shabbos ends ${t.shabbosEnds || PLACEHOLDER('Shabbos ends')}`);
    } else {
      zLines.push(`- ${label}: shkia ${t.shkia || PLACEHOLDER('shkia')}, tzeis ${t.tzeis || PLACEHOLDER('tzeis')}`);
    }
  }
  if (zLines.length) {
    lines.push('', 'Zmanim for these dates (from our zmanim feed — use them for candle lighting, Mincha/Maariv and Havdala):', ...zLines);
  }
  if (isShabbos) {
    lines.push('', 'Put "alert 15 takeover | icon candle" on candle lighting and "alert 10" on each Shacharis.');
  }
  lines.push('', "Here's what's happening:", '');
  return lines.join('\n');
}
