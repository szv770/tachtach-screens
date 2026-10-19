#!/usr/bin/env node
/**
 * Programmatic kiosk checks (no screenshots) for the attention stages, the up-next countdown,
 * and the Quick time / Sicha layouts. Run against a THROWAWAY copy of the app, never real data:
 *   node scripts/kiosk-stage-audit.mjs http://localhost:3100
 * Needs Playwright (NODE_PATH or /opt/node-tools) and PLAYWRIGHT_BROWSERS_PATH / chromium at
 * /opt/pw-browsers/chromium. It fakes the clock with page.clock.setFixedTime and injects
 * schedule/announcements through a route on /api/state. Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
import { toItem, STRESS, GENERIC } from '../src/shared/takeoverSamples.js';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3100';
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open(canvas, { time, patch }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    patch(j);
    j.settings = { ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme: j.settings?.theme || 'midnight' };
    await route.fulfill({ response: r, json: j });
  });
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  return { page, ctx };
}
const T = (h, m, s = 0) => new Date(2026, 9, 19, h, m, s);

for (const canvas of ['land', 'port']) {
  // ── stages + up-next countdown ────────────────────────────────────────────
  const cats = [{ id: 'learning', name: 'Learning', stages: { inSession: true } }, { id: 'meals', name: 'Meals' }];
  const entries = [
    { id: 's', name: 'Seder', nameHe: 'סדר', time: '09:00', endTime: '09:45', category: 'learning', alertBefore: 5, enabled: true },
    { id: 'n', name: 'Night', time: '23:30', endTime: '00:30', category: 'learning', alertBefore: 5, enabled: true },
  ];
  const sched = (j, extra = {}) => { j.schedule = { entries, categories: cats }; j.scheduleDates = {}; j.settings = { ...j.settings, ...extra }; j.announcements = []; j.countdown = null; };
  const probe = (p) => p.evaluate(() => ({
    started: document.querySelector('[data-stage=started]')?.textContent || null,
    session: document.querySelector('[data-stage=session]')?.textContent || null,
    eta: document.querySelector('[data-upnext-eta]')?.dataset.upnextEta || null,
    etaText: document.querySelector('[data-upnext-eta]')?.textContent || null,
  }));
  let o = await open(canvas, { time: T(9, 1), patch: (j) => sched(j) });
  let r = await probe(o.page);
  check(`${canvas} 09:01 just started banner`, /Seder just started/.test(r.started || '') && /סדר/.test(r.started), JSON.stringify(r.started));
  check(`${canvas} 09:01 in-session badge`, /Now in session/i.test(r.session || '') && /ends\s*9:45\s*AM/.test(r.session || ''), JSON.stringify(r.session));
  await o.ctx.close();
  o = await open(canvas, { time: T(9, 10), patch: (j) => sched(j) });
  r = await probe(o.page);
  check(`${canvas} 09:10 banner gone, badge stays`, !r.started && !!r.session);
  await o.ctx.close();
  o = await open(canvas, { time: T(9, 50), patch: (j) => sched(j) });
  r = await probe(o.page);
  check(`${canvas} 09:50 nothing`, !r.started && !r.session);
  await o.ctx.close();
  o = await open(canvas, { time: T(0, 10), patch: (j) => sched(j) });
  r = await probe(o.page);
  check(`${canvas} 00:10 yesterday's 23:30 block still in session`, /Night/.test(r.session || '') && /ends\s*12:30\s*AM/.test(r.session || ''), JSON.stringify(r.session));
  await o.ctx.close();
  o = await open(canvas, { time: T(8, 57, 30), patch: (j) => sched(j, { rail: { upNextMinutes: 5, upNextCountdown: true } }) });
  r = await probe(o.page);
  check(`${canvas} up-next live countdown`, r.eta === 'live' && /2:30/.test(r.etaText || ''), JSON.stringify(r));
  await o.ctx.close();
  o = await open(canvas, { time: T(8, 57, 30), patch: (j) => sched(j) });
  r = await probe(o.page);
  check(`${canvas} up-next default unchanged (minutes)`, r.eta === 'min', JSON.stringify(r));
  await o.ctx.close();

  // ── takeover layouts ──────────────────────────────────────────────────────
  const take = (item) => (j) => { j.announcements = [item]; j.countdown = null; };
  const metrics = (p) => p.evaluate(() => {
    const lyt = document.querySelector('.tkr .lyt');
    const nm = document.querySelector('.tkr .qt .nm'); const he = nm?.querySelector('.he'), en = nm?.querySelector('.en');
    const where = document.querySelector('.tkr .qt .where'); const body = document.querySelector('.tkr .sc .body, .tkr .lt .body');
    return {
      fitsBox: lyt ? lyt.scrollHeight <= lyt.clientHeight + 4 : null,
      nmHe: he ? parseFloat(getComputedStyle(he).fontSize) : 0, nmEn: en ? parseFloat(getComputedStyle(en).fontSize) : 0,
      nmStack: nm ? nm.classList.contains('stack') : null, where: where ? parseFloat(getComputedStyle(where).fontSize) : 0,
      cd: document.querySelector('.tkr .cd')?.textContent || null,
      body: body ? parseFloat(getComputedStyle(body).fontSize) : 0, pages: body ? +body.dataset.pages : 0,
      bodyFits: body ? body.scrollHeight <= body.clientHeight + 1 : null, bodyText: body ? body.textContent.length : 0,
    };
  });
  const qs = {};
  for (const len of ['s', 'm', 'l']) {
    const o2 = await open(canvas, { time: T(10, 0), patch: take(toItem('classic', 'quick', STRESS.quick[len])) });
    qs[len] = await metrics(o2.page); await o2.ctx.close();
    check(`${canvas} quick ${len} fits its box`, qs[len].fitsBox === true, JSON.stringify(qs[len]));
  }
  check(`${canvas} quick: short name is larger than a long one`, qs.s.nmEn > qs.l.nmEn || qs.s.nmHe > qs.l.nmHe, `${qs.s.nmHe}/${qs.l.nmHe}`);
  check(`${canvas} quick: short name bigger than the old 90px base`, qs.s.nmHe > 95 || qs.s.nmEn > 82, JSON.stringify(qs.s));
  check(`${canvas} quick: single time shows the countdown`, /^starts in (\d+ h|\d+:\d\d)/.test(qs.m.cd || ''), JSON.stringify(qs.m.cd));
  const sm = STRESS.quick.m; const shortWhere = await open(canvas, { time: T(10, 0), patch: take(toItem('classic', 'quick', { ...sm, where: ['Zal', 'זאל'] })) });
  const sw = await metrics(shortWhere.page); await shortWhere.ctx.close();
  check(`${canvas} quick: short location is larger than long`, sw.where > qs.l.where, `${sw.where} vs ${qs.l.where}`);

  const ss = {};
  for (const len of ['s', 'm', 'l']) {
    const o2 = await open(canvas, { time: T(10, 0), patch: take(toItem('classic', 'sicha', STRESS.sicha[len])) });
    ss[len] = await metrics(o2.page); await o2.ctx.close();
  }
  check(`${canvas} sicha short renders large`, ss.s.body >= 60 && ss.s.pages === 1 && ss.s.bodyFits, JSON.stringify(ss.s));
  check(`${canvas} sicha shrinks before paginating (medium one page, smaller than short)`, ss.m.body <= ss.s.body && ss.m.bodyFits, JSON.stringify(ss.m));
  check(`${canvas} sicha long paginates at the base size, nothing clipped`, ss.l.pages > 1 && ss.l.body > 0 && ss.l.bodyFits, JSON.stringify(ss.l));

  const MID = 'Come into the teivah, you and all your household. When the floodwaters of daily life rise, a person is told: come into the word, and bring your whole household with you.';
  const o3 = await open(canvas, { time: T(10, 0), patch: take(toItem('classic', 'sicha', { ...GENERIC.sicha, body: MID })) });
  const sMid = await metrics(o3.page); await o3.ctx.close();
  check(`${canvas} sicha mid-length: one page, larger than base, smaller than short`, sMid.pages === 1 && sMid.bodyFits && sMid.body > 38 && sMid.body <= ss.s.body, JSON.stringify(sMid));

  // letters as the admin paste / AI flows build them (content.letter, body paragraphs split by blank lines)
  const letterItem = (letter) => { const it = toItem('classic', 'letter', GENERIC.letter); it.content = { letter }; return it; };
  const letters = {
    english: { date: 'Oct 19, 2026', dateHe: '', salutation: 'Greeting and blessing!', body: 'In reply to your letter.\n\nThe Rebbe wrote that every Jew can bring light into the world, in learning and in kindness.\n\nWith blessing for good news.', signature: 'With blessing', source: 'Igros Kodesh', sourceHe: '' },
    hebrewLong: { date: '', dateHe: 'ט״ו מרחשון, ה׳תשט״ז', salutation: 'שלום וברכה!', body: Array.from({ length: 6 }, () => GENERIC.letter.body).join('\n\n'), signature: '', source: '', sourceHe: 'אגרות קודש' },
    bare: { date: '', dateHe: '', salutation: '', body: 'מכתב קצר ללא כותרת וללא חתימה.', signature: '', source: '', sourceHe: '' },
  };
  for (const [name, l] of Object.entries(letters)) {
    const o4 = await open(canvas, { time: T(10, 0), patch: take(letterItem(l)) });
    const lm2 = await metrics(o4.page);
    const fam = await o4.page.evaluate(() => { const b = document.querySelector('.tkr .lt .body'); return b ? getComputedStyle(b).direction + '/' + getComputedStyle(b).textAlign : ''; });
    await o4.ctx.close();
    check(`${canvas} letter ${name}: renders, fits, nothing clipped`, lm2.fitsBox === true && lm2.bodyFits === true && lm2.body > 0, JSON.stringify(lm2) + fam);
    if (name === 'english') check(`${canvas} letter english reads left-to-right`, /^ltr\/(left|start)/.test(fam), fam);
    if (name === 'hebrewLong') check(`${canvas} letter hebrewLong paginates`, lm2.pages > 1, JSON.stringify(lm2));
  }

  const lt = await open(canvas, { time: T(10, 0), patch: take(toItem('classic', 'letter', GENERIC.letter)) });
  const lm = await metrics(lt.page); await lt.ctx.close();
  check(`${canvas} letter fits`, lm.bodyFits === true && lm.body > 0, JSON.stringify(lm));
}
await browser.close();
console.log(`\n${checks} checks, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
