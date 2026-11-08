/**
 * 'Pick a day': the library of well-known Jewish and Chassidic calendar days the admin can add to the Countdown with one tap.
 * Pure data + small helpers (tested in test/occasionLibrary.test.js). Nothing here is a story or a reason: a name, a Hebrew-date
 * rule, how many days it lasts, and sensible suggestions (when it begins, the greeting, the takeover style). OWNER RULE: an
 * explanation only ever shows WITH a checked source, so this file has none; the admin adds one in the edit sheet.
 *
 * Every date is a plain calendar rule that can be checked against any printed luach; the admin panel still says 'check with your
 * rav and your minhag'. Left out on purpose (not certain / not a single plain rule): see docs/claude/FEATURES.md 'Occasions library'.
 *
 * An entry: { key, en, he, rule, days?, beginsAt?, zero, style, celebrate?, shabbos?, cat, category, find? }
 *   `category` is the occasion's collection (chabad | yomtov | fast | roshChodesh), see CATEGORIES in occasions.js.
 *   `key` of the starter calendar rows is the same key as in STARTERS (so 'Added' also recognises a restored starter).
 *   `find` = extra words the search understands ('hanukkah', 'tisha bav').
 */
import { STARTERS } from './occasions.js';
import { NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL, TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR, ADAR_II } from './hebrewCalendar.js';
import { parseDateText } from './occasionDateText.js';

export const LIBRARY_CATS = Object.freeze(['chassidic', 'yomtov', 'minor', 'fast', 'roshchodesh']);
export const LIBRARY_CAT_LABEL = Object.freeze({
  chassidic: 'Chassidic days', yomtov: 'Yom Tov and the days before', minor: 'Other days on the Jewish calendar', fast: 'Fast days', roshchodesh: 'Rosh Chodesh',
});

const H = (month, day) => ({ kind: 'hebrew', month, day });
const RC = (month) => ({ kind: 'roshChodesh', month });
const MONTH_ORDER = [TISHREI, CHESHVAN, KISLEV, TEVET, SHVAT, ADAR, ADAR_II, NISAN, IYYAR, SIVAN, TAMUZ, AV, ELUL];
const calendarIndex = (rule) => (rule.month === 0 ? 99 : MONTH_ORDER.indexOf(rule.month) * 40 + (rule.day || 0));

// which category each starter row belongs to
const STARTER_CAT = {
  'rc-kislev': 'roshchodesh', 'yud-kislev': 'chassidic', 'yud-tes-kislev': 'chassidic', chanukah: 'minor', 'hey-teves': 'chassidic',
  'yud-shvat': 'chassidic', 'tu-bishvat': 'minor', purim: 'minor', 'yud-alef-nissan': 'chassidic', pesach: 'yomtov', 'pesach-sheni': 'minor',
  'lag-baomer': 'minor', shavuos: 'yomtov', 'yud-beis-tammuz': 'chassidic', 'tu-bav': 'minor', 'chai-elul': 'chassidic', 'rosh-hashana': 'yomtov',
  'yom-kippur': 'yomtov', sukkos: 'yomtov', 'shemini-atzeres': 'yomtov', 'rosh-chodesh': 'roshchodesh',
};
const STARTER_FIND = {
  chanukah: ['hanukkah', 'hanukah', 'chanuka'], 'tu-bishvat': ['tu bishvat', 'tu beshvat', 'new year of the trees'], purim: ['purim'], 'lag-baomer': ['lag baomer', 'lag b omer', 'lag laomer'],
  'rosh-hashana': ['rosh hashanah', 'rosh hashana', 'new year'], 'yom-kippur': ['yom kippur', 'kippur'], sukkos: ['sukkot', 'succos'], shavuos: ['shavuot'],
  'shemini-atzeres': ['simchas torah', 'simchat torah', 'shemini atzeret'], 'tu-bav': ['tu bav', 'tu b av', '15 av'], 'yud-beis-tammuz': ['12 tammuz', '13 tammuz', 'yud gimmel tammuz'],
  'pesach-sheni': ['pesach sheini', 'second pesach'], 'rosh-chodesh': ['rosh chodesh', 'new month'],
};

const fromStarters = STARTERS.map((s) => ({
  key: s.key, en: s.en, he: s.he, rule: s.rule, days: s.days || 1, beginsAt: s.beginsAt || 'default', zero: s.zero, style: s.style,
  celebrate: s.celebrate !== false, shabbos: 'stay', cat: STARTER_CAT[s.key] || 'minor', find: STARTER_FIND[s.key] || [],
}));

const X = (key, en, he, rule, o = {}) => ({
  key, en, he, rule, days: o.days || 1, beginsAt: o.beginsAt || 'default', zero: o.zero || 'here', style: o.style || 'classic',
  celebrate: o.celebrate !== false, shabbos: o.shabbos || 'stay', cat: o.cat || 'minor', find: o.find || [],
});
const RCM = (key, month, en, he) => X(key, `Rosh Chodesh ${en}`, `ראש חודש ${he}`, RC(month), { zero: 'chodeshTov', style: 'roshchodesh', cat: 'roshchodesh', find: ['rosh chodesh'] });

const extras = [
  // Chassidic days (dates only; nothing about what happened). Left out: see FEATURES.md 'Occasions library'.
  X('tes-kislev', 'Tes Kislev', 'ט׳ כסלו', H(KISLEV, 9), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['9 kislev'] }),
  X('yud-daled-kislev', 'Yud-Daled Kislev', 'י״ד כסלו', H(KISLEV, 14), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['14 kislev'] }),
  X('beis-nissan', 'Beis Nissan', 'ב׳ ניסן', H(NISAN, 2), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['2 nissan'] }),
  X('yud-gimmel-nissan', 'Yud-Gimmel Nissan', 'י״ג ניסן', H(NISAN, 13), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['13 nissan'] }),
  X('yud-gimmel-tishrei', 'Yud-Gimmel Tishrei', 'י״ג תשרי', H(TISHREI, 13), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['13 tishrei'] }),
  X('vov-tishrei', 'Vov Tishrei', 'ו׳ תשרי', H(TISHREI, 6), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['6 tishrei'] }),
  X('tes-vav-elul', 'Tes-Vav Elul', 'ט״ו אלול', H(ELUL, 15), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['15 elul'] }),
  X('beis-iyar', 'Beis Iyar', 'ב׳ אייר', H(IYYAR, 2), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['2 iyar'] }),
  X('chof-ches-sivan', 'Chof-Ches Sivan', 'כ״ח סיון', H(SIVAN, 28), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['28 sivan'] }),
  X('chof-beis-shvat', 'Chof-Beis Shvat', 'כ״ב שבט', H(SHVAT, 22), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['22 shvat'] }),
  X('chof-hey-adar', 'Chof-Hey Adar', 'כ״ה אדר', H(ADAR, 25), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['25 adar'] }),
  X('chof-av', 'Chof Av', 'כ׳ אב', H(AV, 20), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['20 av'] }),
  X('chof-cheshvan', 'Chof Cheshvan', 'כ׳ חשון', H(CHESHVAN, 20), { zero: 'gutYomTov', style: 'chassidic', cat: 'chassidic', find: ['20 cheshvan'] }),
  X('chof-daled-teves', 'Chof-Daled Teves', 'כ״ד טבת', H(TEVET, 24), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['24 teves', '24 tevet'] }),
  X('gimmel-tammuz', 'Gimmel Tammuz', 'ג׳ תמוז', H(TAMUZ, 3), { zero: 'quiet', style: 'chassidic', celebrate: false, cat: 'chassidic', find: ['3 tammuz'] }),
  // Yom Tov and the days before
  X('erev-rosh-hashana', 'Erev Rosh Hashana', 'ערב ראש השנה', H(ELUL, 29), { zero: 'quiet', celebrate: false, cat: 'yomtov' }),
  X('erev-yom-kippur', 'Erev Yom Kippur', 'ערב יום כיפור', H(TISHREI, 9), { zero: 'quiet', celebrate: false, cat: 'yomtov', find: ['tes tishrei', '9 tishrei'] }),
  X('erev-sukkos', 'Erev Sukkos', 'ערב סוכות', H(TISHREI, 14), { zero: 'quiet', celebrate: false, cat: 'yomtov', find: ['erev sukkot'] }),
  X('hoshana-raba', 'Hoshana Raba', 'הושענא רבה', H(TISHREI, 21), { zero: 'here', style: 'yomtov', cat: 'yomtov', find: ['hoshana rabbah', 'hoshanah rabbah'] }),
  X('erev-pesach', 'Erev Pesach', 'ערב פסח', H(NISAN, 14), { zero: 'quiet', celebrate: false, cat: 'yomtov' }),
  X('shevii-shel-pesach', 'Shevii shel Pesach (last two days)', 'שביעי של פסח', H(NISAN, 21), { days: 2, beginsAt: 'candles', zero: 'pesach', style: 'pesach', cat: 'yomtov', find: ['seventh day of pesach', 'acharon shel pesach'] }),
  X('erev-shavuos', 'Erev Shavuos', 'ערב שבועות', H(SIVAN, 5), { zero: 'quiet', celebrate: false, cat: 'yomtov', find: ['erev shavuot'] }),
  // Other days
  X('zayin-adar', 'Zayin Adar', 'ז׳ אדר', H(ADAR, 7), { zero: 'quiet', celebrate: false, cat: 'minor', find: ['7 adar'] }),
  X('shushan-purim', 'Shushan Purim', 'שושן פורים', H(ADAR, 15), { zero: 'purim', style: 'purim', cat: 'minor', find: ['purim'] }),
  X('yom-yerushalayim', 'Yom Yerushalayim', 'יום ירושלים', H(IYYAR, 28), { zero: 'here', style: 'hype', cat: 'minor', find: ['jerusalem day', '28 iyar'] }),
  // Fasts (a day that falls on Shabbos moves; the fast is counted from the start of the day)
  X('tzom-gedalya', 'Tzom Gedalya', 'צום גדליה', H(TISHREI, 3), { beginsAt: 'midnight', zero: 'quiet', celebrate: false, shabbos: 'sunday', cat: 'fast', find: ['gedalia', 'fast of gedaliah', 'gimmel tishrei', '3 tishrei'] }),
  X('asara-bteves', "Asara B'Teves", 'עשרה בטבת', H(TEVET, 10), { beginsAt: 'midnight', zero: 'quiet', celebrate: false, cat: 'fast', find: ['tenth of teves', 'asarah btevet', '10 teves', 'yud teves'] }),
  X('taanis-esther', 'Taanis Esther', 'תענית אסתר', H(ADAR, 13), { beginsAt: 'midnight', zero: 'quiet', celebrate: false, shabbos: 'thursday', cat: 'fast', find: ['fast of esther', 'taanit esther', '13 adar'] }),
  X('shiva-asar-btammuz', "Shiva Asar B'Tammuz", 'שבעה עשר בתמוז', H(TAMUZ, 17), { beginsAt: 'midnight', zero: 'quiet', celebrate: false, shabbos: 'sunday', cat: 'fast', find: ['17 tammuz', 'seventeenth of tammuz', 'shiva asar btamuz'] }),
  X('tisha-bav', "Tisha B'Av", 'תשעה באב', H(AV, 9), { beginsAt: 'shkia', zero: 'quiet', celebrate: false, shabbos: 'sunday', cat: 'fast', find: ['tisha bav', 'tisha b av', '9 av', 'ninth of av'] }),
  // Rosh Chodesh, by month (Kislev and 'every month' come with the starters; Tishrei is Rosh Hashana)
  RCM('rc-cheshvan', CHESHVAN, 'Cheshvan', 'חשון'),
  RCM('rc-teves', TEVET, 'Teves', 'טבת'),
  RCM('rc-shvat', SHVAT, 'Shvat', 'שבט'),
  RCM('rc-adar', ADAR, 'Adar (Adar I in a leap year)', 'אדר'),
  RCM('rc-adar-ii', ADAR_II, 'Adar II (leap years only)', 'אדר ב׳'),
  RCM('rc-nissan', NISAN, 'Nissan', 'ניסן'),
  RCM('rc-iyar', IYYAR, 'Iyar', 'אייר'),
  RCM('rc-sivan', SIVAN, 'Sivan', 'סיון'),
  RCM('rc-tammuz', TAMUZ, 'Tammuz', 'תמוז'),
  RCM('rc-av', AV, 'Av', 'אב'),
  RCM('rc-elul', ELUL, 'Elul', 'אלול'),
];

const CAT_TO_CATEGORY = { chassidic: 'chabad', yomtov: 'yomtov', minor: 'yomtov', fast: 'fast', roshchodesh: 'roshChodesh' };
const catIndex = (c) => LIBRARY_CATS.indexOf(c);
/** Every day the admin can pick, grouped by category and then in calendar order (Tishrei first). */
export const LIBRARY = Object.freeze([...fromStarters, ...extras]
  .sort((a, b) => catIndex(a.cat) - catIndex(b.cat) || calendarIndex(a.rule) - calendarIndex(b.rule) || a.en.localeCompare(b.en))
  .map((e) => Object.freeze({ ...e, category: CAT_TO_CATEGORY[e.cat], rule: Object.freeze({ ...e.rule }), find: Object.freeze([...e.find]) })));

const BY_KEY = new Map(LIBRARY.map((e) => [e.key, e]));
export const libraryEntry = (key) => BY_KEY.get(key) || null;

/** The occasion an entry makes when it is added (the fields the add route takes; on, no explanation). */
export function libraryDraft(entry) {
  const e = typeof entry === 'string' ? BY_KEY.get(entry) : entry;
  if (!e) return null;
  return {
    on: true, nameEn: e.en, nameHe: e.he, rule: { ...e.rule }, repeat: 'yearly', days: e.days || 1, beginsAt: e.beginsAt || 'default',
    zeroKey: e.zero, style: e.style, celebrate: e.celebrate !== false, shabbos: e.shabbos || 'stay', category: e.category,
  };
}

const sameMonth = (a, b) => a === b || (a === 13 && b === 12) || (a === 12 && b === 13);
const sameRule = (a, b) => a && b && a.kind === b.kind && (a.month === b.month) && (a.day || 0) === (b.day || 0);
/** Is this entry already on the list (same starter, or the same date rule lasting the same days)? */
export function libraryHas(occasions, entry) {
  const list = Array.isArray(occasions) ? occasions : occasions?.occasions || [];
  return list.some((o) => o.starter === entry.key || (o.kind !== 'countup' && sameRule(o.rule, entry.rule) && (o.days || 1) === (entry.days || 1)));
}

const fold = (s) => String(s ?? '').normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/[״"”“׳'’‘`]/g, '').replace(/[-–—_/.,;:()&]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const MONTH_WORDS = ['', 'nissan nisan', 'iyar iyyar', 'sivan', 'tammuz tamuz', 'av', 'elul', 'tishrei tishri', 'cheshvan heshvan marcheshvan', 'kislev', 'teves tevet', 'shvat shevat', 'adar', 'adar sheni adar ii'];
const MONTH_HE = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב'];
const haystack = (e) => fold([e.en, e.he, ...e.find, e.rule.kind === 'gregorian' ? '' : `${e.rule.day || ''} ${MONTH_WORDS[e.rule.month] || ''} ${MONTH_HE[e.rule.month] || ''}`].join(' '));
const HAY = new Map(LIBRARY.map((e) => [e.key, haystack(e)]));

/**
 * The entries that match what was typed ('kis', 'yud', 'chanukah', '19 kislev', 'rosh chodesh teves'). Every typed word must be
 * inside the entry's name, its alternative spellings or its month; a typed date ('19 Kislev') also finds the entry on that date.
 * An empty query returns everything (in library order).
 */
export function searchLibrary(query, { todayISO } = {}) {
  const q = fold(query);
  if (!q) return [...LIBRARY];
  const words = q.split(' ').filter(Boolean);
  const parsed = parseDateText(query, { todayISO });
  return LIBRARY.filter((e) => {
    const h = HAY.get(e.key);
    if (words.every((w) => h.includes(w))) return true;
    if (parsed && parsed.kind === e.rule.kind && parsed.kind !== 'gregorian' && sameMonth(parsed.month, e.rule.month) && (parsed.day || 0) === (e.rule.day || 0)) return true;
    return false;
  });
}

/** The library as { cat, label, entries } blocks (empty blocks left out). */
export function libraryGroups(entries = LIBRARY) {
  return LIBRARY_CATS.map((cat) => ({ cat, label: LIBRARY_CAT_LABEL[cat], entries: entries.filter((e) => e.cat === cat) })).filter((g) => g.entries.length);
}
