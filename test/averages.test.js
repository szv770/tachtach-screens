import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../src/shared/averages.js';
import { createAveragesStore } from '../src/server/averagesStore.js';
import { syncSheet } from '../src/server/routes/averages.js';
import { fetchSheetCsv } from '../src/fetchers/scoreSheet.js';

const CSV = 'Name,Grade,Track,T1,T2,T3\nMoshe Katz,9th,Gemoro,92,88,95\nYossi Berg,10th,Girsa,70,80,95\n"Levy, Dovid",9th,Gemoro,100,100,\nEmpty Eli,9th,Gemoro,,,\n';

test('parseInput: header CSV, quoted names, blanks, no-score students warned', () => {
  const p = A.parseInput(CSV);
  assert.equal(p.errors.length, 0);
  assert.deepEqual(p.rows.map((r) => r.name), ['Moshe Katz', 'Yossi Berg', 'Levy, Dovid', 'Empty Eli']);
  assert.deepEqual(p.rows[2].scores, [100, 100]);
  assert.equal(p.rows[0].track, 'Gemoro');
  assert.ok(p.warnings.some((w) => /Empty Eli/.test(w.message)));
});

test('parseInput: no header, tabs, first+last columns, percent and extra credit, junk rejected', () => {
  assert.deepEqual(A.parseInput('Moshe Katz\t9th\t95%\t88\t104').rows[0], { name: 'Moshe Katz', grade: '9th', track: '', scores: [95, 88, 104], avg: null });
  assert.equal(A.parseInput('First,Last,Q1,Q2\nDovid,Katz,90,80').rows[0].name, 'Dovid Katz');
  assert.equal(A.parseInput('Name,Average,T1\nA B,99,70').rows[0].scores.join(), '70', 'an Average column is ignored');
  assert.equal(A.parseInput('Name,Scores\nA B,95 88 100').rows[0].scores.length, 3);
  assert.ok(A.parseInput('Moshe,999').errors.length, 'a score over the maximum is an error');
  assert.ok(A.parseInput('').errors.length);
  assert.ok(A.parseInput('12,34').errors.length, 'a number is not a name');
});

test('board: averages, shared ranks, never drops a student for a low score, minimums', () => {
  const f = A.applyImport({}, A.parseInput(CSV));
  const b = A.board(f);
  assert.deepEqual(b.map((r) => r.name), ['Levy, Dovid', 'Moshe Katz', 'Yossi Berg'], 'Empty Eli has no scores so is not on the board');
  assert.equal(b[0].rank, 1);
  const tie = A.board({ students: [{ id: 'st-aaa', name: 'A', scores: [90] }, { id: 'st-bbb', name: 'B', scores: [90] }, { id: 'st-ccc', name: 'C', scores: [80] }] });
  assert.deepEqual(tie.map((r) => r.rank), [1, 1, 3]);
  const low = { students: [{ id: 'st-aaa', name: 'A', scores: [95, 90, 40] }] };
  assert.equal(A.board(low).length, 1, 'a bad test lowers the average but the student stays');
  assert.equal(A.board(f, { settings: { minAverage: 95 } }).length, 1);
  assert.equal(A.board(f, { settings: { minTests: 3 } }).length, 2);
  assert.equal(A.board(f, { track: 'Girsa' }).length, 1);
});

test('improvement and mostImproved', () => {
  assert.equal(A.improvement([80, 90]), null, 'needs 3 scores');
  assert.equal(A.improvement([70, 80, 95, 95]), 20);
  const f = A.applyImport({}, A.parseInput(CSV));
  const imp = A.mostImproved(A.board(f));
  assert.equal(imp[0].name, 'Yossi Berg');
});

test('minimum average is optional; prize levels pick the highest reached', () => {
  const f = A.applyImport({}, A.parseInput('A One,95,95\nB Two,85,85\nC Three,60,60'));
  assert.equal(A.board(f).length, 3, 'no minimum: everyone entered shows');
  assert.equal(A.board({ ...f, settings: { minAverage: 80 } }).length, 2);
  const g = { ...f, settings: { prizes: [{ at: 80, label: 'Silver' }, { at: 90, label: 'Gold' }, { at: 90, label: 'dupe' }, { at: 0, label: 'zero' }] } };
  assert.deepEqual(A.normalizeSettings(g.settings).prizes, [{ at: 90, label: 'Gold' }, { at: 80, label: 'Silver' }], 'sorted, deduped, zero dropped');
  assert.deepEqual(A.board(g).map((r) => r.tier), ['Gold', 'Silver', '']);
  assert.deepEqual(A.normalizeSettings({ prizeAt: 90, prizeLine: 'a pizza party' }).prizes, [{ at: 90, label: 'a pizza party' }], 'the older single prize becomes one level');
});

test('Bochurim list: names, typo check, add without scores, starter csv', () => {
  const names = A.rosterNames([{ first: 'Moshe', last: 'Katz' }, { first: 'Avi', last: 'Berg' }, { first: '', last: '' }]);
  assert.deepEqual(names, ['Avi Berg', 'Moshe Katz']);
  assert.deepEqual(A.notOnList([{ name: 'moshe  katz' }, { name: 'Mosheh Katz' }], names), ['Mosheh Katz']);
  assert.deepEqual(A.notOnList([{ name: 'Anyone' }], []), [], 'an empty list flags nothing');
  const r = A.addNames(A.applyImport({}, A.parseInput('Moshe Katz,90,95')), names);
  assert.equal(r.added, 1);
  assert.equal(A.board(r.file).length, 1, 'a student with no scores is not on the screen');
  const csv = A.starterCsv(['Avi Berg', 'Levy, Dovid']);
  assert.match(csv, /^Name,Grade,Track,Test 1/);
  const back = A.parseInput(csv);
  assert.deepEqual(back.rows.map((x) => x.name), ['Avi Berg', 'Levy, Dovid'], 'the starter sheet imports back cleanly');
});

test('fmtAvg', () => { assert.equal(A.fmtAvg(94.5), '94.5'); assert.equal(A.fmtAvg(95.04), '95.0'); assert.equal(A.fmtAvg(94.5, 0), '95'); });

test('applyImport: replace keeps ids of same names; add appends scores', () => {
  const f1 = A.applyImport({}, A.parseInput('Moshe Katz,90\nYossi,80'));
  const id = f1.students[0].id;
  const f2 = A.applyImport(f1, A.parseInput('moshe katz,100'), { mode: 'add' });
  assert.deepEqual(f2.students.find((s) => s.id === id).scores, [90, 100]);
  assert.equal(f2.students.length, 2);
  const f3 = A.applyImport(f2, A.parseInput('Moshe Katz,70'), { mode: 'replace' });
  assert.equal(f3.students.length, 1);
  assert.equal(f3.students[0].id, id);
});

test('defaults: Hebrew heading, 60 minimum, a plain list, every extra act off', () => {
  const d = A.normalizeSettings({});
  assert.equal(d.titleHe, 'מבצע תורה');
  assert.equal(d.title, 'Mivtzah Torah', 'an English title sits under the Hebrew heading (the admin can change or clear it)');
  assert.equal(A.normalizeSettings({ title: '' }).title, '', 'cleared = Hebrew only');
  const g = A.applyImport({ settings: { minAverage: 0 } }, A.parseInput('Name,Grade,T1\nA One,10th,90'));
  assert.equal(A.forKiosk(g).students[0].grade, '', 'grade never reaches the screen unless it is switched on');
  assert.equal(A.forKiosk({ ...g, settings: { showGrade: true } }).students[0].grade, '10th');
  assert.match(d.subtitle, /אחוזים/, 'a line under the heading says the numbers are percentages');
  assert.equal(d.columns, 2);
  assert.equal(d.minAverage, 60);
  assert.deepEqual([d.showTop3, d.showImproved, d.byTrack, d.showAvatars], [false, false, false, false]);
  assert.equal(A.normalizeSettings({ minAverage: 0 }).minAverage, 0, 'the admin can turn the minimum off');
  assert.equal(A.normalizeSettings({ title: 'Torah Mivtza' }).title, 'Torah Mivtza');
  assert.equal(A.normalizeSettings({ transition: 'cube' }).transition, 'cube');
  assert.equal(A.normalizeSettings({ transition: 'nonsense' }).transition, 'mix');
});

test('plan: by default only the list, highest first, pages of equal size, no scroll or podium', () => {
  const rows = [];
  for (let i = 0; i < 48; i++) rows.push(`Student ${i},${55 + i},${55 + (i % 45)}`);
  const f = A.applyImport({}, A.parseInput(rows.join('\n')));
  const shown = A.board(f);
  assert.ok(shown.every((r) => r.avg >= 60) && shown.length < 48, 'under 60 stays off the screen');
  const p = A.plan(f);
  assert.ok(p.every((x) => x.t === 'list'), 'extra acts are off by default');
  assert.equal(p.reduce((a, x) => a + x.rows.length, 0), shown.length, 'everyone shown exactly once');
  assert.ok(p.every((x) => x.cols === 2 && x.perCol === 10));
  assert.ok(Math.max(...p.map((x) => x.rows.length)) - Math.min(...p.map((x) => x.rows.length)) <= 1, 'equal pages');
  const order = p.flatMap((x) => x.rows).map((r) => r.avg);
  assert.deepEqual(order, [...order].sort((a, b) => b - a), 'highest average first, page after page');
  assert.equal(A.plan({ students: [] }).length, 0);
});

test('plan: about 40 names read in well under a minute; extra acts and layout follow the settings', () => {
  const f = (settings, n = 40) => A.applyImport({ settings }, A.parseInput(Array.from({ length: n }, (_, i) => `S ${i},${95 - i * 0.5},${96 - i * 0.5}`).join('\n')));
  assert.ok(A.planSeconds(A.plan(f({}))) <= 40, `40 names take ${A.planSeconds(A.plan(f({})))} s`);
  assert.deepEqual(A.plan(f({ columns: 2, rowsPerColumn: 10 })).map((x) => x.cols * x.perCol), [20, 20]);
  assert.equal(A.plan(f({}), { portrait: true })[0].cols, 2, 'portrait always 2 columns');
  assert.ok(A.plan(f({}), { portrait: true })[0].perCol > 10, 'portrait is taller so more rows per column');
  const on = A.plan(f({ showTop3: true, showImproved: true }));
  assert.deepEqual(on.slice(0, 4).map((x) => `${x.t}${x.place || ''}`), ['spot3', 'spot2', 'spot1', 'podium']);
  assert.ok(on.at(-1).t === 'list');
  assert.deepEqual(A.plan(f({ showTop3: true, spotlight: 'podium' })).slice(0, 2).map((x) => x.t), ['podium', 'list']);
  assert.ok(A.planSeconds(A.plan(f({ pace: 'calm' }))) > A.planSeconds(A.plan(f({ pace: 'quick' }))));
});

 test('a sheet with a date above each test: an empty cell is not counted, a 0 is a real mark, fractions work', () => {
  const csv = ',11/3,11/10,Nov 17,12/1/2026\nMoshe Katz,90,,80,0\nYossi Berg,0,0,0,0\nDovid Levy,17/20,,,100\n';
  const p = A.parseInput(csv);
  assert.equal(p.errors.length, 0);
  assert.deepEqual(p.columns.map((c) => c.as), ['name', 'score', 'score', 'score', 'score'], 'the blank corner heading is the name column, each date is a test');
  const f = A.applyImport({ settings: { minAverage: 0 } }, p);
  const byName = (rows) => Object.fromEntries(rows.map((r) => [r.name, [r.avg, r.tests]]));
  assert.deepEqual(byName(A.board(f)), { 'Dovid Levy': [92.5, 2], 'Moshe Katz': [(90 + 80 + 0) / 3, 3], 'Yossi Berg': [0, 4] }, 'the blank is skipped but a 0 counts: Moshe drops, Yossi is at 0');
  assert.deepEqual(A.forKiosk(f).students.find((s) => s.name === 'Moshe Katz').scores, [90, 80, 0], 'the screen gets the zero too');
  const left = byName(A.board({ ...f, settings: { minAverage: 0, zeroIsAbsent: true } }));
  assert.deepEqual(left, { 'Dovid Levy': [92.5, 2], 'Moshe Katz': [85, 2] }, 'if the school switches it on, zeros are left out (and a student with only zeros does not show)');
  assert.equal(A.parseInput('Student\'s Name,Quiz 1\nA One,70').rows[0].name, 'A One', 'a heading like Student\'s Name is the name column');
});

test('importer copes with an existing sheet: title lines, Hebrew headings, an average without tests, a phone column', () => {
  const csv = 'Torah program 5786\n\nשם,ממוצע,כיתה,טלפון\nמשה כהן,88.5,ט,0541234567\nDovid Levy,92%,ט,0509999999\n,,,\n';
  const p = A.parseInput(csv);
  assert.equal(p.errors.length, 0);
  assert.deepEqual(p.rows.map((r) => [r.name, r.avg, r.grade]), [['משה כהן', 88.5, 'ט'], ['Dovid Levy', 92, 'ט']]);
  assert.deepEqual(p.columns.map((c) => c.as), ['name', 'average', 'grade', 'ignored']);
  const f = A.applyImport({}, p);
  assert.deepEqual(A.board(f).map((r) => [r.name, r.avg, r.tests]), [['Dovid Levy', 92, 0], ['משה כהן', 88.5, 0]], 'an average-only student shows, with no tests');
  assert.equal(A.board({ ...f, settings: { minAverage: 90 } }).length, 1);
  // tests + a computed Average column: the tests win and the column is not double counted
  const q = A.parseInput('Name,Average,Test 1,Test 2,Quiz year\nA One,50,90,100,2026');
  assert.deepEqual(q.rows[0].scores, [90, 100]);
  assert.equal(q.rows[0].avg, 50, 'kept on the row, but the student model drops it when scores exist');
  assert.equal(A.normalizeStudent(q.rows[0]).avg, null);
  assert.ok(q.warnings.some((w) => /Quiz year/.test(w.message)), 'a column of non-scores is reported, not an error');
  // the Bochurim-style names with a first and last column and a header further down
  assert.equal(A.parseInput('Class list\nFirst Name,Last Name,Avg\nMoshe,Katz,77').rows[0].name, 'Moshe Katz');
});

test('sheetCsvUrl only ever builds a docs.google.com sheet address', () => {
  assert.equal(A.sheetCsvUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=77'), 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/export?format=csv&gid=77');
  assert.match(A.sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vAbCdEfGhIjKl/pubhtml'), /pub\?output=csv$/);
  for (const bad of ['http://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp', 'https://evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOp', 'https://docs.google.com.evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOp', 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOp', 'file:///etc/passwd', '', 'x']) assert.equal(A.sheetCsvUrl(bad), null, bad);
});

test('fetchSheetCsv: plain-English failures, never partial data', async () => {
  const resp = (status, body, type = 'text/csv') => async () => ({ status, ok: status < 400, headers: { get: () => type }, text: async () => body });
  assert.equal(await fetchSheetCsv('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit', { doFetch: resp(200, 'a,b') }), 'a,b');
  await assert.rejects(fetchSheetCsv('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit', { doFetch: resp(403, '') }), /Anyone with the link/);
  await assert.rejects(fetchSheetCsv('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit', { doFetch: resp(200, '<html>', 'text/html; charset=utf-8') }), /sign-in/);
  await assert.rejects(fetchSheetCsv('https://evil.example/x'), /Google Sheets link/);
});

function memStore(initial = null) {
  let doc = initial; const events = [];
  return { events, store: createAveragesStore({ read: async () => doc, update: async (fn) => { doc = await fn(doc); return doc; }, emit: (t, d) => events.push([t, d]) }) };
}

test('store + syncSheet: replaces the list from the sheet, broadcasts a names-safe nudge, records errors', async () => {
  const { store, events } = memStore();
  await assert.rejects(syncSheet(store, async () => CSV), /Paste a Google Sheets link/);
  await store.mutate(undefined, (f) => ({ ...f, sheet: { ...f.sheet, url: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit' } }));
  const saved = await syncSheet(store, async () => CSV);
  assert.equal(saved.students.length, 4);
  assert.equal(saved.sheet.lastCount, 4);
  assert.equal(saved.sheet.lastError, '');
  assert.equal(events.at(-1)[0], 'averages-update');
  const sent = events.length;
  const again = await syncSheet(store, async () => CSV);
  assert.equal(events.length, sent, 'a sheet with no changes records the sync but does not nudge the screen');
  assert.ok(again.sheet.lastSync);
  assert.equal(await syncSheet(store, async () => `${CSV}New Kid,80,90\n`).then((x) => x.students.length), 5);
  assert.equal(events.length, sent + 1, 'a change does nudge the screen');
  await assert.rejects(syncSheet(store, async () => { throw new Error('Google took too long'); }), /too long/);
  assert.match((await store.read()).sheet.lastError, /too long/);
  assert.equal((await store.read()).students.length, 5, 'a failed sync keeps the old data');
  await assert.rejects(syncSheet(store, async () => 'A B,500'), /not a score/);
});

test('permissions: Full editor can edit averages, Messages-only cannot', async () => {
  const P = await import('../src/shared/permissions.js');
  assert.ok(P.PRESETS.admin.caps.includes('averages.edit'));
  const ids = Object.keys(P.PRESETS);
  const withCap = ids.filter((k) => P.PRESETS[k].caps.includes('averages.edit'));
  assert.ok(withCap.length >= 2 && withCap.length < ids.length, `some roles have it, some do not (${withCap.join(', ')})`);
  assert.ok(!P.PRESETS.messages || !P.PRESETS.messages.caps.includes('averages.edit'));
});

test('live view never gets the names-class averages', async () => {
  const live = await import('../src/server/live.js');
  const src = await (await import('node:fs/promises')).readFile(new URL('../src/server/live.js', import.meta.url), 'utf8');
  assert.ok(!/averages/.test(src.split('VIEWER_KEYS')[1].split(']')[0]), 'averages is not in the viewer allow-list');
  assert.ok(live);
});
