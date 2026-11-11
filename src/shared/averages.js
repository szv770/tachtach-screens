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

export const DEFAULTS = Object.freeze({
  title: 'Top Averages',
  titleHe: 'מצטיינים',
  prizes: [],             // prize levels: [{ at: 90, label: 'Gold' }, ...] (the org's own words); a student earns the highest level they reach
  prizeNote: '',          // optional line under the levels, e.g. 'Prizes are given out at the end of the year'
  minAverage: 0,          // only students at or above this appear (0 = everyone entered)
  minTests: 1,            // a student needs this many scores before they appear
  topCount: 10,           // the leaderboard size
  view: 'both',           // 'top' | 'all' | 'both' (leaderboard, then everyone in pages)
  byTrack: false,         // one board per track too (Gemoro, Girsa, ...) when there are 2+ tracks
  showImproved: true,     // the 'most improved' spotlight
  showMarks: true,        // the average number next to each name
  showGrade: false,       // the student's grade / shiur next to the name
  showTests: false,       // 'N tests' next to the name
  decimals: 1,            // 0 or 1
  seconds: 10,            // seconds per page of the full list
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
    title: clean(o.title ?? D.title, LIMITS.text) || D.title,
    titleHe: clean(o.titleHe ?? D.titleHe, LIMITS.text),
    prizes: normalizePrizes(o.prizes, o.prizeAt, o.prizeLine),
    prizeNote: clean(o.prizeNote ?? D.prizeNote, LIMITS.text),
    minAverage: num(o.minAverage, D.minAverage, 0, LIMITS.maxScore),
    minTests: Math.round(num(o.minTests, D.minTests, 1, 20)),
    topCount: Math.round(num(o.topCount, D.topCount, 3, 10)),
    view: pick(o.view, ['top', 'all', 'both'], D.view),
    byTrack: bool(o.byTrack, D.byTrack),
    showImproved: bool(o.showImproved, D.showImproved),
    showMarks: bool(o.showMarks, D.showMarks),
    showGrade: bool(o.showGrade, D.showGrade),
    showTests: bool(o.showTests, D.showTests),
    decimals: pick(Number(o.decimals), [0, 1], D.decimals),
    seconds: Math.round(num(o.seconds, D.seconds, 5, 30)),
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
  };
}

export const nameKey = (n) => String(n || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The google sheet link block. `url` is what the admin pasted; the server derives the CSV address from it. */
export function normalizeSheet(s) {
  const o = s && typeof s === 'object' ? s : {};
  return {
    url: clean(o.url, 500),
    auto: bool(o.auto, true),
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
  if (decimals === 0) return String(Math.round(avg));
  const r = round1(avg);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
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
export function board(file, opts = {}) {
  const s = normalizeSettings(opts.settings || file?.settings);
  const track = opts.track || '';
  const rows = [];
  for (const st of file?.students || []) {
    if (track && (st.track || '') !== track) continue;
    if (!st.scores || st.scores.length < s.minTests) continue;
    const avg = mean(st.scores);
    if (s.minAverage > 0 && avg + 1e-9 < s.minAverage) continue;
    rows.push({
      id: st.id, name: st.name, grade: st.grade || '', track: st.track || '', tests: st.scores.length,
      avg, tier: tierFor(avg, s.prizes)?.label || '', last: st.scores[st.scores.length - 1], delta: improvement(st.scores),
      before: st.scores.length >= 3 ? mean(st.scores.slice(0, -2)) : null, recent: st.scores.length >= 3 ? mean(st.scores.slice(-2)) : null,
    });
  }
  rows.sort((a, b) => (round1(b.avg) - round1(a.avg)) || (b.tests - a.tests) || a.name.localeCompare(b.name));
  let rank = 0; let prev = null;
  rows.forEach((r, i) => { const k = round1(r.avg); if (k !== prev) { rank = i + 1; prev = k; } r.rank = rank; });
  return rows;
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
  const even = Math.ceil(rows.length / n); // equal-ish pages instead of 12, 12, 1
  const out = [];
  for (let i = 0; i < rows.length; i += even) out.push(rows.slice(i, i + even));
  return out;
}

/** Seconds each kind of page stays up (the list pages use settings.seconds). */
export const STEP_SECONDS = Object.freeze({ top: 12, improved: 9, tracks: 11 });
/** Rows on one 'everyone' page. */
export const PER_PAGE = Object.freeze({ landscape: 24, portrait: 16 });
/** Rows beside the podium on the leaderboard page (ranks 4..), so topCount 10 = podium + 7. */
export const BESIDE = Object.freeze({ landscape: 7, portrait: 5 });

/**
 * The pages the slide steps through, in order: the leaderboard (podium + the next few), the most-improved spotlight,
 * a board per track, then everyone else in equal pages. Pure, so the admin can say how long it takes.
 *   view 'top'  leaderboard only          'both'  leaderboard, then everyone below it          'all'  everyone in pages, no podium
 */
export function plan(file, { portrait = false } = {}) {
  const s = normalizeSettings(file?.settings);
  const rows = board(file);
  if (!rows.length) return [];
  const steps = [];
  const topN = Math.min(s.topCount, 3 + (portrait ? BESIDE.portrait : BESIDE.landscape));
  if (s.view !== 'all') steps.push({ t: 'top', rows: rows.slice(0, topN), s: STEP_SECONDS.top });
  const imp = s.showImproved ? mostImproved(rows, 3) : [];
  if (imp.length) steps.push({ t: 'improved', rows: imp, s: STEP_SECONDS.improved });
  const tracks = s.byTrack ? tracksOf(file) : [];
  if (tracks.length >= 2) {
    const cols = tracks.slice(0, 4).map((tr) => ({ track: tr, rows: board(file, { track: tr }).slice(0, 5) })).filter((c) => c.rows.length);
    if (cols.length >= 2) steps.push({ t: 'tracks', cols, s: STEP_SECONDS.tracks });
  }
  const rest = s.view === 'top' ? [] : (s.view === 'all' ? rows : rows.slice(topN));
  paginate(rest, portrait ? PER_PAGE.portrait : PER_PAGE.landscape).forEach((page, i, all) => steps.push({ t: 'list', rows: page, page: i, pages: all.length, s: s.seconds }));
  return steps;
}

/** Total seconds the slide needs to show every page once (plus a little settle time). */
export const planSeconds = (steps) => steps.reduce((a, x) => a + x.s, 0) + 2;

/** Is there anything for the rotation to show? */
export function hasBoard(file) { return board(file).length > 0; }

/** What the kiosk gets: settings + students (names class, so only the program's own screen shows it; never in the live view). */
export function forKiosk(file) {
  const f = normalizeFile(file);
  return { settings: f.settings, students: f.students.map((s) => ({ id: s.id, name: s.name, grade: s.grade, track: s.track, scores: s.scores })), updatedAt: f.updatedAt };
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

const isNum = (x) => x !== '' && /^-?\d+([.,]\d+)?\s*%?$/.test(String(x).trim());
const toNum = (x) => Number(String(x).replace('%', '').replace(',', '.').trim());
const HDR = {
  name: /^(full\s*name|name|student|bochur|talmid)$/i,
  first: /^(first(\s*name)?)$/i,
  last: /^(last(\s*name)?|surname|family(\s*name)?)$/i,
  grade: /^(grade|shiur|class|year|level)$/i,
  track: /^(track|masechta|masechet|seder|program|group|type)$/i,
  scores: /^(scores?|marks?|grades|tests)$/i,
  skip: /^(avg|average|total|mean|sum|rank|#|id|notes?)$/i,
};

/**
 * Parse pasted / uploaded text. Accepted shapes (header row optional):
 *   Name, Grade, Track, 95, 88, 100         one student per row, every number after the name is a score
 *   First, Last, 95, 88                     first and last name in two columns
 *   Name, Scores    ->  Moshe Katz, 95 88 100   (scores in one cell)
 *   Name, Test 1, Test 2 ...                a header row with test names (only the numbers are used)
 * Non-numeric cells after the name are read as grade, then track. Columns called Average / Total / Rank are ignored.
 * Returns { rows: [{name, grade, track, scores}], errors: [{line, message}], warnings: [...], counts }.
 */
export function parseInput(text) {
  const errors = []; const warnings = [];
  const src = String(text ?? '').replace(/^﻿/, '');
  if (src.length > LIMITS.importText) return { rows: [], errors: [{ line: 0, message: 'That is too much text to import at once.' }], warnings, counts: { students: 0, scores: 0 } };
  const lines = logicalLines(src);
  if (!lines.length) return { rows: [], errors: [{ line: 0, message: 'Nothing to import yet. Paste your list first.' }], warnings, counts: { students: 0, scores: 0 } };
  const delim = detectDelimiter(lines);
  const grid = lines.map((l) => splitLine(l, delim));

  // header: first row with no number in it and a recognisable word
  let map = null; let start = 0;
  const first = grid[0];
  if (!first.some(isNum) && first.some((c) => Object.values(HDR).some((re) => re.test(c)))) {
    map = first.map((c) => { for (const [k, re] of Object.entries(HDR)) if (re.test(c)) return k; return 'test'; });
    start = 1;
  }

  const byKey = new Map();
  const order = [];
  grid.slice(start).forEach((cells, idx) => {
    const line = idx + start + 1;
    let name = ''; let first_ = ''; let last_ = ''; let grade = ''; let track = ''; const scores = [];
    let bad = '';
    const take = (v) => { if (v === '') return; if (isNum(v)) { const n = toNum(v); if (n < 0 || n > LIMITS.maxScore) bad = `${v} is not a score between 0 and ${LIMITS.maxScore}`; else scores.push(n); } };
    if (map) {
      cells.forEach((v, i) => {
        const k = map[i] || 'test';
        if (k === 'name') name = v; else if (k === 'first') first_ = v; else if (k === 'last') last_ = v;
        else if (k === 'grade') grade = v; else if (k === 'track') track = v;
        else if (k === 'skip') return;
        else if (k === 'scores') v.split(/[\s;,|]+/).forEach(take);
        else take(v);
      });
      if (!name) name = `${first_} ${last_}`.trim();
    } else {
      const [n0, ...rest] = cells;
      name = n0 || '';
      const words = [];
      for (const v of rest) {
        if (v === '') continue;
        if (isNum(v)) take(v);
        else if (/^[\d.,%\s;|]+$/.test(v) && /\d/.test(v)) v.split(/[\s;,|]+/).forEach(take); // 'a cell with 95 88 100'
        else words.push(v);
      }
      [grade = '', track = ''] = words;
    }
    name = clean(name, LIMITS.name);
    if (!name) { if (cells.some((c) => c !== '')) errors.push({ line, message: 'There is no name on this row.' }); return; }
    if (isNum(name)) { errors.push({ line, message: `"${name}" is a number, not a name. Put the name first.` }); return; }
    if (bad) { errors.push({ line, message: `${name}: ${bad}.` }); return; }
    const k = nameKey(name);
    const ex = byKey.get(k);
    if (ex) { ex.scores.push(...scores); if (grade && !ex.grade) ex.grade = clean(grade, LIMITS.grade); if (track && !ex.track) ex.track = clean(track, LIMITS.track); warnings.push({ line, message: `${name} appears twice. Their scores were joined.` }); return; }
    const row = { name, grade: clean(grade, LIMITS.grade), track: clean(track, LIMITS.track), scores };
    byKey.set(k, row); order.push(row);
  });
  for (const r of order) if (!r.scores.length) warnings.push({ line: 0, message: `${r.name} has no scores yet, so they will not show on the screen.` });
  if (order.length > LIMITS.students) errors.push({ line: 0, message: `That is more than ${LIMITS.students} students.` });
  for (const r of order) r.scores = normalizeScores(r.scores);
  return { rows: order, errors, warnings, counts: { students: order.length, scores: order.reduce((a, r) => a + r.scores.length, 0) } };
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
  const known = new Set((names || []).map(nameKey));
  if (!known.size) return [];
  return (rows || []).filter((r) => !known.has(nameKey(r.name))).map((r) => r.name);
}

/** Add every name in `names` that is not on the list yet, with no scores (they appear on the screen once they have one). */
export function addNames(file, names) {
  const f = normalizeFile(file);
  const have = new Set(f.students.map((s) => nameKey(s.name)));
  let added = 0;
  for (const n of names || []) {
    const st = normalizeStudent({ name: n });
    if (!st || have.has(nameKey(st.name))) continue;
    have.add(nameKey(st.name)); f.students.push(st); added++;
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
