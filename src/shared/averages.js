/**
 * Test Averages (a Gemoro / Limud test program): pure rules, shared by the server, the admin and the kiosk.
 *
 * The school gives written Gemoro / Girsa tests. A shliach types each student's scores in (paste, CSV or a linked
 * Google Sheet); the screen shows the AVERAGES, a small competitive leaderboard plus everyone who is in the program.
 *   - Whatever is entered goes on the screen. Nobody is filtered by a pass mark unless the school sets a 'minimum average'.
 *   - A low test stays in the average (the next test can lift it back), so a student is never dropped for one bad score.
 *   - Extra credit is allowed (a score may be over 100, up to LIMITS.maxScore).
 *
 * Privacy class: names (student names + marks). Data lives in data/averages.json via averagesStore.js, scope org
 * (docs/saas/FIT-RULES.md). Nothing here knows a school, a track or a prize: all of that is the org's own setting.
 */

export class AveragesError extends Error {}

export const LIMITS = Object.freeze({
  students: 600, scores: 80, prizes: 6, prizeLabel: 24, name: 60, grade: 24, track: 24, text: 200, file: 600 * 1024, importText: 256 * 1024, maxScore: 150, tracks: 8,
});

export const TRANSITIONS = Object.freeze(['mix', 'cube', 'cards', 'door', 'sweep', 'curtain', 'zoom', 'rise', 'fade']);

export const DEFAULTS = Object.freeze({
  title: 'Mivtzah Torah', // English title under the Hebrew heading (empty = Hebrew only)
  titleHe: 'מבצע תורה',   // the page heading, painted with the screen's Hebrew display font
  subtitle: 'ממוצע המבחנים באחוזים', // a small line under the heading that says what the numbers are (empty = none)
  prizes: [],             // prize levels: [{ at: 90, label: 'Gold' }, ...] (the org's own words); a student earns the highest level they reach
  prizeNote: '',          // optional line under the levels, e.g. 'Prizes are given out at the end of the year'
  minAverage: 60,         // only students at or above this appear (0 = everyone entered)
  minTests: 1,            // a student needs this many scores before they appear (a typed-in average needs none)
  columns: 2,             // the list is laid out in 2 or 3 columns (portrait screens always use 2)
  rowsPerColumn: 10,      // the most names in one column on a page (the screen uses fewer when the pages are short, so rows stay big)
  seconds: 15,            // seconds each page of names stays up (before 'pace')
  flipNames: true,        // a name typed 'Last, First' (one comma) is shown as 'First Last'
  showRank: true,         // a small position number before each name (1, 2, 3 ...)
  showMarks: true,        // the average number next to each name
  showGrade: false,       // the student's grade / shiur next to the name
  showTests: false,       // 'N tests' next to the name
  decimals: 1,            // 0 or 1
  zeroIsAbsent: false,    // false (default): a 0 is a real mark and lowers the average. true: a 0 is left out as 'did not take it'. An EMPTY cell is never counted either way.
  transition: 'mix',      // between pages: 'mix' | 'cube' | 'cards' | 'door' | 'sweep' | 'curtain' | 'zoom' | 'rise' | 'fade' (carousel, tilt and flip were removed: they clipped)
  pace: 'normal',         // how long each page stays: 'calm' | 'normal' | 'quick'
  showAvatars: false,     // a round monogram (initials) beside each name
  sparkles: true,         // a short burst of sparkles for the leader (only when the top-3 acts are on)
  // Extra acts, all OFF until the school turns them on:
  showTop3: false,        // the top three get their own acts (each one in the spotlight, then the podium)
  spotlight: 'each',      // 'each' = every top-3 student in turn (3rd, 2nd, 1st) then the podium, 'podium' = the podium only
  showImproved: false,    // the 'most improved' spotlight
  byTrack: false,         // one board per track too (Gemoro, Girsa, ...) when there are 2+ tracks
  when: 'always',         // reserved: always
});

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

/** Prize levels, highest first, equal averages merged. A pre-levels setting (one prizeAt + prizeLine) becomes a single level. */
export function normalizePrizes(list, legacyAt, legacyLine) {
  let src = Array.isArray(list) ? list : [];
  if (!src.length && Number(legacyAt) > 0) src = [{ at: legacyAt, label: legacyLine || 'Prize' }];
  const out = []; const seen = new Set();
  for (const p of src) {
    const at = Math.round(num(p?.at, NaN, 0, LIMITS.maxScore) * 10) / 10;
    if (!(at > 0) || seen.has(at)) continue;
    seen.add(at);
    out.push({ at, label: clean(p?.label, LIMITS.prizeLabel) || 'Prize' });
    if (out.length >= LIMITS.prizes) break;
  }
  return out.sort((a, b) => b.at - a.at);
}

/** The highest prize level an average reaches, or null. */
export const tierFor = (avg, prizes) => (prizes || []).find((p) => avg + 1e-9 >= p.at) || null;

export function normalizeSettings(s) {
  const o = s && typeof s === 'object' ? s : {};
  const D = DEFAULTS;
  return {
    title: clean(o.title ?? D.title, LIMITS.text),
    titleHe: clean(o.titleHe ?? D.titleHe, LIMITS.text),
    subtitle: clean(o.subtitle ?? D.subtitle, LIMITS.text),
    prizes: normalizePrizes(o.prizes, o.prizeAt, o.prizeLine),
    prizeNote: clean(o.prizeNote ?? D.prizeNote, LIMITS.text),
    minAverage: num(o.minAverage, D.minAverage, 0, LIMITS.maxScore),
    minTests: Math.round(num(o.minTests, D.minTests, 1, 20)),
    columns: pick(Number(o.columns), [2, 3], D.columns),
    rowsPerColumn: Math.round(num(o.rowsPerColumn, D.rowsPerColumn, 4, 12)),
    seconds: Math.round(num(o.seconds, D.seconds, 6, 40)),
    flipNames: bool(o.flipNames, D.flipNames),
    showRank: bool(o.showRank, D.showRank),
    showMarks: bool(o.showMarks, D.showMarks),
    showGrade: bool(o.showGrade, D.showGrade),
    showTests: bool(o.showTests, D.showTests),
    decimals: pick(Number(o.decimals), [0, 1], D.decimals),
    zeroIsAbsent: bool(o.zeroIsAbsent, D.zeroIsAbsent),
    transition: pick(o.transition, TRANSITIONS, D.transition),
    pace: pick(o.pace, ['calm', 'normal', 'quick'], D.pace),
    showAvatars: bool(o.showAvatars, D.showAvatars),
    sparkles: bool(o.sparkles, D.sparkles),
    showTop3: bool(o.showTop3, D.showTop3),
    spotlight: pick(o.spotlight, ['each', 'podium'], D.spotlight),
    showImproved: bool(o.showImproved, D.showImproved),
    byTrack: bool(o.byTrack, D.byTrack),
    when: 'always',
  };
}

const newId = () => `st-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export function normalizeScores(list) {
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').trim());
    if (Number.isFinite(n) && n >= 0 && n <= LIMITS.maxScore) out.push(Math.round(n * 100) / 100);
    if (out.length >= LIMITS.scores) break;
  }
  return out;
}

export function normalizeStudent(s) {
  const name = clean(s?.name, LIMITS.name);
  if (!name) return null;
  return {
    id: typeof s?.id === 'string' && /^[\w-]{3,40}$/.test(s.id) ? s.id : newId(),
    name,
    grade: clean(s?.grade, LIMITS.grade),
    track: clean(s?.track, LIMITS.track),
    scores: normalizeScores(s?.scores),
    // an average typed in without individual tests (used only while there are no scores)
    avg: Number.isFinite(Number(s?.avg)) && s?.avg !== null && s?.avg !== '' && Number(s.avg) >= 0 && Number(s.avg) <= LIMITS.maxScore && !normalizeScores(s?.scores).length ? Math.round(Number(s.avg) * 100) / 100 : null,
  };
}

export const nameKey = (n) => String(n || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A name compared ignoring case, punctuation and the ORDER of its words ('Katz, Moshe' = 'Moshe Katz'): for matching the Bochurim list. */
export const nameKeyLoose = (n) => String(n || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).sort().join(' ');

/** How a name is shown: 'Last, First' (exactly one comma) becomes 'First Last' when `flipNames` is on. */
export function displayName(name, settings) {
  const n = String(name || '');
  if (settings?.flipNames === false) return n;
  const m = n.match(/^([^,]+),([^,]+)$/);
  return m && m[1].trim() && m[2].trim() ? `${m[2].trim()} ${m[1].trim()}` : n;
}

/** The google sheet link block. `url` is what the admin pasted; the server derives the CSV address from it. */
export function normalizeSheet(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    url: clean(o.url, 500),
    auto: bool(o.auto, true),
    everyMin: pick(Number(o.everyMin), [1, 2, 5, 10], 1), // how often the linked sheet is looked at (minutes)
    lastSync: typeof o.lastSync === 'string' ? o.lastSync.slice(0, 40) : '',
    lastCount: Math.round(num(o.lastCount, 0, 0, 100000)),
    lastError: clean(o.lastError, LIMITS.text),
    unmatched: (Array.isArray(o.unmatched) ? o.unmatched : []).map((x) => clean(x, LIMITS.name)).filter(Boolean).slice(0, 10), // names in the sheet that are not on the Bochurim list (typo check)
    unmatchedCount: Math.round(num(o.unmatchedCount, 0, 0, 100000)),
  };
}

export function normalizeFile(f) {
  const o = f && typeof f === 'object' ? f : {};
  const seen = new Set();
  const students = [];
  for (const raw of Array.isArray(o.students) ? o.students : []) {
    const st = normalizeStudent(raw);
    if (!st || seen.has(st.id)) continue;
    seen.add(st.id);
    students.push(st);
    if (students.length >= LIMITS.students) break;
  }
  return { v: 1, settings: normalizeSettings(o.settings), sheet: normalizeSheet(o.sheet), students, updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : '' };
}

export const fileBytes = (f) => JSON.stringify(f).length;

// ── maths ───────────────────────────────────────────────────────────────────

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const round1 = (n) => Math.round(n * 10) / 10;

/** '94.5' or '95' depending on the decimals setting. */
export function fmtAvg(avg, decimals = 1) {
  if (!Number.isFinite(avg)) return '–';
  return decimals === 0 ? String(Math.round(avg)) : (Math.round(avg * 10) / 10).toFixed(1); // always one decimal so a column of averages lines up (87.0, 87.6)
}

/**
 * How much a student is climbing: the average of the last two scores minus the average of the ones before them.
 * Needs at least 3 scores. Positive = improving.
 */
export function improvement(scores) {
  if (!Array.isArray(scores) || scores.length < 3) return null;
  const recent = scores.slice(-2);
  const before = scores.slice(0, -2);
  return round1(mean(recent) - mean(before));
}

/**
 * The board: every student with enough scores (and over the minimum average), best first.
 * Equal averages share a rank (1, 1, 3). Ties break on more tests, then name, so the order never jumps between refreshes.
 * `track` '' = everyone.
 */
/** The scores that count. A 0 is a real mark (it lowers the average) unless the school switched on `zeroIsAbsent`; an empty cell never became a score at all. */
export const scoresFor = (scores, settings) => (Array.isArray(scores) ? (settings?.zeroIsAbsent === true ? scores.filter((x) => x > 0) : scores) : []);

export function board(file, opts = {}) {
  const s = normalizeSettings(opts.settings || file?.settings);
  const track = opts.track || '';
  const rows = [];
  for (const st of file?.students || []) {
    if (track && (st.track || '') !== track) continue;
    const sc = scoresFor(st.scores, s);
    const manual = !sc.length && st.avg != null; // an average typed in with no individual tests
    if (!manual && sc.length < s.minTests) continue;
    const avg = manual ? st.avg : mean(sc);
    if (s.minAverage > 0 && avg + 1e-9 < s.minAverage) continue;
    rows.push({
      id: st.id, name: displayName(st.name, s), grade: st.grade || '', track: st.track || '', tests: sc.length,
      avg, tier: tierFor(avg, s.prizes)?.label || '', last: sc.length ? sc[sc.length - 1] : null, delta: improvement(sc),
      before: sc.length >= 3 ? mean(sc.slice(0, -2)) : null, recent: sc.length >= 3 ? mean(sc.slice(-2)) : null,
    });
  }
  rows.sort((a, b) => (round1(b.avg) - round1(a.avg)) || (b.tests - a.tests) || a.name.localeCompare(b.name));
  let rank = 0; let prev = null;
  rows.forEach((r, i) => { const k = round1(r.avg); if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });
  return rows;
}

/** Why a student is not on the screen ('' = they are). Plain words for the admin. */
export function whyHidden(st, settings) {
  const s = normalizeSettings(settings);
  const sc = scoresFor(st?.scores, s);
  const manual = !sc.length && st?.avg != null;
  if (!manual && !sc.length) return st?.scores?.length ? 'Only zeros so far (zeros are being left out)' : 'No marks yet';
  if (!manual && sc.length < s.minTests) return `Needs at least ${s.minTests} ${s.minTests === 1 ? 'test' : 'tests'}`;
  const avg = manual ? st.avg : mean(sc);
  if (s.minAverage > 0 && avg + 1e-9 < s.minAverage) return `Average ${fmtAvg(avg, s.decimals)}% is below the ${s.minAverage}% minimum`;
  return '';
}

/** Students who are climbing (best first). Only a real climb of 2+ points counts. */
export function mostImproved(rows, n = 3) {
  return rows.filter((r) => r.delta != null && r.delta >= 2).sort((a, b) => (b.delta - a.delta) || (b.avg - a.avg)).slice(0, n);
}

export function tracksOf(file) {
  const set = [];
  for (const st of file?.students || []) { const t = st.track || ''; if (t && !set.includes(t)) set.push(t); if (set.length >= LIMITS.tracks) break; }
  return set;
}

/** The whole-program numbers for the top strip. */
export function summary(rows) {
  return { count: rows.length, avg: rows.length ? mean(rows.map((r) => r.avg)) : 0, tests: rows.reduce((a, r) => a + r.tests, 0), earned: rows.filter((r) => r.tier).length };
}

/** Split `rows` into pages of `per` (the last page is topped up from the page before so it is never a lonely row). */
export function paginate(rows, per) {
  if (!rows.length) return [];
  if (per < 1) per = 1;
  const n = Math.ceil(rows.length / per);
  const base = Math.floor(rows.length / n);
  const extra = rows.length % n; // the first `extra` pages get one more, so no page is more than one name smaller than another
  const out = []; let at = 0;
  for (let i = 0; i < n; i++) { const take = base + (i < extra ? 1 : 0); out.push(rows.slice(at, at + take)); at += take; }
  return out;
}

/** Seconds each kind of extra act stays up at 'normal' pace; `pace` scales them (the list pages use settings.seconds). */
export const ACT_SECONDS = Object.freeze({ spot: 6, podium: 9, improved: 9, tracks: 11 });
export const PACE = Object.freeze({ calm: 1.3, normal: 1, quick: 0.75 });
/** Names per column on a portrait screen get this many more rows (the screen is taller). */
export const PORTRAIT_EXTRA_ROWS = 3;

/**
 * The pages the slide plays, in order. By default just the list: everyone over the minimum average, highest first, every
 * name laid out the same, in `columns` columns of `rowsPerColumn` names per page (reading order is down the first column,
 * then the next), pages of equal size. Extra acts are OFF unless switched on:
 *   spot x3 + podium   the top three, one at a time (3rd, 2nd, then the leader), then together
 *   improved           the most-improved spotlight        tracks   a board per track (2+ tracks)
 * Pure, so the admin can say how long it takes.
 */
export function plan(file, { portrait = false } = {}) {
  const s = normalizeSettings(file?.settings);
  const rows = board(file);
  if (!rows.length) return [];
  const f = PACE[s.pace] || 1;
  const sec = (n) => Math.round(n * f * 10) / 10;
  const steps = [];
  const top = s.showTop3 ? rows.slice(0, 3) : [];
  if (top.length) {
    if (s.spotlight === 'each') [...top].reverse().forEach((r) => steps.push({ t: 'spot', rows: [r], place: top.indexOf(r) + 1, s: sec(ACT_SECONDS.spot) }));
    steps.push({ t: 'podium', rows: top, s: sec(ACT_SECONDS.podium) });
  }
  const imp = s.showImproved ? mostImproved(rows, 3) : [];
  if (imp.length) steps.push({ t: 'improved', rows: imp, s: sec(ACT_SECONDS.improved) });
  const tracks = s.byTrack ? tracksOf(file) : [];
  if (tracks.length >= 2) {
    const cols = tracks.slice(0, 4).map((tr) => ({ track: tr, rows: board(file, { track: tr }).slice(0, 5) })).filter((c) => c.rows.length);
    if (cols.length >= 2) steps.push({ t: 'tracks', cols, s: sec(ACT_SECONDS.tracks) });
  }
  const cols = portrait ? 2 : s.columns;
  const perCol = s.rowsPerColumn + (portrait ? PORTRAIT_EXTRA_ROWS : 0);
  paginate(rows, cols * perCol).forEach((page, i, all) => steps.push({ t: 'list', rows: page, page: i, pages: all.length, cols, perCol, s: sec(s.seconds) }));
  return steps;
}

/** The label of the section an act belongs to (for the little title pill and the progress bar). */
export const SECTION = Object.freeze({ spot: 'Top 3', podium: 'Top 3', list: 'Standings', improved: 'Most improved', tracks: 'By track' });

/** Total seconds the slide needs to show every act once (plus a little settle time for the transitions). */
export const planSeconds = (steps) => Math.round(steps.reduce((a, x) => a + x.s + 1, 0) + 1);

/** Is there anything for the rotation to show? */
export function hasBoard(file) { return board(file).length > 0; }

/** What the kiosk gets: settings + students (names class, so only the program's own screen shows it; never in the live view). */
export function forKiosk(file) {
  const f = normalizeFile(file);
  return { settings: f.settings, students: f.students.map((s) => ({ id: s.id, name: s.name, grade: f.settings.showGrade ? s.grade : '', track: s.track, scores: scoresFor(s.scores, f.settings), avg: s.avg })), updatedAt: f.updatedAt };
}

/**
 * What a public LIVE-VIEW watcher gets (owner decision 2026-11-12: always, the live link shows what the screens show): the kiosk copy,
 * cut down to the students who are on the screen. A student below the minimum average, or with no marks, is never sent (not even their name).
 */
export function forViewer(kioskData) {
  const d = kioskData && typeof kioskData === 'object' ? kioskData : null;
  if (!d || !d.settings || !Array.isArray(d.students)) return null;
  const shown = new Set(board({ settings: d.settings, students: d.students }).map((r) => r.id));
  return { ...d, students: d.students.filter((s) => shown.has(s.id)) };
}

// ── import: paste, CSV, TSV, a Google Sheet ─────────────────────────────────

/** Split one CSV/TSV line honouring "quoted, cells". */
export function splitLine(line, delim) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** Split text into logical lines, keeping a quoted cell that contains a line break together. */
function logicalLines(text) {
  const lines = []; let cur = ''; let q = false;
  for (const ch of String(text).replace(/\r\n?/g, '\n')) {
    if (ch === '"') q = !q;
    if (ch === '\n' && !q) { lines.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.length) lines.push(cur);
  return lines.filter((l) => l.trim() !== '');
}

function detectDelimiter(lines) {
  const head = lines.slice(0, 5).join('\n');
  const tabs = (head.match(/\t/g) || []).length;
  const commas = (head.match(/,/g) || []).length;
  const semis = (head.match(/;/g) || []).length;
  if (tabs >= Math.max(commas, semis) && tabs > 0) return '\t';
  if (semis > commas) return ';';
  return ',';
}

const isFrac = (x) => /^\d+([.,]\d+)?\s*\/\s*\d+([.,]\d+)?$/.test(String(x).trim()); // '17/20' = 85
const fracNum = (x) => { const [a, b] = String(x).split('/').map((t) => Number(t.replace(',', '.'))); return b > 0 ? Math.round((a / b) * 10000) / 100 : NaN; };
const isNum = (x) => x !== '' && /^-?\d+([.,]\d+)?\s*%?$/.test(String(x).trim());
const toNum = (x) => Number(String(x).replace('%', '').replace(',', '.').trim());
const HDR = {
  first: /^(first(\s*name)?|שם\s*פרטי|פרטי)$/i,
  last: /^(last(\s*name)?|surname|family(\s*name)?|שם\s*משפחה|משפחה)$/i,
  name: /(^|[^a-z])(name|student|talmid|bochur)|שם|תלמיד|בחור/i,
  grade: /^(grade|shiur|class|year|level|כיתה|שיעור)$/i,
  track: /^(track|masechta|masechet|seder|program|group|type|מסלול|מסכת|סדר)$/i,
  scores: /^(scores?|marks?|grades|tests)$/i,
  average: /^(avg|average|mean|overall|ממוצע)(\s*[(\[]?\s*(%|score|mark|grade|total|overall|באחוזים|אחוז)\s*[)\]]?)*$/i, // 'Average', 'Avg %', 'Average (%)', 'Average Score'
  skip: /^(total|sum|rank|#|id|notes?|comments?|phone|email|הערות|סה"כ)$/i,
};
// a heading that is a date ('11/3', '3/11/2026', 'Nov 5', '5 Nov 2026', '2026-11-03') = one test
const isDateHead = (c) => /^\d{1,4}[\/.\-]\d{1,2}([\/.\-]\d{1,4})?$/.test(String(c).trim()) || /^(\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+\d{1,2})?(,?\s+\d{2,4})?$/i.test(String(c).trim());
const isHeaderRow = (cells) => !cells.some(isNum) && cells.filter((c) => c !== '').length >= 2
  && (cells.some((c) => Object.values(HDR).some((re) => re.test(c))) || (cells.filter(isDateHead).length >= 2 && !isDateHead(cells[0])));

/**
 * Parse pasted / uploaded text (or a Google Sheet's CSV). Accepted shapes:
 *   Name, Grade, Track, 95, 88, 100         one student per row, every number after the name is a score
 *   First, Last, 95, 88                     first and last name in two columns
 *   Name, Scores    ->  Moshe Katz, 95 88 100   (scores in one cell)
 *   Name, Test 1, Test 2 ...                a header row with test names (only the numbers are used)
 *   Name, Average                           only an average, no individual tests (a student with test scores uses those instead)
 * The header row can be anywhere in the first 8 rows (title lines above it are ignored) and can be Hebrew (שם, ממוצע, כיתה...).
 * Non-numeric cells after the name are read as grade, then track (no header). In a header row an unknown column is treated as a test
 * column, but a column whose numbers are not scores (a phone number, a year) is ignored and reported.
 * Returns { rows: [{name, grade, track, scores, avg}], errors, warnings, counts, columns: [{header, as}] }.
 */
export function parseInput(text) {
  const errors = []; const warnings = [];
  const empty = { rows: [], warnings, columns: [], counts: { students: 0, scores: 0 } };
  const src = String(text ?? '').replace(/^﻿/, '');
  if (src.length > LIMITS.importText) return { ...empty, errors: [{ line: 0, message: 'That is too much text to import at once.' }] };
  const lines = logicalLines(src);
  if (!lines.length) return { ...empty, errors: [{ line: 0, message: 'Nothing to import yet. Paste your list first.' }] };
  const delim = detectDelimiter(lines);
  const grid = lines.map((l) => splitLine(l, delim));

  let map = null; let start = 0;
  for (let i = 0; i < Math.min(8, grid.length); i++) {
    if (isHeaderRow(grid[i])) {
      map = grid[i].map((c) => { for (const [k, re] of Object.entries(HDR)) if (re.test(c)) return k; return c === '' ? 'skip' : 'test'; });
      if (!map.includes('name') && !map.includes('first')) map[0] = 'name'; // a blank or unusual first heading above the names
      start = i + 1;
      break;
    }
  }
  const header = map ? grid[start - 1] : [];
  const ignoredCols = new Map(); // column index -> count of cells that were not scores

  const byKey = new Map();
  const order = [];
  grid.slice(start).forEach((cells, idx) => {
    const line = idx + start + 1;
    let name = ''; let first_ = ''; let last_ = ''; let grade = ''; let track = ''; let given = null; const scores = [];
    let bad = '';
    const take = (v, col) => {
      if (v !== '' && isFrac(v)) { const f = fracNum(v); if (Number.isFinite(f) && f >= 0 && f <= LIMITS.maxScore) scores.push(f); return; }
      if (v === '' || !isNum(v)) return;
      const n = toNum(v);
      if (n < 0 || n > LIMITS.maxScore) { if (map && col != null && map[col] === 'test') ignoredCols.set(col, (ignoredCols.get(col) || 0) + 1); else bad = `${v} is not a score between 0 and ${LIMITS.maxScore}`; } else scores.push(n);
    };
    if (map) {
      cells.forEach((v, i) => {
        const k = map[i] || 'skip';
        if (k === 'name') name = v; else if (k === 'first') first_ = v; else if (k === 'last') last_ = v;
        else if (k === 'grade') grade = v; else if (k === 'track') track = v;
        else if (k === 'average') { if (isNum(v)) { const n = toNum(v); if (n >= 0 && n <= LIMITS.maxScore) given = n; } }
        else if (k === 'skip') return;
        else if (k === 'scores') v.split(/[\s;,|]+/).forEach((x) => take(x, i));
        else take(v, i);
      });
      if (!name) name = `${first_} ${last_}`.trim();
    } else {
      const [n0, ...rest] = cells;
      name = n0 || '';
      const words = [];
      for (const v of rest) {
        if (v === '') continue;
        if (isNum(v)) take(v);
        else if (/^[\d.,%\s;|]+$/.test(v) && /\d/.test(v)) v.split(/[\s;,|]+/).forEach((x) => take(x)); // 'a cell with 95 88 100'
        else words.push(v);
      }
      [grade = '', track = ''] = words;
    }
    name = clean(name, LIMITS.name);
    if (!name) { if (cells.some((c) => c !== '') && !(map && cells.filter((c) => c !== '').length <= 1)) errors.push({ line, message: 'There is no name on this row.' }); return; }
    if (isNum(name)) { errors.push({ line, message: `"${name}" is a number, not a name. Put the name first.` }); return; }
    if (bad) { errors.push({ line, message: `${name}: ${bad}.` }); return; }
    const k = nameKey(name);
    const ex = byKey.get(k);
    if (ex) { ex.scores.push(...scores); if (given != null && ex.avg == null) ex.avg = given; if (grade && !ex.grade) ex.grade = clean(grade, LIMITS.grade); if (track && !ex.track) ex.track = clean(track, LIMITS.track); warnings.push({ line, message: `${name} appears twice. Their scores were joined.` }); return; }
    const row = { name, grade: clean(grade, LIMITS.grade), track: clean(track, LIMITS.track), scores, avg: given };
    byKey.set(k, row); order.push(row);
  });
  for (const r of order) r.scores = normalizeScores(r.scores);
  for (const r of order) if (!r.scores.length && r.avg == null) warnings.push({ line: 0, message: `${r.name} has no scores or average yet, so they will not show on the screen.` });
  for (const [col, n] of ignoredCols) warnings.push({ line: 0, message: `Column "${header[col] || col + 1}" was ignored (${n} values were not scores).` });
  if (order.length > LIMITS.students) errors.push({ line: 0, message: `That is more than ${LIMITS.students} students.` });
  const columns = map ? header.map((h, i) => ({ header: h || `(column ${i + 1})`, as: ignoredCols.has(i) ? 'ignored' : map[i] === 'test' ? 'score' : map[i] === 'scores' ? 'score' : map[i] === 'skip' ? 'ignored' : map[i] })) : [];
  return { rows: order, errors, warnings, columns, counts: { students: order.length, scores: order.reduce((a, r) => a + r.scores.length, 0), averageOnly: order.filter((r) => !r.scores.length && r.avg != null).length } };
}

/**
 * Apply a parsed import.
 *   mode 'replace'  the pasted list is the whole truth (everyone not in it is removed; same names keep their id)
 *   mode 'add'      the pasted scores are ADDED after the scores a student already has (new names are created)
 */
export function applyImport(file, parsed, { mode = 'replace' } = {}) {
  const f = normalizeFile(file);
  if (parsed.errors?.length) throw new AveragesError(parsed.errors[0].message);
  const cur = new Map(f.students.map((s) => [nameKey(s.name), s]));
  let students;
  if (mode === 'add') {
    students = f.students.map((s) => ({ ...s }));
    const idx = new Map(students.map((s) => [nameKey(s.name), s]));
    for (const r of parsed.rows) {
      const hit = idx.get(nameKey(r.name));
      if (hit) { hit.scores = normalizeScores([...hit.scores, ...r.scores]); if (r.grade) hit.grade = r.grade; if (r.track) hit.track = r.track; }
      else { const st = normalizeStudent(r); if (st) { students.push(st); idx.set(nameKey(st.name), st); } }
    }
  } else {
    students = parsed.rows.map((r) => normalizeStudent({ ...r, id: cur.get(nameKey(r.name))?.id })).filter(Boolean);
  }
  return normalizeFile({ ...f, students, updatedAt: new Date().toISOString() });
}

export const setSettings = (file, patch) => normalizeFile({ ...normalizeFile(file), settings: { ...normalizeFile(file).settings, ...(patch && typeof patch === 'object' ? patch : {}) } });

export function upsertStudent(file, id, data) {
  const f = normalizeFile(file);
  const st = normalizeStudent({ ...data, id: id || undefined });
  if (!st) throw new AveragesError('A student needs a name.');
  const i = id ? f.students.findIndex((s) => s.id === id) : -1;
  if (i >= 0) f.students[i] = { ...st, id };
  else {
    if (f.students.some((s) => nameKey(s.name) === nameKey(st.name))) throw new AveragesError(`${st.name} is already on the list. Edit them instead.`);
    f.students.push(st);
  }
  f.updatedAt = new Date().toISOString();
  return normalizeFile(f);
}

export function removeStudent(file, id) {
  const f = normalizeFile(file);
  const n = f.students.length;
  f.students = f.students.filter((s) => s.id !== id);
  if (f.students.length === n) throw new AveragesError('That student is not on the list.');
  f.updatedAt = new Date().toISOString();
  return normalizeFile(f);
}

export const clearAll = (file) => normalizeFile({ ...normalizeFile(file), students: [], updatedAt: new Date().toISOString() });

// ── names from the Bochurim list (the roster) ───────────────────────────────

/** 'First Last' for every person on the roster, sorted by last then first name. */
export function rosterNames(people) {
  return (Array.isArray(people) ? people : [])
    .map((p) => ({ name: clean(`${p?.first || ''} ${p?.last || ''}`, LIMITS.name), last: String(p?.last || '').toLowerCase(), first: String(p?.first || '').toLowerCase() }))
    .filter((p) => p.name)
    .sort((a, b) => a.last.localeCompare(b.last) || a.first.localeCompare(b.first))
    .map((p) => p.name);
}

/** Names in `rows` ({name}) that are not in `names` (compared ignoring case and punctuation): a typo check against the Bochurim list. */
export function notOnList(rows, names) {
  const known = new Set((names || []).map(nameKeyLoose));
  if (!known.size) return [];
  return (rows || []).filter((r) => !known.has(nameKeyLoose(r.name))).map((r) => r.name);
}

/** Add every name in `names` that is not on the list yet, with no scores (they appear on the screen once they have one). */
export function addNames(file, names) {
  const f = normalizeFile(file);
  const have = new Set(f.students.map((s) => nameKeyLoose(s.name)));
  let added = 0;
  for (const n of names || []) {
    const st = normalizeStudent({ name: n });
    if (!st || have.has(nameKeyLoose(st.name))) continue;
    have.add(nameKeyLoose(st.name)); f.students.push(st); added++;
  }
  f.updatedAt = new Date().toISOString();
  return { file: normalizeFile(f), added };
}

/** A starter CSV for Google Sheets: the roster's names filled in, every other column empty, same headings as the template. */
export function starterCsv(names, tests = 8) {
  const head = ['Name', 'Grade', 'Track', ...Array.from({ length: tests }, (_, i) => `Test ${i + 1}`)];
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [head.join(','), ...(names || []).map((n) => [q(n), '', '', ...Array(tests).fill('')].join(','))].join('\n') + '\n';
}

// ── the template the shliach fills in ───────────────────────────────────────

export const TEMPLATE_CSV = [
  'Name,Grade,Track,Test 1,Test 2,Test 3,Test 4',
  'Moshe Example,9th,Gemoro,92,88,95,100',
  'Yossi Sample,10th,Girsa,85,90,,',
  'Dovid Demo,9th,Gemoro,78,84,91,',
].join('\n');

/** The text to give Claude (or a person) so a messy list becomes the format above. */
export const CLAUDE_PROMPT = `Turn the attached list of test scores into CSV with exactly these columns, one student per row, and nothing else:
Name,Grade,Track,Test 1,Test 2,Test 3,...
Rules: Name is first name then last name. Grade and Track may be empty. Put each test score as a plain number from 0 to 100 (extra credit may be higher), oldest test first. Leave a cell empty if the student did not take that test. Do not add an average column. Do not invent any names or scores.`;

// ── Google Sheet link ───────────────────────────────────────────────────────

/**
 * The CSV address for a pasted Google Sheets link, or null if it is not one. Only docs.google.com sheets are allowed (the
 * server fetches this address, so it must never be an arbitrary host). Accepts the normal share link, a link to one tab
 * (#gid=...), and a 'Publish to the web' link (/d/e/...).
 */
export function sheetCsvUrl(input) {
  let u;
  try { u = new URL(String(input || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([\w-]{10,200})\/pub/);
  if (pub) {
    const gid = u.searchParams.get('gid');
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${encodeURIComponent(gid)}` : ''}`;
  }
  const m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]{10,200})/);
  if (!m) return null;
  const gid = (u.hash.match(/gid=(\d+)/) || [])[1] || u.searchParams.get('gid');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid && /^\d+$/.test(gid) ? `&gid=${gid}` : ''}`;
}
