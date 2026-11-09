/**
 * 'Type it' for an occasion's date (admin > Screen > Occasions): turns what a person types into a date rule.
 *   '19 Kislev', 'Yud Tes Kislev', 'י״ט כסלו', 'Rosh Chodesh Teves', 'Tu BiShvat', 'Nov 29', '29 November 2026'
 * Pure (no DOM, no storage). Returns null when the text is not a date it understands: never a guess.
 *
 *   parseDateText(text, { todayISO? }) -> null | {
 *     kind:  'hebrew' | 'roshChodesh' | 'gregorian'
 *     month: hebrew 1-13 (Torah order: 1 Nissan ... 7 Tishrei ... 12 Adar / Adar I, 13 Adar II); roshChodesh 0 (no month said)
 *            or 1-13; gregorian 1-12
 *     day:   1-30 (hebrew) / 1-31 (gregorian); absent for roshChodesh
 *     adar?: 'adar1' | 'adar2'   only when Adar I / Adar Rishon was typed (hebrew)
 *     year?: a year that was typed (civil for gregorian, Hebrew for the others)
 *     name:  { en, he }          a suggested name ('Yud-Tes Kislev' / 'י״ט כסלו')
 *   }
 * `todayISO` only serves the words 'today' / 'tomorrow' (gregorian).
 */
import { gematria, addDaysISO } from './hebrewCalendar.js';

const MONTH_EN = ['', 'Nissan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul', 'Tishrei', 'Cheshvan', 'Kislev', 'Teves', 'Shvat', 'Adar', 'Adar II'];
const MONTH_HE = ['', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳'];

/** English spelling -> Hebrew month number (Torah order). Spaces and hyphens are already out when these are looked up. */
const HEB_MONTH = new Map(Object.entries({
  nissan: 1, nisan: 1, nison: 1, nissen: 1,
  iyar: 2, iyyar: 2, iyor: 2, iyer: 2, ayar: 2,
  sivan: 3, sivon: 3, siwan: 3,
  tamuz: 4, tammuz: 4, tamus: 4, tamuuz: 4,
  av: 5,
  elul: 6, ellul: 6,
  tishrei: 7, tishri: 7, tishrey: 7, tishre: 7, tishrai: 7, tishry: 7,
  cheshvan: 8, heshvan: 8, marcheshvan: 8, marheshvan: 8, cheshwan: 8, heshwan: 8, marchesvan: 8, chesvan: 8, cheshvon: 8,
  kislev: 9, kislew: 9, kislef: 9, kislov: 9,
  teves: 10, tevet: 10, teveth: 10, tevess: 10, tebet: 10, tevus: 10, teves10: 10,
  shvat: 11, shevat: 11, shevet: 11, shvet: 11, shebat: 11, shvatt: 11,
  adar: 12,
  // Hebrew
  'ניסן': 1, 'אייר': 2, 'איר': 2, 'סיון': 3, 'סיוון': 3, 'תמוז': 4, 'אב': 5, 'אלול': 6, 'תשרי': 7,
  'חשון': 8, 'חשוון': 8, 'מרחשון': 8, 'מרחשוון': 8, 'כסלו': 9, 'כסליו': 9, 'טבת': 10, 'שבט': 11, 'אדר': 12,
}));
const GREG_MONTH = new Map(Object.entries({
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
}));
const GREG_LEN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Names of the days of the Hebrew month as people say them (the Chabad calendar's own names). */
const DAY_EN = ['', 'Alef', 'Beis', 'Gimmel', 'Daled', 'Hey', 'Vov', 'Zayin', 'Ches', 'Tes', 'Yud', 'Yud-Alef', 'Yud-Beis', 'Yud-Gimmel', 'Yud-Daled', 'Tu', 'Tes-Zayin',
  'Yud-Zayin', 'Chai', 'Yud-Tes', 'Chof', 'Chof-Alef', 'Chof-Beis', 'Chof-Gimmel', 'Chof-Daled', 'Chof-Hey', 'Chof-Vov', 'Chof-Zayin', 'Chof-Ches', 'Chof-Tes', 'Lamed'];
export const dayNameEn = (d) => DAY_EN[d] || String(d);

const ONES = new Map(Object.entries({
  alef: 1, aleph: 1, beis: 2, bais: 2, bet: 2, beit: 2, beth: 2, gimmel: 3, gimel: 3, daled: 4, dalet: 4,
  hey: 5, heh: 5, he: 5, vav: 6, vov: 6, vuv: 6, zayin: 7, zain: 7, zayen: 7, ches: 8, chet: 8, het: 8, cheis: 8, tes: 9, tet: 9, teth: 9,
}));
const TENS = new Map(Object.entries({ yud: 10, yod: 10, yood: 10, chof: 20, kof: 20, kaf: 20, chaf: 20, khof: 20, lamed: 30 }));
const SPECIAL = new Map(Object.entries({ tu: 15, chai: 18 }));

const HEB_LETTER = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30 };
const NOISE = new Set(['of', 'the', 'on', 'in', 'at', 'day', 'yom', 'date', 'hebrew', 'menachem', 'מנחם', 'b', 'bi', 'be', 'ba', 'ביום', 'יום']);

const clean = (s) => String(s ?? '')
  .normalize('NFC')
  .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
  .replace(/[״"”“׳'’‘`]/g, '') // gershayim, geresh, quotes (so י״ט = יט and B'Av = bav)
  .replace(/[-–—_/.,;:()]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** A month word, allowing the 'in' prefix people attach (BiShvat, B'Av, בשבט, באב). null when it is not a month. */
function monthOf(tok) {
  if (HEB_MONTH.has(tok)) return { m: HEB_MONTH.get(tok), kind: 'heb' };
  for (const p of ['bi', 'be', 'ba', 'b', 'ב']) {
    if (tok.length > p.length + 1 && tok.startsWith(p)) { const r = tok.slice(p.length); if (HEB_MONTH.has(r) && r !== 'av') return { m: HEB_MONTH.get(r), kind: 'heb' }; }
  }
  // 'B'Av' -> 'bav', 'Ba'Av' -> 'baav', 'באב'
  if (tok === 'bav' || tok === 'baav' || tok === 'beav' || tok === 'באב') return { m: 5, kind: 'heb' };
  if (GREG_MONTH.has(tok)) return { m: GREG_MONTH.get(tok), kind: 'greg' };
  return null;
}

/** A day from a Hebrew-letter numeral (י״ט / יט / טו / ל), or null. Hundreds are not a day (they are the year). */
function hebrewNumeral(tok) {
  if (tok === 'יוד') return 10;
  if (!/^[א-ת]{1,2}$/.test(tok)) return null;
  let sum = 0;
  for (const ch of tok) { const v = HEB_LETTER[ch]; if (!v) return null; sum += v; }
  return sum >= 1 && sum <= 30 ? sum : null;
}

/** A day from one or two letter names ('yud tes', 'tu', 'chof hey', 'tes vav'); null when it is not a valid day. */
function letterDay(words) {
  if (!words.length || words.length > 2) return null;
  const vals = [];
  for (const w of words) {
    if (SPECIAL.has(w)) vals.push({ v: SPECIAL.get(w), t: 'special' });
    else if (TENS.has(w)) vals.push({ v: TENS.get(w), t: 'tens' });
    else if (ONES.has(w)) vals.push({ v: ONES.get(w), t: 'ones' });
    else return null;
  }
  if (vals.length === 1) return vals[0].v;
  const [a, b] = vals;
  if (a.t === 'tens' && b.t === 'ones' && a.v !== 30) return a.v + b.v;
  if (a.t === 'ones' && b.t === 'ones' && a.v === 9 && (b.v === 6 || b.v === 7)) return a.v + b.v; // tes-vav 15, tes-zayin 16
  return null;
}

const isLetterWord = (w) => SPECIAL.has(w) || TENS.has(w) || ONES.has(w);

/**
 * @param {string} text
 * @param {{ todayISO?: string }} [opts]
 */
export function parseDateText(text, { todayISO } = {}) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 80) return null;
  // 2026-11-29
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return gregorian(Number(iso[2]), Number(iso[3]), Number(iso[1]));
  let toks = clean(raw).split(' ').filter(Boolean);
  if (!toks.length) return null;

  // today / tomorrow / היום / מחר
  if (toks.length === 1 && todayISO && /^\d{4}-\d{2}-\d{2}$/.test(todayISO)) {
    const t = { today: 0, tomorrow: 1, היום: 0, מחר: 1 }[toks[0]];
    if (t !== undefined) { const d = addDaysISO(todayISO, t); return gregorian(Number(d.slice(5, 7)), Number(d.slice(8, 10)), Number(d.slice(0, 4))); }
  }

  // Rosh Chodesh (rosh chodesh / rosh codesh / rc / ראש חודש / רח)
  let rc = false;
  const rest = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if ((t === 'rosh' || t === 'ראש') && (toks[i + 1] === 'chodesh' || toks[i + 1] === 'codesh' || toks[i + 1] === 'chodes' || toks[i + 1] === 'hodesh' || toks[i + 1] === 'חודש')) { rc = true; i++; continue; }
    if (t === 'rc' || t === 'רח') { rc = true; continue; }
    rest.push(t);
  }
  toks = rest;

  // 'mar cheshvan' -> cheshvan (March is not a month here)
  toks = toks.filter((t, i) => !(t === 'mar' && /^(?:ch|h)es/.test(toks[i + 1] || '')));

  let month = null; let gm = null; let adar = null; let year = null; const dayParts = [];
  let numberDay = null; let hebDay = null;
  const words = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (NOISE.has(t)) continue;
    const mo = monthOf(t);
    if (mo) {
      if (mo.kind === 'greg') { if (gm != null || month != null) return null; gm = mo.m; continue; }
      if (month != null || gm != null) return null;
      month = mo.m;
      if (month === 12) {
        // Adar I / II / Rishon / Sheni / Alef / Beis: the next word, when it says which Adar
        const nx = toks[i + 1];
        const first = ['1', 'i', 'rishon', 'alef', 'aleph', 'a', 'ראשון', 'א'];
        const second = ['2', 'ii', 'sheni', 'beis', 'bais', 'bet', 'beit', 'b', 'שני', 'ב'];
        const numeric = nx === '1' || nx === '2';
        // '1' / '2' right after Adar is the Adar number only when a day was already said ('14 Adar 2'); else it is the day ('Adar 2')
        const hasDayBefore = numberDay != null || hebDay != null || words.length > 0;
        if (nx != null && (first.includes(nx) || second.includes(nx)) && (!numeric || hasDayBefore)) {
          if (first.includes(nx)) adar = 'adar1'; else month = 13;
          i++;
        }
      }
      continue;
    }
    // a year
    if (/^\d{4}$/.test(t)) { const y = Number(t); if (year != null) return null; if ((y >= 2000 && y <= 2200) || (y >= 5700 && y <= 5999)) { year = y; continue; } return null; }
    if (/^\d{1,2}(?:st|nd|rd|th)?$/.test(t)) { if (numberDay != null || hebDay != null) return null; numberDay = Number(t.replace(/\D/g, '')); continue; }
    if (/^[א-ת]+$/.test(t)) {
      const n = hebrewNumeral(t);
      if (n != null) { if (numberDay != null || hebDay != null) return null; hebDay = n; continue; }
      if (/[קרשת]/.test(t) && t.length >= 3) { continue; } // a Hebrew year (תשפז): ignored
      return null;
    }
    if (isLetterWord(t)) { words.push(t); continue; }
    return null; // a word we do not know
  }

  let letters = null;
  if (words.length) {
    letters = letterDay(words);
    if (letters == null) return null;
    if (numberDay != null || hebDay != null) return null;
  }
  const dayHeb = hebDay ?? letters;
  const day = numberDay ?? dayHeb;

  // civil date
  if (gm != null) {
    if (rc || dayHeb != null && numberDay == null) return null;
    if (day == null) return null;
    return gregorian(gm, day, year != null && year >= 2000 ? year : null);
  }
  if (rc) {
    if (day != null) return null;
    const m = month == null ? 0 : month;
    const leapName = adar === 'adar1' ? 'Adar I' : MONTH_EN[m];
    const he = m === 0 ? 'ראש חודש' : `ראש חודש ${adar === 'adar1' ? 'אדר א׳' : MONTH_HE[m]}`;
    const out = { kind: 'roshChodesh', month: m, name: { en: m === 0 ? 'Rosh Chodesh' : `Rosh Chodesh ${leapName}`, he } };
    if (adar) out.adar = adar;
    if (year != null && year >= 5700) out.year = year;
    return out;
  }
  if (month == null || day == null) return null;
  if (!Number.isInteger(day) || day < 1 || day > 30) return null;
  if (year != null && year < 5700) return null; // a civil year with a Hebrew month is not a date
  const out = {
    kind: 'hebrew', month, day,
    name: { en: `${dayNameEn(day)} ${adar === 'adar1' ? 'Adar I' : MONTH_EN[month]}`, he: `${gematria(day)} ${adar === 'adar1' ? 'אדר א׳' : MONTH_HE[month]}` },
  };
  if (adar) out.adar = adar;
  if (year != null) out.year = year;
  return out;
}

function gregorian(month, day, year) {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > GREG_LEN[month - 1]) return null;
  if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2200)) return null;
  if (year != null && month === 2 && day === 29 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) return null;
  const label = new Date(Date.UTC(2000, month - 1, day)).toLocaleString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  const out = { kind: 'gregorian', month, day, name: { en: label, he: '' } };
  if (year != null) out.year = year;
  return out;
}
