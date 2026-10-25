/**
 * Builds a data pack (format: src/shared/dataPack.js) from sections someone has
 * ALREADY collected. Pure: no files, no network. `scripts/build-data-pack.js`
 * does the reading/writing around it. The builder never fetches text itself and
 * refuses a section that has no licence note, so nothing licensed can get into a
 * pack by accident (see docs/DATA-PACK-PLAN.md, section 7).
 */
import { createHash } from 'crypto';
import {
  PACK_FORMAT, PACK_SECTIONS_DAY, PACK_SECTIONS_PERPETUAL, validateDaysFile, validatePerpetual, hayomYomLookup, perpetualKey,
} from './dataPack.js';
import { hebrewDateOf, addDaysISO, monthsInYear, daysInMonth, hebrewFromFixed, fixedFromISO, monthNameEn } from './hebrewCalendar.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

export function dateRange(from, to) {
  const out = [];
  for (let d = from, n = 0; d <= to && n < 2000; d = addDaysISO(d, 1), n++) out.push(d);
  return out;
}

/** Every Hebrew (month, day) that occurs between two civil dates, as perpetual keys, in calendar order. */
export function hebrewDaysIn(from, to) {
  const seen = new Set();
  for (const iso of dateRange(from, to)) {
    const h = hebrewDateOf(iso);
    seen.add(perpetualKey(h.hebrewMonth, h.hebrewDay));
  }
  return [...seen];
}

/**
 * @param {object} p
 * @param {string} p.from 'YYYY-MM-DD'  first civil day to cover
 * @param {string} p.to   'YYYY-MM-DD'  last civil day (>= 14 months ahead is the plan)
 * @param {object} [p.perpetual]  { hayomYom: { 'Tishrei-1': {en,he}|null } }
 * @param {object} [p.days]       { 'YYYY-MM-DD': { chumash, tehillim, tanya, rambam1, rambam3, seferHamitzvot } }
 * @param {object} p.sources  { sectionName: { source: 'where it came from', licence: 'who allows it / terms', note? } }
 * @param {string} [p.built]  ISO timestamp
 * @returns {{ files: Record<string,string>, manifest: object, report: object, errors: string[] }}
 */
export function buildPack({ from, to, perpetual = {}, days = {}, sources = {}, built = new Date().toISOString() }) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) errors.push('from/to must be YYYY-MM-DD with from <= to');
  const range = errors.length ? [] : dateRange(from, to);

  // which sections are present at all
  const present = new Set();
  const perp = { format: PACK_FORMAT };
  if (perpetual.hayomYom) { perp.hayomYom = perpetual.hayomYom; present.add('hayomYom'); }
  const monthsOut = new Map();
  for (const iso of range) {
    const rec = days[iso];
    if (!rec) continue;
    const clean = {};
    for (const sec of PACK_SECTIONS_DAY) if (rec[sec]) { clean[sec] = rec[sec]; present.add(sec); }
    if (Object.keys(clean).length) {
      const ym = iso.slice(0, 7);
      if (!monthsOut.has(ym)) monthsOut.set(ym, { format: PACK_FORMAT, month: ym, days: {} });
      monthsOut.get(ym).days[iso] = clean;
    }
  }

  for (const sec of present) {
    const s = sources[sec];
    if (!s || !String(s.source || '').trim() || !String(s.licence || '').trim()) errors.push(`section ${sec}: say where it came from and under what licence (sources.${sec}.source / .licence)`);
  }
  if (perp.hayomYom) errors.push(...validatePerpetual(perp).map((e) => `perpetual: ${e}`));
  for (const f of monthsOut.values()) errors.push(...validateDaysFile(f).map((e) => `days-${f.month}: ${e}`));

  // coverage report (what a reader of the plan wants to know before shipping)
  const report = { civilDays: range.length, sections: {}, hayomYom: null, notes: [] };
  for (const sec of PACK_SECTIONS_DAY) {
    const have = range.filter((iso) => days[iso]?.[sec]).length;
    if (present.has(sec)) report.sections[sec] = { have, of: range.length, missing: range.length - have };
  }
  if (perp.hayomYom) {
    let ok = 0, none = 0;
    const missingDays = [];
    for (const iso of range) {
      const h = hebrewDateOf(iso);
      const v = hayomYomLookup(perp, h.hebrewMonth, h.hebrewDay);
      if (v === undefined) missingDays.push(iso); else if (v === null) none++; else ok++;
    }
    report.hayomYom = { text: ok, noEntry: none, missing: missingDays.length, missingFirst: missingDays.slice(0, 10) };
    const keys = hebrewDaysIn(from, to);
    report.hayomYom.hebrewDaysNeeded = keys.length;
    report.hayomYom.hebrewDaysMissing = keys.filter((k) => hayomYomLookup(perp, k.replace(/-\d+$/, ''), +k.split('-').pop()) === undefined);
    if (report.hayomYom.missing) report.notes.push(`${report.hayomYom.missing} civil days have no Hayom Yom in this pack (kept as 'not in pack', the screen keeps its last text)`);
  }

  const files = {};
  if (perp.hayomYom) files['perpetual.json'] = JSON.stringify(perp);
  for (const [ym, f] of [...monthsOut.entries()].sort()) files[`days-${ym}.json`] = JSON.stringify(f);

  const manifest = {
    format: PACK_FORMAT, built, from, to,
    sections: Object.fromEntries([...present].map((s) => [s, sources[s] || {}])),
    files: Object.fromEntries(Object.entries(files).map(([n, c]) => [n, { bytes: Buffer.byteLength(c), sha256: sha(c) }])),
  };
  files['manifest.json'] = JSON.stringify(manifest, null, 1);
  return { files, manifest, report, errors };
}

/** Months of the Hebrew years that overlap a civil range, with their lengths (for the special-year report). */
export function hebrewMonthsIn(from, to) {
  const out = [];
  const seen = new Set();
  for (const iso of dateRange(from, to)) {
    const h = hebrewFromFixed(fixedFromISO(iso));
    const k = `${h.y}-${h.m}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ year: h.y, month: monthNameEn(h.m, h.leap), days: daysInMonth(h.y, h.m), leapYear: monthsInYear(h.y) === 13 });
  }
  return out;
}

export { PACK_SECTIONS_PERPETUAL };
