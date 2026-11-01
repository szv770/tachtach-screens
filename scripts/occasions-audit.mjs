#!/usr/bin/env node
/**
 * Programmatic checks of the Countdown page (OccasionSlide.jsx) in every countdown form with the worst content.
 * Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR with one admin user), never real data:
 *   TACHTACH_DATA_DIR=$(mktemp -d) PORT=3100 node server.js &   node scripts/occasions-audit.mjs http://localhost:3100 [--shots DIR] [--only TAG]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock and the zone
 * (America/New_York) and injects the occasions document + slides + location through a route on /api/state.
 * Checks, at 1600x900, 900x1600 and 3840x2160 (4K): the page renders in the expected form, nothing clips or leaves the
 * panel, text >= 24 canvas px, the countdown numerals are big, the explanation shows only with a source, the zero
 * moment's confetti is gone and nothing runs after it settled, Hebrew-only / English-only, an approximate time says '~'.
 * Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

const LONG_EN = 'The Annual Yeshiva Dinner and Siyum Celebration of the Year'.slice(0, 60);
const LONG_HE = 'סעודת הסיום השנתית הגדולה של הישיבה הקדושה והתמימים יחד'.slice(0, 60);
const X_EN = Array.from({ length: 12 }, () => 'A long explanation sentence with real words in it.').join(' ').slice(0, 600);
const X_HE = Array.from({ length: 12 }, () => 'משפט ארוך של הסבר עם מילים אמיתיות בתוכו.').join(' ').slice(0, 600);
const SRC = 'Sefer Sample, volume 3, page 120, a long source line written out in full for the test'.slice(0, 140);
const EV_EN = 'Farbrengen at 8:30 PM in the main hall with the whole yeshiva, refreshments served'.slice(0, 120);
const EV_HE = 'התוועדות בשעה 8:30 בערב באולם הגדול עם כל הישיבה, כיבוד קל'.slice(0, 120);

const starter = (o) => ({ on: true, rule: { kind: 'hebrew', month: 9, day: 19 }, ...o });
const RC = { id: 'rc', nameEn: 'Rosh Chodesh Kislev', nameHe: 'ראש חודש כסלו', starter: 'rc-kislev', rule: { kind: 'roshChodesh', month: 9 }, zeroKey: 'chodeshTov', style: 'chassidic' };
const YT = starter({ id: 'yt', nameEn: 'Yud-Tes Kislev', nameHe: 'י״ט כסלו', starter: 'yud-tes-kislev', zeroKey: 'gutYomTov', eventEn: 'Farbrengen 8 PM, main hall', eventHe: 'התוועדות 8 בערב' });
const CH = { id: 'ch', nameEn: 'Chanukah', nameHe: 'חנוכה', rule: { kind: 'hebrew', month: 9, day: 25 }, days: 8, zeroKey: 'chanukah' };
const BIG = { id: 'big', nameEn: LONG_EN, nameHe: LONG_HE, rule: { kind: 'gregorian', month: 11, day: 10 }, beginsAt: 'shkia', explainEn: X_EN, explainHe: X_HE, source: SRC, eventEn: EV_EN, eventHe: EV_HE, zeroKey: 'here' };
const BIG_CO = (i) => ({ id: `bc${i}`, nameEn: `Shemini Atzeres & Simchas Torah ${i}`, nameHe: 'שמיני עצרת ושמחת תורה', rule: { kind: 'gregorian', month: 11, day: 12 + i } });
const doc = (occasions, settings = {}) => ({ version: 1, settings: { withinDays: 30, ...settings }, occasions });

// New York, 2026: Rosh Chodesh Kislev = 10-11 Nov (eve 9 Nov, shkia ~4:43 PM), Yud-Tes Kislev = 29 Nov (eve 28 Nov), Chanukah 5 Dec
const T = (s) => new Date(`${s}-05:00`);
const cases = [
  { tag: 'far (pinned, 27 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', big: 120 },
  { tag: 'days (8 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), form: 'days', big: 150 },
  { tag: 'hours (last day)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', big: 150 },
  { tag: 'minutes (last hour)', time: T('2026-11-09T16:20:00'), occ: doc([RC, YT, CH]), form: 'minutes', big: 150, tick: true },
  { tag: 'zero (celebration)', time: T('2026-11-09T16:44:00'), occ: doc([RC, YT, CH]), form: 'zero', zero: true },
  { tag: 'day itself, day 1 of 2', time: T('2026-11-10T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Day 1 of 2/ },
  { tag: 'day with event line', time: T('2026-11-29T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Farbrengen 8 PM/ },
  { tag: 'worst case text, days', time: T('2026-11-03T11:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)], { comingUpCount: 3 }), form: 'days', explain: true },
  { tag: 'worst case text, day itself', time: T('2026-11-10T12:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)]), form: 'day', explain: true },
  { tag: 'worst case text, zero', time: T('2026-11-09T16:44:00'), occ: doc([BIG]), form: 'zero', zero: true },
  { tag: 'explanation without a source stays hidden', time: T('2026-11-03T11:00:00'), occ: doc([{ ...BIG, source: '' }]), form: 'days', explain: false },
  { tag: 'Hebrew only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'hebrew' }), form: 'days', noLatinName: true },
  { tag: 'English only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'english' }), form: 'days', noHebrewName: true },
  { tag: 'approximate time (no location, no zmanim)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', noLoc: true, approx: true },
  { tag: 'cycle (3 take turns)', time: T('2026-11-05T11:00:00'), occ: doc([RC, YT, CH], { pick: 'cycle', cycleCount: 3 }), form: 'days', pager: /1 \/ 3/ },
  { tag: 'nothing inside the window: slide out of the rotation', time: T('2026-11-01T11:00:00'), occ: doc([CH], { withinDays: 10 }), absent: true },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, time, occ, noLoc }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : canvas === '4k' ? [3840, 2160] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = [{ id: 'occasion', type: 'OCCASION', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }];
    j.occasions = occ;
    j.cache = { ...(j.cache || {}), zmanim: null, weather: null };
    j.settings = { ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme: 'midnight', location: noLoc ? { timezone: 'America/New_York' } : { timezone: 'America/New_York', lat: 40.67, lon: -73.94 } };
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  return { page, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const probe = (page) => page.evaluate(() => {
  const panel = document.querySelector('section.tt-panel');
  const out = { panel: !!panel, form: panel?.getAttribute('data-occ-form') || null, view: panel?.getAttribute('data-occ-view') || null, overflow: [], small: [], big: 0, anims: [], text: panel ? panel.innerText : document.body.innerText.slice(0, 300), confetti: 0 };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => { const t = a.effect?.target; return `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}@${t?.tagName}.${String(t?.className || '').slice(0, 40)}`; });
  if (!panel) return out;
  const pb = panel.getBoundingClientRect();
  const scale = pb.width / panel.offsetWidth || 1;
  out.scale = scale;
  for (const el of panel.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[data-bd-confetti]')) continue;
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    if (clips && el !== panel && el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
      out.overflow.push(`${el.tagName}[${(el.textContent || '').slice(0, 30)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
    }
  }
  const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect(); if (!b.width) continue;
    if (b.right > pb.right + 1 || b.left < pb.left - 1 || b.bottom > pb.bottom + 1 || b.top < pb.top - 1) out.overflow.push(`outside the panel: "${t.textContent.trim().slice(0, 24)}"`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 24) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
  }
  const nums = [...panel.querySelectorAll('[data-occ-count] .tt-num')].map((n) => parseFloat(getComputedStyle(n).fontSize));
  out.big = nums.length ? Math.max(...nums) : 0;
  out.confetti = panel.querySelectorAll('.tt-bd-f').length;
  out.explain = !!panel.querySelector('[data-occ-explain]');
  out.source = panel.querySelector('[data-occ-source]')?.textContent || '';
  return out;
});

let shots = 0;
for (const canvas of ['land', 'port', '4k']) {
  for (const c of cases) {
    if (ONLY && !c.tag.includes(ONLY)) continue;
    if (canvas === '4k' && !['days (8 days)', 'minutes (last hour)', 'worst case text, days', 'zero (celebration)'].includes(c.tag)) continue;
    const tag = `${canvas} ${c.tag}`;
    const { page, close } = await open({ canvas, time: c.time, occ: c.occ, noLoc: c.noLoc });
    let r = await probe(page);
    if (c.absent) {
      check(`${tag}: the Countdown is not shown`, r.form === null, r.text.slice(0, 80));
      await close(); continue;
    }
    check(`${tag}: page renders in the '${c.form}' form`, r.panel && r.form === c.form, `${r.form} ${r.text.slice(0, 80)}`);
    if (c.zero) {
      check(`${tag}: confetti falls`, r.confetti > 0 || !r.anims.length, String(r.confetti));
      await page.waitForTimeout(6500);
      r = await probe(page);
    }
    check(`${tag}: nothing clips or leaves the panel`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
    check(`${tag}: text >= 24 canvas px`, r.small.length === 0 || (canvas === '4k' && r.small.every((s) => parseFloat(s) / (r.scale || 1) >= 24)), r.small.slice(0, 4).join(', '));
    if (c.big) check(`${tag}: countdown numerals >= ${c.big} canvas px`, r.big / (canvas === '4k' ? 1 : 1) >= c.big, String(r.big));
    check(`${tag}: nothing animating after the page settled`, r.anims.length === 0, r.anims.slice(0, 3).join(','));
    if (c.explain === true) {
      // the sourced explanation has its own page right after the countdown
      check(`${tag}: countdown page first (no explanation on it)`, !r.explain && r.view === 'main', r.view);
      await page.waitForTimeout(10600);
      const v = await probe(page);
      check(`${tag}: vort page: explanation + source shown`, v.view === 'vort' && v.explain && /Source: Sefer Sample/.test(v.source), `${v.view} ${v.source.slice(0, 40)}`);
      check(`${tag}: vort page: nothing clips or leaves the panel`, v.overflow.length === 0, v.overflow.slice(0, 3).join(' | '));
      check(`${tag}: vort page: text >= 24 canvas px`, v.small.length === 0 || (canvas === '4k' && v.small.every((x) => parseFloat(x) / (v.scale || 1) >= 24)), v.small.slice(0, 4).join(', '));
      check(`${tag}: vort page: nothing animating`, v.anims.length === 0, v.anims.slice(0, 3).join(','));
      if (SHOTS && shots < 2 && canvas === 'port' && c.tag === 'worst case text, days') {
        shots++;
        await page.evaluate(() => document.getElementById('tt-splash')?.remove());
        await page.screenshot({ path: `${SHOTS}/occasion-${canvas}-vort.png` });
      }
    }
    if (c.explain === false) check(`${tag}: explanation hidden without a source`, !r.explain);
    if (c.text) check(`${tag}: shows ${c.text}`, c.text.test(r.text), r.text.slice(0, 120));
    if (c.pager) check(`${tag}: pager ${c.pager}`, c.pager.test(r.text), r.text.slice(0, 80));
    if (c.approx) check(`${tag}: approximate time says ~`, /~/.test(r.text) && /approximate/.test(r.text), r.text.slice(0, 160));
    if (c.noLatinName) check(`${tag}: no English name`, !/Rosh Chodesh Kislev/.test(r.text) && /ראש חודש כסלו/.test(r.text), r.text.slice(0, 80));
    if (c.noHebrewName) check(`${tag}: no Hebrew name`, !/ראש חודש/.test(r.text) && /Rosh Chodesh Kislev/.test(r.text), r.text.slice(0, 80));
    if (c.tick) {
      const a = (await page.evaluate(() => document.querySelector('[data-occ-count] .tt-num')?.textContent)) || '';
      check(`${tag}: shows M:SS`, /^\d{1,2}:\d\d$/.test(a), a);
    }
    if (SHOTS && shots < 2 && canvas === 'land' && c.tag === 'days (8 days)') {
      shots++;
      await page.evaluate(() => document.getElementById('tt-splash')?.remove());
      await page.screenshot({ path: `${SHOTS}/occasion-${canvas}.png` });
    }
    await close();
  }
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
