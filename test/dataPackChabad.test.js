// Data pack, Chabad.org text edition: planning (special years/days), the resumable polite builder, per-date readers on saved
// pages, "not in the data pack yet" states, quote/tidbit fallbacks, pack upload verification and the admin-only route.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { planTasks, hayomYomKeys, isPsalm119Day, ALL_SECTIONS, isDone } from '../src/shared/packPlan.js';
import { buildPack, compressRanges, verifyPackFiles, bundlePack, unbundlePack } from '../src/shared/dataPackBuild.js';
import { packToCache, quoteLookup, tidbitsLookup, shabbosOnOrAfter, validateWeekly, hayomYomLookup, PACK_LICENCE_NOTE } from '../src/shared/dataPack.js';
import { hebrewDateOf, daysInMonth, hebrewFromFixed, fixedFromISO } from '../src/shared/hebrewCalendar.js';
import { holidayEvents } from '../src/shared/torahReading.js';
import { runFetch, applyResult, emptyState, packFromState, seedFromFiles, loadState, saveState } from '../src/server/packBuilder.js';
import { READERS, SECTION_NOTES } from '../src/fetchers/packSources.js';
import { fetchHayomYomDetailed } from '../src/fetchers/chabad.js';
import { setPackDir, clearPackCache, packStatus, getPackDay, getWeekly, installPackFiles, readPackFiles } from '../src/server/dataPackStore.js';
import { applyLocalDay } from '../src/fetchers/index.js';
import { createDataPackRouter } from '../src/server/routes/dataPack.js';
import { _resetJobForTests, startJob, jobStatus } from '../src/server/packJob.js';
import { canDo } from '../src/shared/permissions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = (n) => ({ html: fs.readFileSync(path.join(here, 'fixtures', 'chabad', n), 'utf8'), via: 'plain' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ttpack2-'));
const noSleep = async () => {};

// ── planning: special years and days ────────────────────────────────────────

test('plan: covers every Hebrew day Hayom Yom needs, incl. both Adars of a leap year and plain Adar', () => {
  const keys = hayomYomKeys('2026-10-25', '2027-12-31');
  const names = new Set(keys.map((k) => k.key));
  // 5787 is a leap year: Adar I has 30 days, Adar II 29
  for (let d = 1; d <= 30; d++) assert.ok(names.has(`Adar I-${d}`), `Adar I-${d}`);
  for (let d = 1; d <= 29; d++) assert.ok(names.has(`Adar II-${d}`), `Adar II-${d}`);
  assert.ok(!names.has('Adar II-30'));
  // plain Adar (5788) is fetched too (within the 3-year horizon) so a later plain year is covered
  for (let d = 1; d <= 29; d++) assert.ok(names.has(`Adar-${d}`), `Adar-${d}`);
  // every key has a representative civil date that really falls on that Hebrew day
  for (const k of keys) { const h = hebrewDateOf(k.iso); assert.equal(`${h.hebrewMonth}-${h.hebrewDay}`, k.key); }
  // 30th of the month: a month key '-30' exists only for 30-day months (Tishrei, Sh'vat, Adar I, Nisan, Sivan, Av, Cheshvan/Kislev in some years)
  assert.ok(names.has('Tishrei-30') && names.has('Sh\'vat-30') && names.has('Adar I-30'));
  assert.ok(!names.has('Tevet-30'), 'Tevet has 29 days'); // Tevet is 29 in every year type
  assert.ok(!names.has('Elul-30'));
  // keys sorted nearest first, and the in-range flag matches the range
  assert.deepEqual(keys.map((k) => k.iso), [...keys.map((k) => k.iso)].sort());
  assert.ok(keys.filter((k) => !k.inRange).every((k) => k.iso > '2027-12-31'));
});

test('plan: 30 Cheshvan and 30 Kislev are only asked for when a year has them (complete / deficient years)', () => {
  // 5787 (2026-27): find out which of the two edge days exist, then check the plan agrees with the calendar
  const names = new Set(hayomYomKeys('2026-10-25', '2029-12-31').map((k) => k.key));
  const has = (y, m) => daysInMonth(y, m) === 30;
  const wantCheshvan = [5787, 5788, 5789, 5790].some((y) => has(y, 8));
  const wantKislev = [5787, 5788, 5789, 5790].some((y) => has(y, 9));
  assert.equal(names.has('Cheshvan-30'), wantCheshvan);
  assert.equal(names.has('Kislev-30'), wantKislev);
});

test('plan: Psalm 119 days are exactly the Hebrew 25th and 26th, nothing else asks for Tehillim', () => {
  const tasks = planTasks({ from: '2026-10-25', to: '2027-12-31', today: '2026-10-25' }).filter((t) => t.section === 'tehillim');
  assert.ok(tasks.length >= 28 && tasks.length <= 32, `${tasks.length}`);
  for (const t of tasks) { const d = hebrewDateOf(t.iso).hebrewDay; assert.ok(d === 25 || d === 26, t.iso); assert.ok(isPsalm119Day(t.iso)); }
});

test('plan: every civil day (Shabbos, Yom Tov, Chol HaMoed, Rosh Chodesh) gets its own chumash/tanya/rambam task', () => {
  const tasks = planTasks({ from: '2026-09-20', to: '2026-10-05', today: '2026-09-20', sections: ['chumash', 'tanya', 'rambam1'] });
  assert.equal(tasks.length, 16 * 3);
  assert.ok(tasks.some((t) => t.iso === '2026-10-03'), 'Shabbos Chol HaMoed Sukkos'); // 2026-10-03: Shabbos
  assert.deepEqual([...new Set(tasks.map((t) => t.section))].sort(), ['chumash', 'rambam', 'tanya']);
  // no feeds / Hayom Yom unless asked for
  assert.ok(!planTasks({ from: '2026-09-20', to: '2026-09-21', today: '2026-09-20', sections: ['chumash'] }).some((t) => t.kind !== 'day'));
});

test('plan: resumable, what is done is skipped; today-only feeds are asked once per run', () => {
  const st = emptyState();
  const all = planTasks({ from: '2026-10-25', to: '2026-10-27', today: '2026-10-25', state: st });
  assert.ok(all.some((t) => t.id === 'feed:quote:2026-10-25') && all.some((t) => t.id === 'feed:tidbits:2026-10-25'));
  applyResult(st, all.find((t) => t.id === 'day:2026-10-26:chumash'), { en: 'x', he: 'y' });
  st.hayomYom['Cheshvan-14'] = null;       // "no entry that day" also counts as done
  const again = planTasks({ from: '2026-10-25', to: '2026-10-27', today: '2026-10-25', state: st });
  assert.equal(again.length, all.length - 2);
  assert.ok(isDone(st, { kind: 'hy', key: 'Cheshvan-14' }));
  // quote/tidbits from a day before are not "done" today
  const nextDay = planTasks({ from: '2026-10-25', to: '2026-10-27', today: '2026-10-26', state: st }).filter((t) => t.kind === 'feed').map((t) => t.id);
  assert.deepEqual(nextDay, ['feed:quote:2026-10-26', 'feed:tidbits:2026-10-26']);
});

// ── the readers, on saved pages ─────────────────────────────────────────────

const pages = (map) => async (url) => {
  for (const [frag, file] of map) if (url.includes(frag)) return file ? page(file) : null;
  return null;
};

test('readers: chumash (EN + HE), Tanya (line + first/last words), footnotes gone, holiday heading kept as is', async () => {
  const getPage = pages([['www.chabad.org/dailystudy/torahreading', 'torahreading-www.html'], ['he.chabad.org/dailystudy/torahreading', 'torahreading-he.html'], ['www.chabad.org/dailystudy/tanya', 'tanya-page.html'], ['he.chabad.org/dailystudy/tanya', null]]);
  const c = await READERS.chumash('2026-10-25', { getPage });
  assert.equal(c.en, 'Parshat Vayeira · 1st Portion\nBereshit 18:1-14');
  assert.equal(c.he, 'פרשת וירא, ראשון (בראשית יח:א-יד)');
  const t = await READERS.tanya('2026-10-25', { getPage });
  assert.equal(t.en, 'Likkutei Amarim, Chapter 5');
  assert.equal(t.he, '');                                  // the Hebrew page is optional
  assert.match(t.firstWords, /^ותנא בראשית ברא/);
  assert.ok(!/\d/.test(t.firstWords + t.lastWords) && !t.firstWords.includes('הרה"ת'));
  const hol = await READERS.chumash('2026-10-04', { getPage: pages([['torahreading', 'torahreading-holiday.html']]) });
  assert.equal(hol.en, 'Sukkot, Day 1 (Vayikra (Leviticus) 22:26-23:44)');   // a Yom Tov reading is not a "Parshat" line: kept verbatim
  // a page that cannot be loaded is an ERROR (retried), a page without a heading is "nothing that day" (null)
  await assert.rejects(READERS.chumash('2026-10-25', { getPage: async () => null }), /could not be loaded/);
  assert.equal(await READERS.chumash('2026-10-25', { getPage: async () => ({ html: '<html><body></body></html>' }) }), null);
});

test('readers: Rambam + Sefer HaMitzvos from one call, chapters parsed; quote and tidbits from the feeds', async () => {
  const torahCalc = async () => ({
    rambam1: { displayEn: 'Issurei Biah - Chapter 6', displayHe: 'איסורי ביאה פרק ו' },
    rambam3: { displayEn: 'Issurei Biah - Chapter 7, Chapter 8, Chapter 9', displayHe: 'איסורי ביאה פרקים ז-ט' },
    seferHamitzvot: { displayEn: 'Positive Commandment 6', displayHe: 'מצות עשה ו' },
  });
  const r = await READERS.rambam('2026-10-25', { torahCalc });
  assert.deepEqual(r.rambam1.chaptersArabic, [6]);
  assert.deepEqual(r.rambam3.chaptersArabic, [7, 8, 9]);
  assert.equal(r.seferHamitzvot.en, 'Positive Commandment 6');
  await assert.rejects(READERS.rambam('2026-10-25', { torahCalc: async () => null }), /TorahCalc/);
  assert.deepEqual(await READERS.dailyQuote('x', { dailyQuote: async () => ({ text: 'Q', source: 'S' }) }), { text: 'Q', source: 'S' });
  const tb = await READERS.tidbits('x', { tidbits: async () => [{ title: 'T', description: 'D', link: 'L', extra: 1 }, { title: 'no desc', description: '', link: '' }] });
  assert.deepEqual(tb, { items: [{ title: 'T', description: 'D', link: 'L' }] });
});

test('Hayom Yom: a day with no entry is "empty", a changed/blocked page is an error (never stored as "no entry")', async () => {
  assert.equal((await fetchHayomYomDetailed('2026-10-25', { getPage: async () => page('hayomyom-footnotes.html') })).status, 'ok');
  assert.equal((await fetchHayomYomDetailed('2026-10-25', { getPage: async () => page('hayomyom-empty.html') })).status, 'empty');
  assert.equal((await fetchHayomYomDetailed('2026-10-25', { getPage: async () => page('hayomyom-wrongpage.html') })).status, 'error');
  assert.equal((await fetchHayomYomDetailed('2026-10-25', { getPage: async () => null })).status, 'error');
  assert.equal(await READERS.hayomYom('2026-10-25', { getPage: async () => page('hayomyom-empty.html') }), null);
  const ok = await READERS.hayomYom('2026-10-25', { getPage: async () => page('hayomyom-footnotes.html') });
  assert.ok(ok.en.startsWith('Today is the 10th of Cheshvan.') && !/\d(?=[ .])\b/.test(ok.he));
});

// ── the builder: polite, retrying, resumable ────────────────────────────────

function mockCtx(over = {}) {
  const calls = [];
  const ctx = { calls };
  const wrap = (name, fn) => async (...a) => { calls.push(name); return fn(...a); };
  ctx.getPage = async () => null;
  ctx.hayomYom = wrap('hy', async (iso) => ({ status: 'ok', hayomEn: `en ${iso}`, hayomHe: `he ${iso}` }));
  ctx.torahCalc = wrap('tc', async () => ({ rambam1: { displayEn: 'R - Chapter 1', displayHe: 'ר' }, rambam3: null, seferHamitzvot: null }));
  ctx.dailyQuote = wrap('quote', async () => ({ text: 'A quote', source: 'The Rebbe' }));
  ctx.tidbits = wrap('tidbits', async () => [{ title: 'T', description: 'D', link: 'https://www.chabad.org/x' }]);
  return Object.assign(ctx, over);
}

test('builder: retries with back-off, waits between requests, stops when blocked, and carries on after', async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  const st = emptyState();
  let fail = 0;
  const ctx = mockCtx({ hayomYom: async () => { fail++; throw new Error('HTTP 403'); } });
  const r = await runFetch({ from: '2026-10-25', to: '2026-10-25', sections: ['hayomYom'], state: st, ctx, sleep, delayMs: 100, retries: 3, maxConsecutiveFailures: 4, today: '2026-10-25' });
  assert.equal(r.status, 'blocked');
  assert.equal(r.failed, 4);
  assert.equal(fail, 4 * 3, '3 attempts per task');
  assert.ok(waits.some((w) => w >= 140) && waits.every((w) => w <= 100 * 8 * 1.31), 'back-off doubles, with jitter');
  assert.equal(Object.keys(st.hayomYom).length, 0, 'a failed page is never stored as "no entry"');
  assert.equal(Object.keys(st.failed).length, 4);
  // later (block lifted): the same state carries on, failed tasks are tried again
  const ok = mockCtx();
  const r2 = await runFetch({ from: '2026-10-25', to: '2026-10-25', sections: ['hayomYom'], state: st, ctx: ok, sleep, delayMs: 10, today: '2026-10-25' });
  assert.equal(r2.status, 'done');
  assert.equal(r2.failed, 0);
  assert.ok(st.hayomYom['Cheshvan-14'].en.startsWith('en 2026-'));
  assert.equal(Object.keys(st.failed).length, 0);
});

test('builder: polite pacing (a delay between every request group) and progress reports', async () => {
  const waits = []; const prog = [];
  const st = emptyState();
  const r = await runFetch({ from: '2026-10-25', to: '2026-10-27', sections: ['chumash', 'rambam1', 'dailyQuote'], state: st, ctx: mockCtx({ getPage: async () => page('torahreading-www.html') }), sleep: async (ms) => { waits.push(ms); }, delayMs: 1000, today: '2026-10-25', onProgress: (p) => prog.push(p) });
  assert.equal(r.total, 1 + 3 + 3);
  assert.equal(waits.length, r.total - 1, 'one pause between each pair of request groups');
  assert.ok(waits.every((w) => w >= 700 && w <= 1300));
  assert.equal(prog.at(-1).done, r.total);
  assert.ok(st.days['2026-10-25'].dailyQuote.text === 'A quote' && st.quotePool.length === 1);
});

test('builder: cancel keeps progress on disk; a second run resumes without repeating work; "no entry" days become explicit nulls', async () => {
  const dir = tmp();
  try {
    const signal = { aborted: false };
    const st = emptyState();
    const ctx = mockCtx();
    let n = 0;
    ctx.hayomYom = async (iso) => { n++; if (n === 5) signal.aborted = true; return n === 2 ? { status: 'empty' } : { status: 'ok', hayomEn: `en ${n}`, hayomHe: `he ${n}` }; };
    const r1 = await runFetch({ from: '2026-10-25', to: '2026-10-25', sections: ['hayomYom'], state: st, ctx, sleep: noSleep, save: (s) => saveState(dir, s), saveEvery: 2, signal, today: '2026-10-25' });
    assert.equal(r1.status, 'cancelled');
    const saved = await loadState(dir);
    const done1 = Object.keys(saved.hayomYom).length;
    assert.ok(done1 >= 4 && done1 < 414, `${done1}`);
    assert.ok(Object.values(saved.hayomYom).includes(null), 'the empty day is stored as an explicit no-entry');
    // resume: only the rest is fetched
    let n2 = 0;
    const r2 = await runFetch({ from: '2026-10-25', to: '2026-10-25', sections: ['hayomYom'], state: saved, ctx: mockCtx({ hayomYom: async (iso) => { n2++; return { status: 'ok', hayomEn: 'e', hayomHe: 'h' }; } }), sleep: noSleep, today: '2026-10-25' });
    assert.equal(r2.status, 'done');
    assert.equal(n2 + done1, 414);   // every key fetched exactly once overall
    assert.equal(Object.keys(saved.hayomYom).length, 414);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('builder: result -> verified pack with manifest credit, licence note, coverage report listing missing dates', () => {
  const st = emptyState();
  for (const t of planTasks({ from: '2026-10-25', to: '2026-10-31', today: '2026-10-25' })) {
    if (t.kind === 'hy') applyResult(st, t, { en: `e ${t.key}`, he: `h ${t.key}` });
    if (t.section === 'chumash' && t.iso !== '2026-10-28') applyResult(st, t, { en: `c ${t.iso}`, he: 'ח' });
    if (t.id === 'feed:quote:2026-10-25') applyResult(st, t, { text: 'Q1', source: 'S' });
    if (t.id === 'feed:tidbits:2026-10-25') applyResult(st, t, { items: [{ title: 'T', description: 'D', link: 'L' }] });
  }
  st.hayomYom['Cheshvan-30'] = null;
  const b = packFromState(st, { from: '2026-10-25', to: '2026-10-31', built: '2026-10-25T00:00:00Z' });
  assert.deepEqual(b.errors, []);
  assert.equal(b.manifest.credit, 'Chabad.org');
  assert.equal(b.manifest.licence, PACK_LICENCE_NOTE);
  assert.equal(b.manifest.sections.hayomYom.licence, 'Chabad.org — used with credit');
  assert.ok(b.manifest.sections.chumash.source.includes('Chabad.org'));
  assert.deepEqual(b.report.sections.chumash.missingRanges, [['2026-10-28', '2026-10-28']]);
  assert.equal(b.report.sections.chumash.have, 6);
  assert.equal(b.report.sections.dailyQuote.pooled, 6, 'days without their own quote use the pool');
  assert.equal(b.report.sections.tidbits.of, 1);
  assert.ok(b.files['weekly.json'] && b.files['perpetual.json']);
  assert.ok(JSON.parse(b.files['manifest.json']).coverage.sections.chumash.missing === 1);
  assert.deepEqual(compressRanges(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']), [['2026-10-01', '2026-10-02'], ['2026-10-05', '2026-10-07']]);
  // refusing a section without a licence note still holds
  assert.ok(buildPack({ from: '2026-10-25', to: '2026-10-26', days: { '2026-10-25': { dailyQuote: { text: 'x', source: '' } } }, sources: {} }).errors.some((e) => /dailyQuote/.test(e)));
  // every section a builder can produce has a note
  for (const s of ALL_SECTIONS) assert.ok(SECTION_NOTES[s]?.source && SECTION_NOTES[s]?.licence, s);
});

test('refresh seeds from the installed pack and only fetches what is new', () => {
  const st = emptyState();
  for (const t of planTasks({ from: '2026-10-25', to: '2026-10-26', today: '2026-10-25' })) {
    if (t.kind === 'hy') applyResult(st, t, { en: 'e', he: 'h' });
    if (t.section === 'chumash') applyResult(st, t, { en: 'c', he: 'ח' });
  }
  const b = packFromState(st, { from: '2026-10-25', to: '2026-10-26', sections: ['hayomYom', 'chumash'] });
  const seeded = seedFromFiles(emptyState(), b.files);
  const next = planTasks({ from: '2026-10-25', to: '2026-10-28', today: '2026-10-27', state: seeded, sections: ['hayomYom', 'chumash'] });
  assert.deepEqual(next.map((t) => t.id).filter((i) => i.startsWith('day:')), ['day:2026-10-27:chumash', 'day:2026-10-28:chumash']);
  assert.ok(!next.some((t) => t.kind === 'hy' && st.hayomYom[t.key]));
});

// ── pack -> screen: visible "not in the data pack yet" ─────────────────────

const HY = { en: 'Hayom Yom text', he: 'טקסט' };
test('pack -> cache: missing sections become explicit missing entries (never yesterday as today), credit info, quote pool, tidbits by week and by portion', () => {
  const perpetual = { format: 1, hayomYom: { 'Cheshvan-14': HY }, quotePool: [{ text: 'P0', source: 's0' }, { text: 'P1', source: 's1' }] };
  const weekly = { format: 1, tidbits: { '2025-11-01': { parsha: 'Parashat Vayera', items: [{ title: 'Old year', description: 'd', link: 'l' }] } } };
  const manifest = { credit: 'Chabad.org', licence: PACK_LICENCE_NOTE, from: '2026-10-01', to: '2027-12-31' };
  const existing = { limudim: { chumash: 'yesterday', chumashHe: 'אתמול', tehillim: 'Chapters 72-76', tanyaFirstWords: 'old' }, rambam1: { displayEn: 'old' }, hayomYom: { en: 'yesterday' } };
  const r = packToCache({ iso: '2026-10-25', hebrew: { hebrewMonth: 'Cheshvan', hebrewDay: 14 }, day: { rambam1: { en: 'R', he: 'ר', chaptersArabic: [6] } }, perpetual, weekly, manifest, existing, nowISO: 'n' });
  assert.equal(r.patch.hayomYom.en, 'Hayom Yom text');
  assert.equal(r.patch.limudim.chumash, '', 'yesterday\'s chumash is cleared');
  assert.equal(r.patch.limudim.tehillim, 'Chapters 72-76', 'the calculated Tehillim is kept');
  assert.deepEqual(r.patch.limudim.packMissing, ['chumash', 'tanya']);
  assert.equal(r.patch.limudim.tanyaFirstWords, '');
  assert.equal(r.patch.rambam3.missing, true);
  assert.equal(r.patch.seferHamitzvot.missing, true);
  assert.equal(r.patch.dailyQuote.pooled, true);
  assert.ok(['P0', 'P1'].includes(r.patch.dailyQuote.text));
  assert.equal(r.patch.parshaTidbits.items[0].title, 'Old year', 'same portion, another year');
  assert.deepEqual(r.missing.sort(), ['chumash', 'rambam3', 'seferHamitzvot', 'tanya']);
  assert.deepEqual([r.patch.packInfo.credit, r.patch.packInfo.note, r.patch.packInfo.to], ['Chabad.org', PACK_LICENCE_NOTE, '2027-12-31']);
  // nothing at all: every section is an explicit missing entry
  const n = packToCache({ iso: '2026-10-25', hebrew: { hebrewMonth: 'Cheshvan', hebrewDay: 14 }, day: null, perpetual: null, weekly: null, existing: {}, nowISO: 'n' });
  assert.equal(n.patch.hayomYom.missing, true);
  assert.equal(n.patch.dailyQuote.missing, true);
  assert.equal(n.patch.parshaTidbits.missing, true);
  assert.ok(n.missing.includes('hayomYom') && n.missing.includes('tidbits') && n.missing.includes('dailyQuote'));
  assert.equal(n.patch.packInfo.credit, 'Chabad.org');
  // the pooled quote is the same all day and changes day to day
  assert.equal(quoteLookup(null, perpetual, '2026-10-25').text, quoteLookup(null, perpetual, '2026-10-25').text);
  assert.notEqual(quoteLookup(null, perpetual, '2026-10-25').text, quoteLookup(null, perpetual, '2026-10-26').text);
  assert.equal(quoteLookup({ dailyQuote: { text: 'own', source: 's' } }, perpetual, '2026-10-25').pooled, false);
  assert.equal(shabbosOnOrAfter('2026-10-25'), '2026-10-31');
  assert.equal(shabbosOnOrAfter('2026-10-31'), '2026-10-31');
  assert.deepEqual(validateWeekly({ format: 1, tidbits: { '2026-10-30': { items: [] } } }).length, 1, 'a key that is not a Shabbos is refused');
});

test('applyLocalDay: with no pack, today shows "not in pack" instead of old text; with a pack the day is filled', async () => {
  const dir = tmp();
  try {
    setPackDir(path.join(dir, 'none'));
    const cache = { hayomYom: { en: 'old text', he: 'ישן' }, limudim: { chumash: 'old', tehillim: '', chumashHe: '' } };
    await applyLocalDay(cache, { now: '2026-10-25T08:00:00Z', localDate: '2026-10-25', parsha: null });
    assert.equal(cache.hayomYom.missing, true);
    assert.equal(cache.hayomYom.en, '');
    assert.equal(cache.limudim.packMissing.includes('chumash'), true);
    assert.equal(cache.limudim.tehillim, 'Chapters 72-76');
    assert.equal(cache.packInfo.credit, 'Chabad.org');

    const st = emptyState();
    st.hayomYom['Cheshvan-14'] = { en: 'HY', he: 'הי' };
    st.days['2026-10-25'] = { chumash: { en: 'C', he: 'ח' }, tanya: { en: 'T', he: 'ת', firstWords: 'a', lastWords: 'b' }, dailyQuote: { text: 'Q', source: 'S' } };
    st.weekly['2026-10-31'] = { parsha: 'Parashat Vayera', items: [{ title: 'T', description: 'D', link: 'L' }] };
    const b = packFromState(st, { from: '2026-10-25', to: '2026-11-30' });
    assert.deepEqual(b.errors, []);
    const info = await installPackFiles(b.files);
    assert.equal(info.credit, 'Chabad.org');
    setPackDir(path.join(dir, 'none')); // reset
    const real = path.join(dir, 'real'); setPackDir(real);
    await installPackFiles(b.files);
    assert.equal((await getPackDay('2026-10-25')).chumash.en, 'C');
    assert.equal((await getWeekly()).tidbits['2026-10-31'].items.length, 1);
    const c2 = {};
    await applyLocalDay(c2, { now: 'n', localDate: '2026-10-25', parsha: { name: 'P' } });
    assert.equal(c2.hayomYom.en, 'HY');
    assert.equal(c2.dailyQuote.text, 'Q');
    assert.equal(c2.parshaTidbits.items[0].title, 'T');
    assert.equal(c2.limudim.chumash, 'C');
    assert.equal(c2.limudim.packMissing, undefined);
    assert.equal(c2.packInfo.credit, 'Chabad.org');
    const st2 = await packStatus('2026-10-25');
    assert.equal(st2.daysLeft, 36);
    assert.equal(st2.level, 'soon', 'under 60 days of cover');
    assert.equal((await packStatus('2026-10-10')).daysLeft, 51);
  } finally { setPackDir(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('coverage level: ok / soon (under 60 days) / expired', async () => {
  const dir = tmp();
  try {
    setPackDir(dir);
    const b = buildPack({ from: '2026-10-25', to: '2027-01-31', perpetual: { hayomYom: { 'Cheshvan-14': HY } }, sources: { hayomYom: { source: 's', licence: 'l' } } });
    await installPackFiles(b.files);
    assert.equal((await packStatus('2026-10-25')).level, 'ok');       // 98 days
    assert.equal((await packStatus('2026-12-10')).level, 'soon');     // 52 days
    assert.equal((await packStatus('2026-12-01')).level, 'ok');       // 61 days
    assert.equal((await packStatus('2027-02-05')).level, 'expired');
    assert.ok((await packStatus('2026-10-25')).coverage.civilDays === 99);
  } finally { setPackDir(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

// ── upload verification + the admin-only route ─────────────────────────────

function goodFiles() {
  const b = buildPack({ from: '2026-10-25', to: '2026-12-31', perpetual: { hayomYom: { 'Cheshvan-14': HY, 'Cheshvan-15': null } }, days: { '2026-10-25': { chumash: { en: 'C', he: 'ח' } } }, sources: { hayomYom: SECTION_NOTES.hayomYom, chumash: SECTION_NOTES.chumash } });
  assert.deepEqual(b.errors, []);
  return b.files;
}

test('verifyPackFiles: accepts a built pack, rejects tampering, strangers and odd names', () => {
  const f = goodFiles();
  assert.equal(verifyPackFiles(f).ok, true);
  assert.equal(verifyPackFiles({ ...f, 'days-2026-10.json': f['days-2026-10.json'].replace('"C"', '"X"') }).ok, false);
  assert.equal(verifyPackFiles({ ...f, 'evil.js': 'x' }).ok, false);
  assert.equal(verifyPackFiles({ ...f, '../manifest.json': '{}' }).ok, false);
  assert.equal(verifyPackFiles({ ...f, 'extra.json': '{}' }).ok, false);
  const { 'perpetual.json': _p, ...missing } = f;
  assert.equal(verifyPackFiles(missing).ok, false);
  assert.equal(verifyPackFiles({}).ok, false);
  const m = JSON.parse(f['manifest.json']); m.format = 9;
  assert.equal(verifyPackFiles({ ...f, 'manifest.json': JSON.stringify(m) }).ok, false);
  assert.equal(unbundlePack('nope').files, null);
  assert.equal(unbundlePack(JSON.stringify({ format: 1, kind: 'other', files: {} })).files, null);
  assert.deepEqual(unbundlePack(bundlePack(f)).files, f);
});

async function withServer(router, user, fn) {
  const app = express();
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/system/data-pack', router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/system/data-pack`;
  try { await fn(base); } finally { await new Promise((r) => srv.close(r)); }
}

test('route: admin-only; upload installs a verified pack (also gzipped), refuses bad ones; status shows cover; download round-trips', async () => {
  const dir = tmp();
  try {
    setPackDir(path.join(dir, 'pack'));
    _resetJobForTests();
    let installed = 0;
    const router = createDataPackRouter({ afterInstall: async () => { installed++; } });
    const body = bundlePack(goodFiles());
    await withServer(router, { role: 'editor' }, async (base) => {
      assert.equal((await fetch(base)).status, 403);
      assert.equal((await fetch(`${base}/upload`, { method: 'POST', body })).status, 403);
      assert.equal((await fetch(`${base}/build`, { method: 'POST' })).status, 403);
    });
    await withServer(router, { role: 'admin' }, async (base) => {
      const s0 = await (await fetch(base)).json();
      assert.equal(s0.pack.present, false);
      assert.equal((await fetch(`${base}/upload`, { method: 'POST', body: '' })).status, 400);
      assert.equal((await fetch(`${base}/upload`, { method: 'POST', body: 'not json' })).status, 400);
      const bad = bundlePack({ ...goodFiles(), 'x.sh': 'rm -rf /' });
      assert.equal((await fetch(`${base}/upload`, { method: 'POST', body: bad, headers: { 'Content-Type': 'application/octet-stream' } })).status, 400);
      assert.equal(fs.existsSync(path.join(dir, 'pack')), false, 'a refused pack writes nothing');
      const ok = await fetch(`${base}/upload`, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });
      assert.equal(ok.status, 200);
      assert.equal(installed, 1);
      const s1 = await (await fetch(base)).json();
      assert.equal(s1.pack.present, true);
      assert.equal(s1.pack.to, '2026-12-31');
      assert.ok(['ok', 'soon', 'expired'].includes(s1.pack.level));
      assert.equal(s1.pack.credit, 'Chabad.org');
      const gz = await fetch(`${base}/upload`, { method: 'POST', body: gzipSync(Buffer.from(body)), headers: { 'Content-Type': 'application/octet-stream' } });
      assert.equal(gz.status, 200);
      const dl = await (await fetch(`${base}/download`)).text();
      assert.deepEqual(unbundlePack(dl).files, goodFiles_cached(body));
      assert.equal((await fetch(`${base}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ months: 3 }) })).status, 400);
    });
    assert.deepEqual(fs.readdirSync(dir).sort(), ['pack'], 'no temp folders left behind');
  } finally { setPackDir(null); fs.rmSync(dir, { recursive: true, force: true }); }
});
const goodFiles_cached = (body) => unbundlePack(body).files;

test('route: the build job runs in the background with progress, can be cancelled, installs the result', async () => {
  const dir = tmp();
  try {
    setPackDir(path.join(dir, 'pack'));
    _resetJobForTests();
    const ctx = mockCtx();
    const r = startJob({ months: 14, sections: ['dailyQuote', 'tidbits'], ctx, sleep: noSleep, delayMs: 1 });
    assert.equal(r.started, true);
    assert.equal(startJob({}).started, false, 'one build at a time');
    await r.done;
    const st = jobStatus();
    assert.equal(st.state, 'done', JSON.stringify(st));
    assert.ok(st.total === 2 && st.ok === 2);
    assert.equal((await packStatus(st.from)).present, true);
    assert.ok((await readPackFiles())['weekly.json']);
    // cancel
    _resetJobForTests();
    const slow = mockCtx({ hayomYom: async () => ({ status: 'ok', hayomEn: 'a', hayomHe: 'b' }) });
    let cancelled = 0;
    const j2 = startJob({ months: 14, sections: ['hayomYom'], ctx: slow, sleep: async () => { if (++cancelled === 3) (await import('../src/server/packJob.js')).cancelJob(); } });
    await j2.done;
    assert.equal(jobStatus().state, 'cancelled');
  } finally { setPackDir(null); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('permissions: everything under /api/system/data-pack is admin-only', () => {
  for (const [m, p] of [['GET', '/api/system/data-pack'], ['POST', '/api/system/data-pack/upload'], ['POST', '/api/system/data-pack/build'], ['GET', '/api/system/data-pack/download'], ['POST', '/api/system/data-pack/build/cancel']]) {
    assert.equal(canDo('editor', m, p), false, `${m} ${p}`);
    assert.equal(canDo({ role: 'editor', preset: 'full' }, m, p), false);
    assert.equal(canDo('admin', m, p), true);
  }
});
