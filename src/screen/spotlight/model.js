/**
 * Spotlight kiosk: the PROPS CONTRACT the graphics are drawn from, the time maths they share, and every word they print.
 *
 * The pure rules (which day, which stage, heat, which kind, which acts) live in src/shared/spotlight.js (PLAN.md step 1).
 * The kiosk components never decide any of that: they draw ONE view of ONE spotlight from this view model. The wiring
 * (OccasionSlide / rotation) builds a `SpotModel` from the rules' output and picks the `view`.
 *
 * @typedef {{ en?: string, he?: string }} Bi                       two languages of one text
 * @typedef {{ en?: string, he?: string, source?: string }} Sourced  a text with an optional source line
 *
 * @typedef {Object} SpotYears                 a milestone year (from occasionYears.milestoneOf + yearWords + vortFor)
 * @property {'major'|'notable'} tier
 * @property {number} n                        the milestone number shown big (40)
 * @property {string} [letters]                gematria of n ('מ׳'); '' when none
 * @property {number} [completed]              years completed (40)
 * @property {number} [entering]               the year being entered (41)
 * @property {'completed'|'entering'} [focus]
 * @property {Bi} [what]                       what it is the years OF ('Didan Notzach'); defaults to the name
 * @property {Sourced} [vort]                  the number's vort (yearVorts / NUMBER_VORTS)
 *
 * @typedef {Object} SpotModel
 * @property {string} key                      occurrence key (stable while it is the spotlight)
 * @property {Bi} name
 * @property {'both'|'english'|'hebrew'} [lang]   the Countdown's language setting (hebrew = the frame mirrors, RTL)
 * @property {'announce'|'month'|'twoWeeks'|'week'|'eve'|'lastHour'|'day'} stage   (stageOf)
 * @property {number} heat                     0..1 (changes at stage boundaries only)
 * @property {number} startMs                  when the day BEGINS (evening before, for a Jewish date)
 * @property {number} [endMs]                  when it is over (a 2-day occasion = end of the 2nd day)
 * @property {number} [leadStartMs]            when this spotlight started (ring / meter / journey / calendar fraction)
 * @property {number} [days]                   CALENDAR days to the day itself (shared/occasions daysUntil); else ceil of ms
 * @property {Bi} [kicker]                     stage words ('Two weeks to go'); default per stage from WORDS.stage
 * @property {Bi} [begins]                     footer line ('Begins Monday evening · Shkia 5:32 PM')
 * @property {{ label: Bi, value: Bi }[]} [facts]   up to 4 chips (Hebrew date, weekday ...) for the Journey kind
 * @property {SpotYears|null} [years]
 * @property {Sourced} [happened]              explainShortEn/He (+ source): what happened, one line
 * @property {Sourced} [story]                 explainEn/He + source
 * @property {Sourced} [vort]                  the day's vort
 * @property {{ year: number|string, en?: string, he?: string }[]} [history]   this day in history (<= 8)
 * @property {{ src: string, dim?: number }} [photo]   look.photo + look.dim (0..0.8)
 * @property {Bi} [advent]                     today's advent line (Calendar kind)
 * @property {{ key: string, name: Bi, days: number }[]} [strip]   the side strip (already filtered: count / days / small)
 * @property {string} [accent]                 look.accent (a CSS colour) or ''
 * @property {boolean} [approx]               the begin time is approximate (rules: approx): no seconds anywhere
 * @property {boolean} [ticks]                seconds are shown live (rules: ticksSeconds; false when the time is approximate)
 * @property {string} [numeralsFont]           look.numeralsFont (a font NAME, through fontStack) or ''
 *
 * @typedef {{ kind: 'count', type: SpotType }
 *         | { kind: 'seal' }
 *         | { kind: 'act', act: 'happened'|'history'|'vort'|'photo'|'story' }
 *         | { kind: 'day' }} SpotView
 * @typedef {'flip'|'ring'|'journey'|'glow'|'calendar'|'meter'|'sleeps'|'odometer'} SpotType
 *
 * Component props (every view): { sp: SpotModel, view: SpotView, nowMs: number, still?: boolean }
 * Kind props (inside the shell): { sp, t: TimeLeft, box: { w, h }, ctx: { portrait, rtl, lang, still, light } }
 */

export const DAY = 86400000;
export const HOUR = 3600000;
export const MIN = 60000;

export const TYPE_IDS = Object.freeze(['flip', 'ring', 'journey', 'glow', 'calendar', 'meter', 'sleeps', 'odometer']);
export const SECONDS_STAGES = Object.freeze(['eve', 'lastHour']);

/**
 * @typedef {Object} TimeLeft
 * @property {number} ms   @property {number} d @property {number} h @property {number} m @property {number} s
 * @property {number} days      calendar days to the day
 * @property {number} frac      0..1 of the way from leadStartMs to startMs
 * @property {number} leadDays  length of the lead, days
 * @property {boolean} near     the last day (eve / lastHour): hours / minutes replace days
 * @property {boolean} secs     seconds tick (near AND the time is exact: sp.ticks from the rules' ticksSeconds)
 */
export function timeLeft(sp, nowMs) {
  const ms = Math.max(0, (sp.startMs || 0) - nowMs);
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  const days = Number.isFinite(sp.days) ? Math.max(0, sp.days) : Math.ceil(ms / DAY);
  const lead = Math.max(HOUR, (sp.startMs || 0) - (sp.leadStartMs ?? (sp.startMs - 60 * DAY)));
  const frac = Math.min(1, Math.max(0, 1 - ms / lead));
  const near = SECONDS_STAGES.includes(sp.stage);
  return { ms, d, h, m, s, days, frac, leadDays: lead / DAY, near, secs: near && sp.ticks !== false, exact: !sp.approx };
}

/** The ONE big number and its unit, for kinds that show a single number. */
export function bigCount(t) {
  if (!t.near && t.days >= 1) return { n: t.days, unit: t.days === 1 ? 'day' : 'days' };
  if (t.ms >= HOUR) { const n = Math.floor(t.ms / HOUR); return { n, unit: n === 1 ? 'hour' : 'hours' }; }
  if (t.ms >= MIN) { const n = Math.floor(t.ms / MIN); return { n, unit: n === 1 ? 'minute' : 'minutes' }; }
  return t.secs ? { n: Math.floor(t.ms / 1000), unit: 'seconds' } : { n: Math.max(1, Math.ceil(t.ms / MIN)), unit: 'minutes' };
}

export const pad2 = (n) => String(Math.max(0, n)).padStart(2, '0');

/** H:MM:SS (or M:SS in the last hour) for the seconds stages. */
export function clockText(t) {
  const hh = Math.floor(t.ms / HOUR);
  if (!t.secs) return `${hh}:${pad2(t.m)}`;
  return hh > 0 ? `${hh}:${pad2(t.m)}:${pad2(t.s)}` : `${t.m}:${pad2(t.s)}`;
}

/**
 * Every word the Spotlight graphics print. HEBREW: owner rule 7 (2026-11-16): a native speaker checks these later;
 * `HE_REVIEW` below lists every new Hebrew string in one place.
 */
export const WORDS = Object.freeze({
  units: {
    day: { en: 'Day', he: 'יום' }, days: { en: 'Days', he: 'ימים' },
    hour: { en: 'Hour', he: 'שעה' }, hours: { en: 'Hours', he: 'שעות' },
    minute: { en: 'Minute', he: 'דקה' }, minutes: { en: 'Minutes', he: 'דקות' },
    seconds: { en: 'Seconds', he: 'שניות' },
  },
  toGo: {
    day: { en: 'day to go', he: 'יום נותר' }, days: { en: 'days to go', he: 'ימים נותרו' },
    hour: { en: 'hour to go', he: 'שעה נותרה' }, hours: { en: 'hours to go', he: 'שעות נותרו' },
    minute: { en: 'minute to go', he: 'דקה נותרה' }, minutes: { en: 'minutes to go', he: 'דקות נותרו' },
    seconds: { en: 'seconds to go', he: 'שניות נותרו' },
  },
  stage: {
    announce: { en: 'Coming', he: 'בקרוב' },
    month: { en: 'Get ready', he: 'מתכוננים' },
    twoWeeks: { en: 'Two weeks to go', he: 'עוד שבועיים' },
    week: { en: 'This week', he: 'השבוע' },
    eve: { en: 'Tonight is the night', he: 'הלילה זה קורה' },
    lastHour: { en: 'The last hour', he: 'השעה האחרונה' },
    day: { en: 'Today', he: 'היום' },
  },
  wayThere: { en: 'The way there', he: 'הדרך אל היום' },
  youAreHere: { en: 'Today', he: 'היום' },
  theDay: { en: 'The day', he: 'היום הגדול' },
  ofTheWay: { en: 'of the way', he: 'מהדרך' },
  chosen: { en: 'Started', he: 'התחלנו' },
  sleeps: { en: 'sleeps to go', he: 'לילות נותרו' },
  sleep: { en: 'sleep to go', he: 'לילה נותר' },
  tonight: { en: 'Tonight', he: 'הלילה' },
  today: { en: 'Today', he: 'היום' },
  todayIs: { en: 'Today is', he: 'היום' },
  happening: { en: 'Happening now', he: 'קורה עכשיו' },
  happened: { en: 'What happened', he: 'מה קרה' },
  history: { en: 'This day in history', he: 'היום בהיסטוריה' },
  vort: { en: 'A thought for the day', he: 'דבר תורה' },
  story: { en: 'The story', he: 'הסיפור' },
  source: { en: 'Source', he: 'מקור' },
  comingUp: { en: 'Coming up', he: 'בהמשך' },
  inDays: { en: (n) => (n === 1 ? 'tomorrow' : `in ${n} days`), he: (n) => (n === 1 ? 'מחר' : `בעוד ${n} ימים`) },
  yearsSince: { en: 'years since', he: 'שנים מאז' },
  entering: { en: (n) => `Entering the ${ordinal(n)} year`, he: (l) => `נכנסים לשנת ה${l}` },
  milestone: { en: 'A milestone year', he: 'שנת ציון דרך' },
  weekdays: { en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], he: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] },
});

/** The new Hebrew strings of the Spotlight graphics, for the owner's native-speaker check (PLAN.md decision 7). */
export const HE_REVIEW = Object.freeze([
  ...Object.values(WORDS.units).map((x) => x.he),
  ...Object.values(WORDS.toGo).map((x) => x.he),
  ...Object.values(WORDS.stage).map((x) => x.he),
  ...['wayThere', 'youAreHere', 'theDay', 'ofTheWay', 'chosen', 'sleeps', 'sleep', 'tonight', 'today', 'todayIs', 'happening',
    'happened', 'history', 'vort', 'story', 'source', 'comingUp', 'yearsSince', 'milestone'].map((k) => WORDS[k].he),
  'בעוד N ימים', 'מחר', 'נכנסים לשנת ה…', 'שנה ל…',
]);

export function ordinal(n) {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${s}`;
}

/** Language helpers: hebrew = Hebrew only (RTL frame); english = English only; both = Hebrew name + English labels. */
export const isHe = (lang) => lang === 'hebrew';
export const pick = (bi, lang) => {
  if (!bi) return '';
  if (lang === 'hebrew') return bi.he || bi.en || '';
  return bi.en || bi.he || '';
};
export const hasText = (x) => !!(x && ((x.en && x.en.trim()) || (x.he && x.he.trim())));
