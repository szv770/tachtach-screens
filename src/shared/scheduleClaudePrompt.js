/**
 * Text the admin copies into Claude chat so Claude answers in
 * "TachTach schedule v1" (see schedulePaste.js). Pure — the admin fills in
 * the school's categories and the zmanim it got from /api/schedule/zmanim.
 * docs/SCHEDULE_FORMAT.md holds a generated copy for reference.
 */
import { FORMAT_HEADER, ICON_NAMES, formatTime12, WEEKLY_EXAMPLE_HEADERS } from './schedulePaste.js';
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
7:05 AM | Shacharis | שחרית | Davening
12:30 PM | | סעודה | Meals
6:28 PM | Candle Lighting | הדלקת נרות | Events | alert 15 takeover | icon candle
6:40 PM - 7:30 PM | Kabbalas Shabbos & Maariv | קבלת שבת ומעריב | Davening

@ 2026-10-17 Shabbos
9:30 AM | Shacharis | שחרית | Davening
7:24 PM | Maariv / Havdala | מעריב / הבדלה | Davening | alert 0`;

const WEEKLY_EXAMPLE = `${FORMAT_HEADER}
@ every Sun-Thu
7:00 AM | Shacharis | שחרית | Davening
8:15 AM | Breakfast | | Meals
9:00 AM - 12:30 PM | First Seder | סדר א' | Seder
1:30 PM | Mincha | מנחה | Davening

@ Fri
7:30 AM | Shacharis | שחרית | Davening
9:00 AM - 11:30 AM | Seder | סדר | Seder

@ Shabbos
9:30 AM | Shacharis | שחרית | Davening`;

/** Which categories carry a default reminder (for the prompt text). */
function alertDefaultsText(categories) {
  const list = categories || [];
  if (!list.length) {
    return 'Reminders: Davening, Shiur and Seder items automatically get a 5-minute reminder; Meals and everything else get none.';
  }
  const groups = new Map();
  for (const c of list.filter((x) => Number(x.defaultAlert) > 0)) {
    const k = Number(c.defaultAlert);
    groups.set(k, [...(groups.get(k) || []), c.name]);
  }
  const parts = [...groups.entries()].map(([n, names]) => `${names.join(', ')} get a ${n}-minute reminder`);
  const without = list.filter((x) => !(Number(x.defaultAlert) > 0));
  const none = without.length ? `${without.map((c) => c.name).join(', ')} get none` : '';
  return `Reminders: ${[...parts, none].filter(Boolean).join('; ')}.`;
}

/** Rules shared by every schedule format. */
function entryRules({ categories }) {
  return [
    '- Each item is one line: time | English name | Hebrew name | Category | options',
    '- Use 12-hour times with AM/PM. A range is "6:40 PM - 7:30 PM". The end time is optional.',
    '- The Hebrew name (Hebrew letters) is the main name. The English name is OPTIONAL: when there is no natural short English name, leave that field empty (e.g. "7:05 AM | | שחרית | Davening"). Never invent an English name just to fill the column.',
    `- Category must be one of: ${categoryList(categories)}.`,
    `- ${alertDefaultsText(categories)} OMIT "alert" unless an item is an exception. "alert N" changes it to N minutes (1, 2, 5, 10 or 15); "alert 0" turns it off.`,
    '- Other options are optional, space-separated, at the end of the line:',
    '    takeover     make the item\'s countdown full-screen (use with an alert, e.g. "alert 15 takeover")',
    `    icon NAME    one of: ${ICON_NAMES.join(', ')}`,
    '    started N    show a "just started" message for N minutes (0-30) after the start; "started 0" = none',
    '    badge        show "now in session" from the start until the end time (so give it an end time); "nobadge" = never',
    '    kind KIND    ONLY for a brand-new category: seder, davening, break, meal or other (seder items get the full countdown/just-started/badge treatment; break and meal stay quiet)',
    '    off          keep the item but hide it',
    '- Give every item an end time when you know it (the "now in session" badge and the schedule need it).',
    '- Don\'t add commentary, notes or extra columns. If something is unclear, make your best guess and I\'ll fix it.',
  ];
}

/** The date-schedule format rules (shared by the day prompt and the Claude Project guide). */
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
    '- One "@" header per calendar date, then that day\'s items in time order. Friday-night items (candle lighting, Kabbalas Shabbos, the Friday-night seuda) go under FRIDAY\'s date.',
    ...entryRules({ categories }),
    '- "@ YYYY-MM-DD clear" (no items) puts a date back on the regular weekly schedule.',
    '',
    'Example:',
    '```',
    EXAMPLE,
    '```',
  ].join('\n');
}

/** The weekly-schedule format rules. */
export function weeklyFormatRules({ categories } = {}) {
  return [
    'Output ONLY one code block in this exact format, nothing else:',
    '',
    '```',
    FORMAT_HEADER,
    '@ every Sun-Thu',
    'H:MM AM/PM[ - H:MM AM/PM] | English name | Hebrew name | Category | options',
    '```',
    '',
    'Rules:',
    `- This is the REGULAR WEEK that repeats every week, not a specific date. Each "@" header names the days its items run on: ${WEEKLY_EXAMPLE_HEADERS.join(', ')}. Day names: Sun, Mon, Tue, Wed, Thu, Fri, Shabbos. Ranges like "Sun-Thu" and lists like "Mon, Wed" work.`,
    '- Put items that run on the same days under one header, in time order. A day may appear under several headers (e.g. "@ daily" for Mincha plus "@ Fri" for Friday-only items).',
    '- Don\'t use calendar dates here, and don\'t include candle lighting or other times that change every week.',
    ...entryRules({ categories }),
    '',
    'Example:',
    '```',
    WEEKLY_EXAMPLE,
    '```',
  ].join('\n');
}

/**
 * "Copy format guide for a Claude Project" — rules only, no dates, written as
 * standing instructions.
 */
export function buildFormatGuide({ categories, schoolName } = {}) {
  return [
    `You format ${schoolName ? `${schoolName}'s` : 'our yeshiva\'s'} schedules for the TV screen in the hallway (the "TachTach" screen). Schedules are one of the things you prepare for that screen. Whenever I ask for a schedule (e.g. "make this Shabbos: …" or "here is our weekly schedule: …"), answer in the matching format below so I can paste it straight in.`,
    '',
    '=== A schedule for specific dates (a day or Shabbos) ===',
    formatRules({ categories }),
    '',
    '=== The regular weekly schedule ===',
    weeklyFormatRules({ categories }),
    '',
    'If I give you an existing schedule in this format and ask for changes, return the whole changed schedule in the same format.',
  ].join('\n');
}

/**
 * "A day / Shabbos schedule" prompt — rules + the target dates + those dates' zmanim.
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
    'You help prepare content for our yeshiva\'s TV screen (the "TachTach" screen). Right now I need a schedule for specific dates, in the format below.',
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
    lines.push('', 'Put "alert 15 takeover | icon candle" on candle lighting.');
  }
  lines.push('', "Here's what's happening:", '');
  return lines.join('\n');
}

/**
 * "A weekly schedule" prompt. `currentText` (optional) is the current weekly
 * schedule in the same format, for "change this" requests.
 */
export function buildWeeklyPrompt({ categories = [], currentText = '' } = {}) {
  const lines = [
    'You help prepare content for our yeshiva\'s TV screen (the "TachTach" screen). Right now I need our regular WEEKLY schedule, in the format below.',
    '',
    weeklyFormatRules({ categories }),
  ];
  if (currentText.trim()) {
    lines.push('', 'Our current weekly schedule (change only what I ask for, and return the whole schedule):', '', '```', currentText.trim(), '```');
  }
  lines.push('', "Here's our weekly schedule (or what to change):", '');
  return lines.join('\n');
}

/**
 * Registry of prompt types behind the "Copy Claude prompt for…" menu. To add
 * a type (announcements, a batch of quotes, …) add one entry here: `build`
 * gets the same context object and returns the prompt text.
 *   needsDates: the type uses the date picker / zmanim summary.
 */
export const PROMPT_TYPES = [
  { id: 'day', label: 'A day / Shabbos schedule', needsDates: true, build: (ctx) => buildClaudePrompt(ctx) },
  { id: 'weekly', label: 'A weekly schedule', needsDates: false, build: (ctx) => buildWeeklyPrompt(ctx) },
];

export function buildPromptOfType(typeId, ctx = {}) {
  const t = PROMPT_TYPES.find((x) => x.id === typeId);
  if (!t) throw new Error(`Unknown prompt type "${typeId}"`);
  return t.build(ctx);
}
