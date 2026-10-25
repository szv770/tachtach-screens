/**
 * Builds a data pack (format: src/shared/dataPack.js) from sections someone has
 * ALREADY collected. Pure: no files, no network. `scripts/build-data-pack.js`
 * does the reading/writing around it. The builder never fetches text itself and
 * refuses a section that has no licence note, so nothing licensed can get into a
 * pack by accident (see docs/DATA-PACK-PLAN.md, section 7).
 */
import { createHash } from 'crypto';
import {
  PACK_FORMAT, PACK_SECTIONS_DAY, PACK_SECTIONS_PERPETUAL, PACK_SECTIONS_WEEKLY, PACK_CREDIT, PACK_LICENCE_NOTE,
  validateDaysFile, validatePerpetual, validateWeekly, hayomYomLookup, perpetualKey, shabbosOnOrAfter,
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

/** ['2026-10-01','2026-10-02','2026-10-05'] -> [['2026-10-01','2026-10-02'],['2026-10-05','2026-10-05']] (consecutive civil days merged). */
export function compressRanges(isos) {
  const out = [];
  for (const iso of [...isos].sort()) {
    const last = out.at(-1);
    if (last && addDaysISO(last[1], 1) === iso) last[1] = iso; else out.push([iso, iso]);
  }
  return out;
}

/**
 * @param {object} p
 * @param {string} p.from 'YYYY-MM-DD'  first civil day to cover
 * @param {string} p.to   'YYYY-MM-DD'  last civil day (>= 14 months ahead is the plan)
 * @param {object} [p.perpetual]  { hayomYom: { 'Tishrei-1': {en,he}|null }, quotePool?: [{text,source}] }
 * @param {object} [p.weekly]     { tidbits: { '<Shabbos ISO>': { items: [{title,description,link}] } } }
 * @param {object} [p.days]       { 'YYYY-MM-DD': { chumash, tehillim, tanya, rambam1, rambam3, seferHamitzvot } }
 * @param {object} p.sources  { sectionName: { source: 'where it came from', licence: 'who allows it / terms', note? } }
 * @param {string} [p.built]  ISO timestamp
 * @returns {{ files: Record<string,string>, manifest: object, report: object, errors: string[] }}
 */
export function buildPack({ from, to, perpetual = {}, weekly = {}, days = {}, sources = {}, built = new Date().toISOString() }) {
  const errors = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || from > to) errors.push('from/to must be YYYY-MM-DD with from <= to');
  const range = errors.length ? [] : dateRange(from, to);

  // which sections are present at all
  const present = new Set();
  const perp = { format: PACK_FORMAT };
  if (perpetual.hayomYom) { perp.hayomYom = perpetual.hayomYom; present.add('hayomYom'); }
  if (perpetual.quotePool?.length) { perp.quotePool = perpetual.quotePool; present.add('dailyQuote'); }
  const week = { format: PACK_FORMAT };
  if (weekly.tidbits && Object.keys(weekly.tidbits).length) {
    // only the weeks that matter for the range (a Shabbos on or after `from`, up to the one that ends the last week)
    const lo = shabbosOnOrAfter(from || '2000-01-01'), hi = shabbosOnOrAfter(to || '2000-01-01');
    week.tidbits = Object.fromEntries(Object.entries(weekly.tidbits).filter(([k]) => k >= lo && k <= hi).sort());
    if (Object.keys(week.tidbits).length) present.add('tidbits');
  }
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
  if (perp.hayomYom || perp.quotePool) errors.push(...validatePerpetual(perp).map((e) => `perpetual: ${e}`));
  if (week.tidbits) errors.push(...validateWeekly(week).map((e) => `weekly: ${e}`));
  for (const f of monthsOut.values()) errors.push(...validateDaysFile(f).map((e) => `days-${f.month}: ${e}`));

  // coverage report (what a reader of the plan wants to know before shipping)
  const report = { civilDays: range.length, sections: {}, hayomYom: null, notes: [] };
  for (const sec of PACK_SECTIONS_DAY) {
    const have = range.filter((iso) => days[iso]?.[sec]).length;
    if (present.has(sec)) {
      const missingDays = range.filter((iso) => !days[iso]?.[sec]);
      // Psalm 119 days are the only days Tehillim comes from the pack, and a day with a pooled quote is covered
      report.sections[sec] = { have, of: range.length, missing: range.length - have, missingRanges: compressRanges(missingDays).slice(0, 40) };
      if (sec === 'dailyQuote' && perp.quotePool?.length) report.sections[sec].pooled = missingDays.length;
    }
  }
  if (week.tidbits) {
    const weeks = [...new Set(range.map((iso) => shabbosOnOrAfter(iso)))];
    const lack = weeks.filter((w) => !week.tidbits[w]);
    report.sections.tidbits = { have: weeks.length - lack.length, of: weeks.length, missing: lack.length, missingRanges: lack.slice(0, 40).map((w) => [w, w]), unit: 'weeks' };
  }
  if (perp.hayomYom) {
    let ok = 0, none = 0;
    const missingDays = [];
    for (const iso of range) {
      const h = hebrewDateOf(iso);
      const v = hayomYomLookup(perp, h.hebrewMonth, h.hebrewDay);
      if (v === undefined) missingDays.push(iso); else if (v === null) none++; else ok++;
    }
    report.hayomYom = { text: ok, noEntry: none, missing: missingDays.length, missingFirst: missingDays.slice(0, 10), missingRanges: compressRanges(missingDays).slice(0, 40) };
    const keys = hebrewDaysIn(from, to);
    report.hayomYom.hebrewDaysNeeded = keys.length;
    report.hayomYom.hebrewDaysMissing = keys.filter((k) => hayomYomLookup(perp, k.replace(/-\d+$/, ''), +k.split('-').pop()) === undefined);
    if (report.hayomYom.missing) report.notes.push(`${report.hayomYom.missing} civil days have no Hayom Yom in this pack (kept as 'not in pack', the screen keeps its last text)`);
  }

  const files = {};
  if (perp.hayomYom || perp.quotePool) files['perpetual.json'] = JSON.stringify(perp);
  if (week.tidbits) files['weekly.json'] = JSON.stringify(week);
  for (const [ym, f] of [...monthsOut.entries()].sort()) files[`days-${ym}.json`] = JSON.stringify(f);

  const noteSet = [...new Set([...present].map((s) => sources[s]?.licence).filter(Boolean))];
  const manifest = {
    format: PACK_FORMAT, built, from, to,
    credit: PACK_CREDIT,                                  // shown on the kiosk as 'Courtesy of <credit>'
    licence: noteSet.length === 1 ? noteSet[0] : (noteSet.join(' | ') || PACK_LICENCE_NOTE),
    sections: Object.fromEntries([...present].map((s) => [s, sources[s] || {}])),
    coverage: { civilDays: report.civilDays, sections: report.sections, hayomYom: report.hayomYom },   // which dates are missing, for the Health card
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

const NAME_OK = /^(manifest|perpetual|weekly)\.json$|^days-\d{4}-\d{2}\.json$/;
export const packFileNameOk = (n) => NAME_OK.test(String(n));

/**
 * Check a whole pack that is held as { 'manifest.json': '<text>', ... } (an upload, or a freshly built one):
 * names on the allow-list, valid JSON, checksums equal the manifest's, every file passes its validator.
 * @returns {{ ok: boolean, errors: string[], manifest: object|null }}
 */
export function verifyPackFiles(files) {
  const errors = [];
  const names = Object.keys(files || {});
  for (const n of names) if (!packFileNameOk(n) || typeof files[n] !== 'string') errors.push(`unexpected file ${String(n).slice(0, 40)}`);
  if (errors.length) return { ok: false, errors, manifest: null };
  let manifest;
  try { manifest = JSON.parse(files['manifest.json']); } catch { return { ok: false, errors: ['manifest.json is missing or not valid JSON'], manifest: null }; }
  if (manifest?.format !== PACK_FORMAT) return { ok: false, errors: [`manifest format must be ${PACK_FORMAT}`], manifest: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.to || '') || manifest.from > manifest.to) errors.push('manifest from/to are not valid dates');
  const listed = manifest.files || {};
  for (const n of names) if (n !== 'manifest.json' && !listed[n]) errors.push(`${n} is not listed in the manifest`);
  for (const [n, info] of Object.entries(listed)) {
    if (!packFileNameOk(n) || n === 'manifest.json') { errors.push(`manifest lists ${String(n).slice(0, 40)}`); continue; }
    if (typeof files[n] !== 'string') { errors.push(`${n} is missing`); continue; }
    if (sha(files[n]) !== info.sha256) { errors.push(`${n}: checksum does not match`); continue; }
    let j; try { j = JSON.parse(files[n]); } catch { errors.push(`${n}: not valid JSON`); continue; }
    const errs = n === 'perpetual.json' ? validatePerpetual(j) : n === 'weekly.json' ? validateWeekly(j) : validateDaysFile(j);
    errors.push(...errs.slice(0, 3).map((e) => `${n}: ${e}`));
  }
  return { ok: !errors.length, errors: errors.slice(0, 12), manifest: errors.length ? null : manifest };
}

/** A pack as ONE file (what the Health card uploads/downloads): {format, kind, files:{name: text}}. */
export const bundlePack = (files) => JSON.stringify({ format: PACK_FORMAT, kind: 'tachtach-data-pack', files });
export function unbundlePack(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { files: null, error: 'That file is not a data pack (not valid JSON).' }; }
  if (!j || j.kind !== 'tachtach-data-pack' || j.format !== PACK_FORMAT || !j.files || typeof j.files !== 'object') return { files: null, error: 'That file is not a TachTach data pack.' };
  return { files: j.files, error: null };
}

export { PACK_SECTIONS_PERPETUAL, PACK_SECTIONS_WEEKLY };
