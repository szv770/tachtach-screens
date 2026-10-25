/**
 * Weekly parsha (Diaspora) and the holiday / special-day names for a civil date,
 * computed locally. Pure JS, no network. Built on `hebrewCalendar.js`.
 *
 * The parsha rules are the standard 14 year-types (day Rosh Hashana falls on x
 * length of the year). Which of the seven joinable pairs are read together is a
 * fixed property of the year type, so one table is enough; it was derived from
 * Hebcal's schedule for 90 civil years (every one of the 14 types seen, each
 * type perfectly consistent) and is re-checked by test/localData.test.js.
 *
 * Names are Hebcal's spellings (the screen, the admin and the cache already use
 * them: 'Parashat Vayera', "Sh'vat", 'Iyyar', "Rosh Chodesh Sh’vat" ...).
 */
import {
  fixedFromISO, hebrewFromFixed, fixedFromHebrew, newYear, daysInYear, dowOfFixed, daysInMonth,
  isLeapYear, monthNameEn, NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR, ADAR_II,
} from './hebrewCalendar.js';

// ── The 54 portions ─────────────────────────────────────────────────────────

const EN = ['Bereshit', 'Noach', 'Lech-Lecha', 'Vayera', 'Chayei Sara', 'Toldot', 'Vayetzei', 'Vayishlach', 'Vayeshev', 'Miketz',
  'Vayigash', 'Vayechi', 'Shemot', 'Vaera', 'Bo', 'Beshalach', 'Yitro', 'Mishpatim', 'Terumah', 'Tetzaveh', 'Ki Tisa', 'Vayakhel',
  'Pekudei', 'Vayikra', 'Tzav', 'Shmini', 'Tazria', 'Metzora', 'Achrei Mot', 'Kedoshim', 'Emor', 'Behar', 'Bechukotai', 'Bamidbar',
  'Nasso', 'Beha’alotcha', 'Sh’lach', 'Korach', 'Chukat', 'Balak', 'Pinchas', 'Matot', 'Masei', 'Devarim', 'Vaetchanan', 'Eikev',
  'Re’eh', 'Shoftim', 'Ki Teitzei', 'Ki Tavo', 'Nitzavim', 'Vayeilech', 'Ha’azinu'];
const HE = ['בראשית', 'נח', 'לך־לך', 'וירא', 'חיי שרה', 'תולדות', 'ויצא', 'וישלח', 'וישב', 'מקץ', 'ויגש', 'ויחי', 'שמות', 'וארא', 'בא',
  'בשלח', 'יתרו', 'משפטים', 'תרומה', 'תצוה', 'כי תשא', 'ויקהל', 'פקודי', 'ויקרא', 'צו', 'שמיני', 'תזריע', 'מצרע', 'אחרי מות', 'קדשים',
  'אמור', 'בהר', 'בחקתי', 'במדבר', 'נשא', 'בהעלתך', 'שלח־לך', 'קורח', 'חוקת', 'בלק', 'פינחס', 'מטות', 'מסעי', 'דברים', 'ואתחנן', 'עקב',
  'ראה', 'שופטים', 'כי־תצא', 'כי־תבוא', 'נצבים', 'וילך', 'האזינו'];

export const PARSHIYOT_EN = EN;
const I = (name) => EN.indexOf(name);

/** The joinable pairs, by the index of the first portion. */
const PAIRS = { VP: I('Vayakhel'), TM: I('Tazria'), AK: I('Achrei Mot'), BB: I('Behar'), CB: I('Chukat'), MM: I('Matot'), NV: I('Nitzavim') };

/**
 * Pairs read together, per year type 'RoshHashanaWeekday-daysInYear' (0 = Sunday).
 * (A year starts on Mon/Tue/Thu/Sat only; 353/354/355 plain, 383/384/385 leap.)
 */
const COMBINED = {
  '1-353': 'VP TM AK BB MM NV', '1-355': 'VP TM AK BB CB MM NV', '1-383': 'CB MM NV', '1-385': 'MM',
  '2-354': 'VP TM AK BB CB MM NV', '2-384': 'MM',
  '4-354': 'VP TM AK BB MM', '4-355': 'TM AK BB MM', '4-383': '', '4-385': 'NV',
  '6-353': 'VP TM AK BB MM', '6-355': 'VP TM AK BB MM NV', '6-383': 'MM NV', '6-385': 'CB MM NV',
};

const yearKey = (y) => `${dowOfFixed(newYear(y))}-${daysInYear(y)}`;
const combinedSet = (y) => new Set((COMBINED[yearKey(y)] || '').split(' ').filter(Boolean));

/** Shabbos on which no portion is read (the holiday's own reading): RH, YK, Sukkot to Simchat Torah, Pesach, Shavuot. */
function isHolidayShabbos(h) {
  const { m, d } = h;
  if (m === TISHREI) return d <= 2 || d === 10 || (d >= 15 && d <= 23); // Sukkot to Simchat Torah
  if (m === NISAN) return d >= 15 && d <= 22;
  if (m === SIVAN) return d === 6 || d === 7;
  return false;
}

const unitName = (idx, pair) => (pair
  ? { en: `${EN[idx]}-${EN[idx + 1]}`, he: `${HE[idx]}־${HE[idx + 1]}` }
  : { en: EN[idx], he: HE[idx] });
// Hebcal writes the joined names with a few spellings of its own.
const JOINED_EN = { 'Chukat-Balak': 'Chukat-Balak' };
function labelFor(idx, pair) {
  const n = unitName(idx, pair);
  return { name: `Parashat ${JOINED_EN[n.en] || n.en}`, hebrew: `פרשת ${n.he}` };
}

const plan = new Map(); // hebrew year -> Map<fixed Shabbos, {idx,pair}|null>
/** Portions read on each Shabbos of Hebrew year y, from Bereshit to the Shabbos before Rosh Hashana. */
function yearPlan(y) {
  if (plan.has(y)) return plan.get(y);
  const comb = combinedSet(y);
  const map = new Map();
  let first = newYear(y) + ((6 - dowOfFixed(newYear(y)) + 7) % 7); // first Shabbos on/after 1 Tishrei
  const t23 = fixedFromHebrew(y, TISHREI, 23);
  while (first <= t23) first += 7;                                  // Bereshit = first Shabbos after Simchat Torah
  const end = newYear(y + 1);
  let idx = 0;
  for (let f = first; f < end; f += 7) {
    const h = hebrewFromFixed(f);
    if (isHolidayShabbos(h)) { map.set(f, null); continue; }
    if (idx >= EN.length - 1) break;
    const pair = [...Object.entries(PAIRS)].some(([k, i]) => i === idx && comb.has(k));
    map.set(f, { idx, pair });
    idx += pair ? 2 : 1;
  }
  map.firstShabbos = first;
  plan.set(y, map);
  if (plan.size > 40) plan.delete(plan.keys().next().value);
  return map;
}

/** { name, hebrew } of the portion read on the Shabbos with this fixed day, or null (holiday Shabbos). */
export function parshaOnShabbos(fixed) {
  const h = hebrewFromFixed(fixed);
  const p = yearPlan(h.y);
  if (fixed < p.firstShabbos) {
    // Between Rosh Hashana and Simchat Torah: the tail of last year's cycle (Vayeilech / Ha'azinu).
    if (isHolidayShabbos(h)) return null;
    const slots = [];
    for (let f = newYear(h.y) + ((6 - dowOfFixed(newYear(h.y)) + 7) % 7); f < p.firstShabbos; f += 7) {
      if (!isHolidayShabbos(hebrewFromFixed(f))) slots.push(f);
    }
    const joined = combinedSet(h.y - 1).has('NV');
    const last = slots[slots.length - 1];
    if (fixed === last) return labelFor(I('Ha’azinu'), false);
    if (!joined && fixed === slots[slots.length - 2]) return labelFor(I('Vayeilech'), false);
    return null;
  }
  const u = p.get(fixed);
  return u ? labelFor(u.idx, u.pair) : null;
}

/** Fixed day of the Shabbos on or after a fixed day. */
export const shabbosOnOrAfter = (fixed) => fixed + ((6 - dowOfFixed(fixed) + 7) % 7);

/**
 * Same answer as the Hebcal call `fetchParsha` makes: the portion of the first
 * Shabbos within [date, date+7]. null when that Shabbos is a holiday.
 * @returns {{name: string, hebrew: string, date: string}|null}
 */
export function parshaForDate(iso) {
  const f = shabbosOnOrAfter(fixedFromISO(iso));
  const p = parshaOnShabbos(f);
  if (!p) return null;
  return { ...p, date: new Date((f - 719163) * 86400000).toISOString().slice(0, 10) };
}

// ── Holidays and special days (Hebcal's names) ──────────────────────────────

const ORD = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
const RC_MONTH = (m, leap) => monthNameEn(m, leap).replace(/'/g, '’');

/** Months that carry two Rosh Chodesh days (the 30th of this month + the 1st of the next). */
function roshChodeshName(h) {
  if (h.d === 1 && h.m !== TISHREI) return `Rosh Chodesh ${RC_MONTH(h.m, h.leap)}`;
  if (h.d === 30) return `Rosh Chodesh ${RC_MONTH(h.m === ELUL ? TISHREI : h.m + 1, h.leap)}`;
  return null;
}

/**
 * Events on a civil date, in Hebcal's naming, for the classes of day we model:
 * the weekly portion, Rosh Chodesh, Yom Tov and Chol HaMoed, Chanukah, Purim and
 * Purim Katan, the fasts, Omer days, the special Shabbosim and the minor days.
 * NOT modelled (and left out on purpose): molad lines, Shabbat Mevarchim, the
 * Israeli memorial/independence days (their dates shift by rule), Leil Selichot,
 * Sigd, Yom HaAliyah, Chag HaBanot, Purim Meshulash.
 */
export function holidayEvents(iso) {
  const fixed = fixedFromISO(iso);
  const h = hebrewFromFixed(fixed);
  const dow = dowOfFixed(fixed);
  const { y, m, d, leap } = h;
  const out = [];
  const add = (e) => { if (e) out.push(e); };

  add(roshChodeshName(h));

  if (m === ELUL && d === 29) add('Erev Rosh Hashana');
  if (m === TISHREI) {
    if (d === 1) add(`Rosh Hashana ${y}`);
    if (d === 2) add('Rosh Hashana II');
    if ((d === 3 && dow !== 6) || (d === 4 && dow === 0)) add('Tzom Gedaliah');
    if (d === 9) add('Erev Yom Kippur');
    if (d === 10) add('Yom Kippur');
    if (d === 14) add('Erev Sukkot');
    if (d === 15) add('Sukkot I');
    if (d === 16) add('Sukkot II');
    if (d >= 17 && d <= 20) add(`Sukkot ${['III', 'IV', 'V', 'VI'][d - 17]} (CH’’M)`);
    if (d === 21) add('Sukkot VII (Hoshana Raba)');
    if (d === 22) add('Shmini Atzeret');
    if (d === 23) add('Simchat Torah');
    if (dow === 6 && d >= 3 && d <= 9) add('Shabbat Shuva');
  }
  if (m === KISLEV && d >= 25) add(`Chanukah day ${d - 24}`);
  if ((m === TEVET && d <= 3) || false) {
    const kLen = daysInMonth(y, KISLEV);
    const n = kLen - 24 + d; // Kislev 25..kLen then Tevet 1..
    if (n >= 6 && n <= 8) add(`Chanukah day ${n}`);
  }
  if (m === TEVET && d === 10) add('Asara B’Tevet');
  if (m === SHVAT && d === 15) add('Tu BiShvat');

  // Adar: Purim (in the last Adar), Purim Katan (Adar I, leap years)
  const purimMonth = leap ? ADAR_II : ADAR;
  if (leap && m === ADAR && d === 14) add('Purim Katan');
  if (leap && m === ADAR && d === 15) add('Shushan Purim Katan');
  if (m === purimMonth) {
    if ((d === 13 && dow !== 6) || (d === 11 && dow === 4)) add('Ta’anit Esther');
    if (d === 13) add('Erev Purim');
    if (d === 14) add('Purim');
    if (d === 15) add('Shushan Purim');
  }

  if (m === NISAN) {
    if ((d === 14 && dow !== 6) || (d === 12 && dow === 4)) add('Ta’anit Bechorot');
    if (d === 14) add('Erev Pesach');
    if (d === 15) add('Pesach I');
    if (d === 16) add('Pesach II');
    if (d >= 17 && d <= 20) add(`Pesach ${['III', 'IV', 'V', 'VI'][d - 17]} (CH’’M)`);
    if (d === 21) add('Pesach VII');
    if (d === 22) add('Pesach VIII');
  }
  if (m === IYYAR) {
    if (d === 14) add('Pesach Sheni');
    if (d === 18) add('Lag BaOmer');
    if (d === 28) add('Yom Yerushalayim');
  }
  if (m === SIVAN) {
    if (d === 5) add('Erev Shavuot');
    if (d === 6) add('Shavuot I');
    if (d === 7) add('Shavuot II');
  }
  if (m === TAMUZ && ((d === 17 && dow !== 6) || (d === 18 && dow === 0))) add('Tzom Tammuz');
  if (m === AV) {
    if (d === 9 && dow !== 6) add('Tish’a B’Av');
    if (d === 10 && dow === 0) add('Tish’a B’Av (observed)');
    if (d === 8 && dowOfFixed(fixed + 1) !== 6) add('Erev Tish’a B’Av'); // none when the fast moves to Sunday
    if (d === 15) add('Tu B’Av');
  }

  // Omer
  const day16 = fixedFromHebrew(y, NISAN, 16);
  const omer = fixed - day16 + 1;
  if (omer >= 1 && omer <= 49) add(`${ORD(omer)} day of the Omer`);

  // special Shabbosim
  if (dow === 6) {
    const f = fixed;
    const adarLast = purimMonth;
    const purim = fixedFromHebrew(y, adarLast, 14);
    const rcAdar = fixedFromHebrew(y, adarLast, 1);
    const rcNisan = fixedFromHebrew(y, NISAN, 1);
    const pesach = fixedFromHebrew(y, NISAN, 15);
    const av9 = fixedFromHebrew(y, AV, 9);
    if (f === rcAdar - ((dowOfFixed(rcAdar) + 1) % 7)) add('Shabbat Shekalim');
    if (f === purim - (((dowOfFixed(purim) + 1) % 7) || 7)) add('Shabbat Zachor');
    const hachodesh = rcNisan - ((dowOfFixed(rcNisan) + 1) % 7);
    if (f === hachodesh - 7) add('Shabbat Parah');
    if (f === hachodesh) add('Shabbat HaChodesh');
    if (f === pesach - (((dowOfFixed(pesach) + 1) % 7) || 7)) add('Shabbat HaGadol');
    if (f === av9 - ((dowOfFixed(av9) + 1) % 7)) add('Shabbat Chazon');
    if (f === shabbosOnOrAfter(av9 + 1)) add('Shabbat Nachamu');
    const p = parshaOnShabbos(f);
    if (p && p.name === 'Parashat Beshalach') add('Shabbat Shirah');
  }
  return out;
}

/**
 * The event list the way Hebcal's converter returns it: the day's own holidays,
 * plus the portion of the Shabbos on or after the day when that Shabbos reads a
 * regular portion. (Hebcal also tags days before a holiday Shabbos with the
 * holiday's name; those labels are not reproduced.)
 */
export function eventsFor(iso) {
  const fixed = fixedFromISO(iso);
  const out = holidayEvents(iso);
  const p = parshaOnShabbos(shabbosOnOrAfter(fixed));
  if (p) out.push(p.name);
  return out;
}

// Re-exported so callers (and the parity test) can read the table.
export const _internals = { COMBINED, yearKey, isLeapYear };
