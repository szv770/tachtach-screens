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
  assert.deepEqual(A.parseInput('Moshe Katz\t9th\t95%\t88\t104').rows[0], { name: 'Moshe Katz', grade: '9th', track: '', scores: [95, 88, 104] });
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

test('fmtAvg', () => { assert.equal(A.fmtAvg(94.5), '94.5'); assert.equal(A.fmtAvg(95.04), '95'); assert.equal(A.fmtAvg(94.5, 0), '95'); });

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

test('plan: leaderboard, improved, tracks, then everyone else in equal pages', () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(`Student ${i},${i % 2 ? 'Gemoro' : 'Girsa'},${60 + (i % 40)},${61 + (i % 40)},${70 + (i % 30)}`);
  const f = A.applyImport({ settings: { byTrack: true } }, A.parseInput(`Name,Track,T1,T2,T3\n${rows.join('\n')}`));
  const p = A.plan(f);
  assert.equal(p[0].t, 'top');
  assert.equal(p[0].rows.length, 10);
  assert.ok(p.some((x) => x.t === 'tracks'));
  const lists = p.filter((x) => x.t === 'list');
  assert.equal(lists.reduce((a, x) => a + x.rows.length, 0), 50, 'everyone below the leaderboard, once');
  assert.ok(Math.max(...lists.map((x) => x.rows.length)) - Math.min(...lists.map((x) => x.rows.length)) <= 1, 'equal pages');
  assert.equal(A.plan({ students: [] }).length, 0);
  assert.equal(A.plan(A.applyImport({ settings: { view: 'top' } }, A.parseInput('A B,90,90'))).filter((x) => x.t === 'list').length, 0);
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
  await assert.rejects(syncSheet(store, async () => { throw new Error('Google took too long'); }), /too long/);
  assert.match((await store.read()).sheet.lastError, /too long/);
  assert.equal((await store.read()).students.length, 4, 'a failed sync keeps the old data');
  await assert.rejects(syncSheet(store, async () => 'Name,T1\nA,500'), /not a score/);
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
