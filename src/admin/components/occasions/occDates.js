// Pure helpers for the dates part of the Occasions admin (tested in test/occasionsDates.test.js). No React, no DOM.
// The words are plain English on purpose: the countdown reaches zero when the day BEGINS, which is usually the EVENING BEFORE the
// day, so every line names 'the day' and 'begins' separately.
import {
  shareText, weekShareText, occurrencesBetween, upcoming, normalizeOccasion, hebrewWords, daysUntil, explainState, timeEn, MONTH_EN, ruleWords,
} from '../../../shared/occasions.js';
import { fixedFromISO, hebrewFromFixed, isLeapYear, addDaysISO, ADAR, ADAR_II } from '../../../shared/hebrewCalendar.js';

const f = new Map();
const fmt = (opts) => { const k = JSON.stringify(opts); let x = f.get(k); if (!x) { x = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }); f.set(k, x); } return x; };
const at = (iso) => new Date(`${iso}T12:00:00Z`);
/** 'Sunday, Nov 29, 2026' */
export const fmtLong = (iso) => fmt({ weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(at(iso));
/** 'Sun, Nov 29' */
export const fmtShort = (iso) => fmt({ weekday: 'short', month: 'short', day: 'numeric' }).format(at(iso));
/** 'Nov 29' */
export const fmtMD = (iso) => fmt({ month: 'short', day: 'numeric' }).format(at(iso));
/** 'Sat' */
export const fmtWeekday = (iso) => fmt({ weekday: 'short' }).format(at(iso));
/** 'November 2026' */
export const fmtMonthYear = (iso) => fmt({ month: 'long', year: 'numeric' }).format(at(iso));

export const daysFrom = (todayISO, iso) => fixedFromISO(iso) - fixedFromISO(todayISO);
/** 'today' / 'tomorrow' / 'in 21 days' */
export const inDaysText = (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

/** '19 Kislev' (no year) for a civil date. */
export const hebrewDayMonth = (iso) => hebrewWords(iso).en.replace(/ \d+$/, '');

/**
 * The Hebrew date of a civil day as a rule the picker can store: { rule, adar, words }.
 * In a leap year Adar I is month 12 + adar 'adar1', Adar II is month 12 + adar 'adar2' (the same as month 13 in a plain year).
 */
export function hebrewRuleFromISO(iso) {
  const h = hebrewFromFixed(fixedFromISO(iso));
  let month = h.m; let adar = 'adar2';
  if (h.m === ADAR && h.leap) adar = 'adar1';
  if (h.m === ADAR_II) month = ADAR;
  return { rule: { kind: 'hebrew', month, day: h.d }, adar, words: hebrewWords(iso), leap: isLeapYear(h.y), year: h.y };
}

/** Does the draft hold a complete, valid date rule (for the live preview)? Returns the normalised occasion or null. */
export function draftOccasion(d) {
  try {
    return normalizeOccasion({ ...d, id: 'draft', on: true, nameEn: d.nameEn || 'x', rule: { ...d.rule, month: Number(d.rule.month), day: Number(d.rule.day) }, year: d.repeat === 'once' ? Number(d.year) : null, days: Number(d.days) || 1 });
  } catch { return null; }
}

/**
 * What a date rule gives, for the live lines under the date control:
 *   { hebrew: '19 Kislev', next: { startISO, long, inDays, inText, begin: {...}|null }, after: [{ year, startISO, short }] }
 * `ctxNow()` -> { now, ctx } as the panel builds it; `settings` = the document's settings (for when it begins).
 */
export function datePreview(d, settings, ctxNow) {
  const o = draftOccasion(d);
  if (!o) return null;
  const { now, ctx } = ctxNow();
  const today = ctx.today;
  const rows = upcoming({ version: 1, settings, occasions: [o] }, now, ctx, { horizonDays: 1500 });
  const first = rows[0];
  if (!first) return { hebrew: '', next: null, after: [] };
  const list = occurrencesBetween(o, addDaysISO(first.startISO, 1), addDaysISO(today, 366 * 7));
  const after = o.repeat === 'once' ? [] : list.slice(0, 3).map((r) => ({ year: Number(r.startISO.slice(0, 4)), startISO: r.startISO, short: fmtShort(r.startISO), name: r.nameEn || '' }));
  const n = daysFrom(today, first.startISO);
  return {
    hebrew: hebrewDayMonth(first.startISO),
    next: { startISO: first.startISO, long: fmtLong(first.startISO), inDays: n, inText: inDaysText(n), days: first.days, lastISO: first.lastISO, name: first.generic ? first.nameEn : '', beginsText: beginsText(first, ctx.tz), row: first },
    after,
  };
}

/** 'Sat evening (Nov 28) · 4:28 PM' / 'Sun, Nov 29 (start of the day)' / 'Sun, Nov 29, 6:00 PM'. */
export function beginsText(row, tz) {
  const b = row.begin; const tl = b.exact ? '' : '~';
  const t = `${tl}${timeEn(b.ms, tz)}`;
  if (b.at === 'midnight') return `${fmtShort(b.dateISO)} (start of the day)`;
  if (b.at === 'time') return `${b.evening ? `${fmtWeekday(b.dateISO)} evening (${fmtMD(b.dateISO)})` : fmtShort(b.dateISO)} · ${t}`;
  return `${fmtWeekday(b.dateISO)} evening (${fmtMD(b.dateISO)}) · ${t}`;
}

/** The words of one timeline row: { dayLine, beginsLine, rangeLine|null, inLine, inSub } (see the panel). */
export function rowTexts(row, today, tz) {
  const o = row.occasion;
  const heb = hebrewDayMonth(row.startISO);
  const multi = row.days > 1;
  const d = daysUntil(row, today);
  let inLine; let inSub = 'until it begins';
  if (row.running) { inLine = 'On now'; inSub = ''; } else if (d <= 0) inLine = row.begin.evening ? 'Tonight' : 'Today';
  else if (d === 1) inLine = row.begin.evening ? 'Tomorrow evening' : 'Tomorrow';
  else inLine = `In ${d} days`;
  const countup = o.kind === 'countup';
  return {
    dayLine: `${multi ? 'The days' : 'The day'}: ${fmtShort(row.startISO)} · ${heb}${multi ? ` · ${row.days} days` : ''}`,
    beginsLine: `Begins: ${beginsText(row, tz)}`,
    rangeLine: multi ? `${fmtMD(row.begin.dateISO)}${row.begin.evening ? ' evening' : ''} – ${fmtMD(row.lastISO)}` : null,
    inLine: countup && !row.running ? `${inLine}` : inLine,
    inSub,
    heb,
  };
}

/** Timeline rows grouped by the month their day is in: [{ key: '2026-11', label: 'November 2026', rows }], earliest first. */
export function groupByMonth(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.startISO.slice(0, 7);
    if (!map.has(key)) map.set(key, { key, label: fmtMonthYear(r.startISO), rows: [] });
    map.get(key).rows.push(r);
  }
  const out = [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const g of out) g.rows.sort((a, b) => a.begin.ms - b.begin.ms || (a.nameEn || '').localeCompare(b.nameEn || ''));
  return out;
}

/** The next 12 months from today as { key, label, short, count } (count = switched-on rows whose day is in that month). */
export function yearStrip(rows, todayISO) {
  const cells = [];
  let y = Number(todayISO.slice(0, 4)); let m = Number(todayISO.slice(5, 7));
  for (let i = 0; i < 12; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    cells.push({ key, label: fmtMonthYear(`${key}-15`), short: fmt({ month: 'short' }).format(at(`${key}-15`)), count: 0 });
    m++; if (m > 12) { m = 1; y++; }
  }
  const by = new Map(cells.map((c) => [c.key, c]));
  for (const r of rows) { if (r.occasion.on === false) continue; const c = by.get(r.startISO.slice(0, 7)); if (c) c.count++; }
  return cells;
}

const fold = (s) => String(s ?? '').normalize('NFC').replace(/[֑-ׇ]/g, '').replace(/[״"”“׳'’‘`]/g, '').replace(/[-–—_/.,;:()]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
export const FILTERS = Object.freeze(['all', 'on', 'off', 'needs']);
export const FILTER_LABEL = Object.freeze({ all: 'All', on: 'On', off: 'Off', needs: 'Needs an explanation' });
/** Does a row pass the search box and the filter chip? ('needs' = no explanation yet, or one that still needs checking.) */
export function rowMatches(row, { query = '', filter = 'all', category = 'all' } = {}) {
  const o = row.occasion;
  if (category !== 'all' && (o.category || 'custom') !== category) return false;
  if (filter === 'on' && !o.on) return false;
  if (filter === 'off' && o.on) return false;
  if (filter === 'needs' && (!o.on || explainState(o) === 'shows')) return false;
  const q = fold(query);
  if (!q) return true;
  const h = fold([row.nameEn, row.nameHe, o.nameEn, o.nameHe, hebrewWords(row.startISO).en, fmtLong(row.startISO), fmtMonthYear(row.startISO), ruleWords(o)].join(' '));
  return q.split(' ').every((w) => h.includes(w));
}

/**
 * The patch a typed date makes on the draft (see src/shared/occasionDateText.js): the rule, the Adar choice, a one-time year and,
 * when both names are still empty, a suggested name. `parsed` is parseDateText's result.
 */
export function typedPatch(d, parsed) {
  if (!parsed) return null;
  const patch = {};
  if (parsed.kind === 'gregorian') patch.rule = { kind: 'gregorian', month: parsed.month, day: parsed.day };
  else if (parsed.kind === 'roshChodesh') patch.rule = { kind: 'roshChodesh', month: parsed.month };
  else {
    // Adar II is 'Adar, the second one in a leap year' (the same date as month 13)
    patch.rule = { kind: 'hebrew', month: parsed.month === ADAR_II ? ADAR : parsed.month, day: parsed.day };
    if (parsed.month === ADAR_II) patch.adar = 'adar2'; else if (parsed.adar) patch.adar = parsed.adar;
  }
  if (parsed.kind === 'roshChodesh' && parsed.month === ADAR_II) patch.rule = { kind: 'roshChodesh', month: ADAR_II };
  if (parsed.year) { patch.repeat = 'once'; patch.year = parsed.year; } else if (d.repeat === 'once' && patch.year == null) { patch.repeat = 'yearly'; patch.year = ''; }
  if (!String(d.nameEn || '').trim() && !String(d.nameHe || '').trim() && parsed.name) { patch.nameEn = parsed.name.en; patch.nameHe = parsed.name.he; }
  return patch;
}

/** 'Understood: 19 Kislev' for a parsed date. */
export function parsedWords(p) {
  if (!p) return '';
  if (p.kind === 'gregorian') return `${p.name.en}${p.year ? `, ${p.year}` : ', every year'} (regular calendar)`;
  if (p.kind === 'roshChodesh') return p.month === 0 ? 'Rosh Chodesh, every month' : `Rosh Chodesh ${p.adar === 'adar1' ? 'Adar I' : MONTH_EN[p.month]}`;
  return `${p.day} ${p.adar === 'adar1' ? 'Adar I' : MONTH_EN[p.month]}${p.year ? ` ${p.year}` : ''} (Hebrew date)`;
}

/** The one line under 'Advanced' saying what is customised for this occasion. */
export function advancedSummary(d, settings) {
  const parts = [];
  if (d.look && Object.keys(d.look).length) parts.push('own look');
  if (d.display) parts.push(d.display === 'flip' ? 'flip clock' : 'classic numbers');
  if (d.layout && Object.keys(d.layout).length) parts.push('own layout');
  const hype = (d.milestoneOn != null ? 1 : 0) + (d.finalOn != null ? 1 : 0) + (Array.isArray(d.milestones) ? 1 : 0);
  if (hype) parts.push(`${hype} hype override${hype === 1 ? '' : 's'}`);
  const words = Object.keys(d.stageText || {}).length + Object.keys(d.milestoneText || {}).length;
  if (words) parts.push(`${words} own line${words === 1 ? '' : 's'} of words`);
  if (d.advent?.on) parts.push('advent calendar');
  if (Array.isArray(d.tapForms) || d.autoForms) parts.push('own countdown views');
  if (d.soundOn != null) parts.push(d.soundOn ? 'sound on' : 'sound off');
  if (d.touch === false) parts.push('no touch');
  return parts.join(' · ') || 'Everything follows the defaults';
}


/** The share language for the Language setting ('hebrew' -> 'he', 'english' -> 'en', 'both'). */
export const shareLang = (settings) => (settings?.language === 'hebrew' ? 'he' : settings?.language === 'english' ? 'en' : 'both');
/** The WhatsApp message for one row (see shareText in src/shared/occasions.js). */
export function shareFor(row, settings, ctxNow) {
  const { now, ctx } = ctxNow();
  return shareText(row, { lang: shareLang(settings), settings, now, tz: ctx.tz, today: ctx.today, emoji: !!settings.shareEmoji });
}
/** 'This week's days' as one message. */
export function weekShare(file, ctxNow) {
  const { now, ctx } = ctxNow();
  return weekShareText(file, now, ctx, { lang: shareLang(file.settings), emoji: !!file.settings.shareEmoji });
}
