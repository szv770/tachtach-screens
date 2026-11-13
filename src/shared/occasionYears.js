/**
 * Milestone YEARS for the Countdown (pure, no DOM, unit-tested: test/occasionYears.test.js).
 *
 * An occasion may know the Hebrew year it first happened (`since: { year: 5747 }`). Then every coming date is a number of
 * years, and BOTH readings are available:
 *   completed  the anniversary the day brings:  5 Teves 5787 is 40 years since 5747
 *   entering   the year the day starts:         22 Shevat 5787 (39 years since 5748) enters the 40th year
 * A day is a milestone when either number is. Tiers:
 *   major    the numbers that get the whole treatment (a huge year seal, hype at maximum, extra takeover moments)
 *   notable  a round or meaningful number: a short vort under the countdown, normal hype
 *   (none)   an ordinary year: nothing is added
 * The vort of a number comes from, in order: the occasion's own text for that number (`milestoneTexts`, e.g. the Rebbe's
 * words at the Frierdiker Rebbe's 100th, reused for the Rebbe's own 100th), the built-in number table below, else none.
 * The built-in table only holds numbers whose meaning is plain and citable (a verse, a Gemara, a gematria); every entry
 * names its source and the owner can change any of them. Nothing here invents a fact about a day.
 */
import { gematria, hebrewFromFixed, fixedFromISO } from './hebrewCalendar.js';

export const SINCE_MIN = 1000; // a Hebrew year the owner may type
export const SINCE_MAX = 6000;

/** Numbers that always get the full treatment. */
export const MAJOR = Object.freeze([18, 36, 40, 50, 70, 100, 120, 125, 150, 200, 250, 300, 400, 500, 1000]);
/** Chai multiples (18 x n) are meaningful on their own: 18 and 36 are major, the rest notable. */
export const CHAI_MULTIPLES = Object.freeze([54, 72, 90, 108, 126, 144, 162, 180]);

/** Built-in vorts by number: { en, he, source }. Short, plain, citable. The owner can replace any of them. */
export const NUMBER_VORTS = Object.freeze({
  10: { en: 'Ten: the Ten Commandments, and the ten men of a minyan.', he: 'עשרה: עשרת הדיברות, ועשרה למניין.', source: 'Shemos 20; Berachos 21b' },
  13: { en: 'Thirteen: the same as אחד (one) and אהבה (love).', he: 'שלוש עשרה: כמנין אחד וכמנין אהבה.', source: 'gematria' },
  18: { en: 'Eighteen is חי: life.', he: 'י״ח הוא חי: חיים.', source: 'gematria' },
  26: { en: 'Twenty-six is the value of the Name י־ה־ו־ה.', he: 'כ״ו הוא מנין שם הוי״ה.', source: 'gematria' },
  36: { en: 'Thirty-six: double chai, and the thirty-six hidden tzaddikim of every generation.', he: 'ל״ו: כפול חי, ולו צדיקים נסתרים בכל דור.', source: 'Sukkah 45b' },
  40: { en: 'Forty years: "a person does not stand on his teacher’s mind until forty years," when the heart is given "to know."', he: 'ארבעים שנה: ״אין אדם עומד על סוף דעת רבו עד ארבעים שנה״, אז ניתן ״לב לדעת״.', source: 'Avodah Zarah 5b; Rashi on Devarim 29:3' },
  50: { en: 'Fifty: the Yovel year, and the fifty gates of understanding.', he: 'חמישים: שנת היובל, וחמישים שערי בינה.', source: 'Vayikra 25:10; Rosh Hashanah 21b' },
  70: { en: 'Seventy: "the days of our years are seventy years."', he: 'שבעים: ״ימי שנותינו בהם שבעים שנה״.', source: 'Tehillim 90:10' },
  72: { en: 'Seventy-two is חסד: kindness.', he: 'שבעים ושתיים הוא חסד.', source: 'gematria' },
  100: { en: 'One hundred: the hundred blessings a person says every day.', he: 'מאה: מאה ברכות בכל יום.', source: 'Menachos 43b' },
  120: { en: 'One hundred and twenty: the years of Moshe Rabbeinu, and the wish "until 120."', he: 'מאה ועשרים: שנותיו של משה רבנו.', source: 'Devarim 34:7' },
});

/** The Hebrew year a civil date falls in. */
export function hebrewYearOf(iso) {
  return hebrewFromFixed(fixedFromISO(iso)).y;
}

/** A valid `since`: { year } with a plausible Hebrew year, or null. */
export function normalizeSince(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const y = typeof raw.year === 'string' && raw.year.trim() ? Number(raw.year) : raw.year;
  return Number.isInteger(y) && y >= SINCE_MIN && y <= SINCE_MAX ? { year: y } : null;
}

/** Years for the occurrence starting on `startISO`: { completed, entering } or null (no `since`, or not yet a year). */
export function yearsFor(since, startISO) {
  const s = normalizeSince(since);
  if (!s || !startISO) return null;
  const completed = hebrewYearOf(startISO) - s.year;
  return completed >= 1 ? { completed, entering: completed + 1 } : null;
}

/** The tier of one number: 'major' | 'notable' | null (and why, for the admin). */
export function tierOfNumber(n) {
  if (!Number.isInteger(n) || n < 1) return null;
  if (MAJOR.includes(n)) return 'major';
  if (CHAI_MULTIPLES.includes(n) || NUMBER_VORTS[n] || n % 10 === 0 || n % 25 === 0) return 'notable';
  return null;
}

const RANK = { major: 2, notable: 1 };

/**
 * The milestone of an occurrence:
 *   { completed, entering, tier, focus: 'completed'|'entering', n }  when it is one,
 *   { completed, entering, tier: null }                              for an ordinary year,
 *   null                                                             without `since`.
 * `focus` is the number the day is about: the completed anniversary unless only the entering year is the milestone.
 */
export function milestoneOf(since, startISO) {
  const y = yearsFor(since, startISO);
  if (!y) return null;
  const tc = tierOfNumber(y.completed); const te = tierOfNumber(y.entering);
  if (!tc && !te) return { ...y, tier: null };
  const entering = (RANK[te] || 0) > (RANK[tc] || 0);
  return { ...y, tier: entering ? te : tc, focus: entering ? 'entering' : 'completed', n: entering ? y.entering : y.completed };
}

const ORDINAL_EN = (n) => {
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th'}`;
};

/** A number as Hebrew letters (125 = קכ״ה). */
export const yearLetters = (n) => (n >= 1 && n < 1000 ? gematria(n) : ''); // gematria is for 1-999; a bigger number shows no letters

/** The words of a milestone: { big: '40', letters: 'מ׳', line: {en,he}, kicker: {en,he} }. `line` is the sentence under the number. */
export function yearWords(m) {
  if (!m || !m.n) return null;
  const letters = yearLetters(m.n);
  if (m.focus === 'entering') {
    return { big: String(m.n), letters, kicker: { en: 'Entering', he: 'נכנסים לשנת' }, line: { en: `the ${ORDINAL_EN(m.n)} year`, he: letters || String(m.n) } };
  }
  return { big: String(m.n), letters, kicker: { en: 'Years since', he: 'שנים מאז' }, line: { en: `${m.n} years`, he: `${letters || m.n} שנים`.trim() } };
}

/**
 * The vort for a milestone: the occasion's own text for that number, else the built-in one. `texts` is the occasion's
 * `milestoneTexts` ({ '40': { en, he, source } }). Returns { en, he, source, own } or null.
 */
export function vortFor(m, texts) {
  if (!m || !m.tier) return null;
  const own = texts && (texts[String(m.n)] || texts[String(m.completed)] || texts[String(m.entering)]);
  if (own && (own.en || own.he)) return { en: own.en || '', he: own.he || '', source: own.source || '', own: true };
  const b = NUMBER_VORTS[m.n];
  return b ? { ...b, own: false } : null;
}

/** Days-left moments for a major milestone (more than an ordinary day gets). */
export const MAJOR_MILESTONE_DAYS = Object.freeze([100, 60, 30, 21, 14, 10, 7, 5, 3, 2, 1]);

/** Words a chat assistant needs to find what the Rebbe said at a milestone (the owner pastes the answer in as the vort). */
export function milestonePrompt({ name, n, focus, since }) {
  const what = focus === 'entering' ? `entering the ${ORDINAL_EN(n)} year since` : `${n} years since`;
  return `I am preparing the screen of a Chabad yeshiva for a milestone: ${what} "${name}"${since ? ` (Hebrew year ${since})` : ''}.
Find what the Rebbe said at a SIMILAR milestone of another Rebbe or day (for example the ${n}th year of the Frierdiker Rebbe's birthday or liberation, or the Alter Rebbe's), so the same idea can be used now.
Give me ONLY real, checkable material: the exact words, in Hebrew and English if you can, and the exact source (sicha or maamar, date, and where it is printed). If you are not sure, say "I am not sure" instead of guessing. Do not invent a quote.
Reply with one short paragraph (under 400 characters) I can put on the screen, then the source on its own line.`;
}
