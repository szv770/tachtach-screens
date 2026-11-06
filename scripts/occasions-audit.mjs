#!/usr/bin/env node
/**
 * Programmatic checks of the Countdown page (OccasionSlide.jsx), its takeovers (takeover/OccasionTakeover.jsx) and the live
 * moments (takeover/OccasionMoment.jsx), in every form with the worst content.
 * Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR), never real data:
 *   npm run build && TACHTACH_DATA_DIR=$(mktemp -d) PORT=3100 node server.js &
 *   node scripts/occasions-audit.mjs http://localhost:3100 [--shots DIR] [--only TAG] [--quick]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock and the zone
 * (America/New_York) and injects the occasions document + slides + location (+ a live moment, + fonts, + theme) through a
 * route on /api/state; serves generated pure-white / pure-black pictures for /uploads/*.png.
 * Checks, at 1600x900, 900x1600 and 3840x2160 (4K): the expected form / view renders; nothing clips, leaves the panel or
 * overlaps another text block; every auto-fitted name / greeting fits its box (no clipped descenders or nikud); text >= 24
 * canvas px; the countdown numerals are big; the explanation only with a source; the zero moment's confetti is gone and
 * nothing runs after it settled; Hebrew-only / English-only; '~' for an approximate time; three very different Hebrew
 * display fonts (Rubik, Frank Ruhl Libre, Suez One); the flip display; a count-up; the advent grid with and without a photo
 * (+ today's step page, + tiles opened today fade once); takeovers (milestone, final minute with tabular seconds, zero);
 * live moments (burst, shout-out, ten); a tap pop; text contrast over a white and a black photo in a dark and a light theme.
 * Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const sharp = createRequire(import.meta.url)('sharp');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const QUICK = args.includes('--quick');
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : String(info).replace(/\s+/g, ' ').slice(0, 220)}`); };

const LONG_EN = 'The Annual Yeshiva Dinner and Siyum Celebration of the Year'.slice(0, 60);
const LONG_HE = 'סעודת הסיום השנתית הגדולה של הישיבה הקדושה והתמימים יחד'.slice(0, 60);
const X_EN = Array.from({ length: 12 }, () => 'A long explanation sentence with real words in it.').join(' ').slice(0, 600);
const X_HE = Array.from({ length: 12 }, () => 'משפט ארוך של הסבר עם מילים אמיתיות בתוכו.').join(' ').slice(0, 600);
const SRC = 'Sefer Sample, volume 3, page 120, a long source line written out in full for the test'.slice(0, 140);
const EV_EN = 'Farbrengen at 8:30 PM in the main hall with the whole yeshiva, refreshments served'.slice(0, 120);
const EV_HE = 'התוועדות בשעה 8:30 בערב באולם הגדול עם כל הישיבה, כיבוד קל'.slice(0, 120);
const WHITE = '/uploads/white-photo-0001.png';
const BLACK = '/uploads/black-photo-0001.png';

const starter = (o) => ({ on: true, rule: { kind: 'hebrew', month: 9, day: 19 }, ...o });
const RC = { id: 'rc', nameEn: 'Rosh Chodesh Kislev', nameHe: 'ראש חודש כסלו', starter: 'rc-kislev', rule: { kind: 'roshChodesh', month: 9 }, zeroKey: 'chodeshTov', style: 'chassidic' };
const YT = starter({ id: 'yt', nameEn: 'Yud-Tes Kislev', nameHe: 'י״ט כסלו', starter: 'yud-tes-kislev', zeroKey: 'gutYomTov', eventEn: 'Farbrengen 8 PM, main hall', eventHe: 'התוועדות 8 בערב' });
const CH = { id: 'ch', nameEn: 'Chanukah', nameHe: 'חנוכה', rule: { kind: 'hebrew', month: 9, day: 25 }, days: 8, zeroKey: 'chanukah' };
const BIG = { id: 'big', nameEn: LONG_EN, nameHe: LONG_HE, rule: { kind: 'gregorian', month: 11, day: 10 }, beginsAt: 'shkia', explainEn: X_EN, explainHe: X_HE, explainChecked: true, source: SRC, eventEn: EV_EN, eventHe: EV_HE, zeroKey: 'here' };
const BIG_CO = (i) => ({ id: `bc${i}`, nameEn: `Shemini Atzeres & Simchas Torah ${i}`, nameHe: 'שמיני עצרת ושמחת תורה', rule: { kind: 'gregorian', month: 11, day: 12 + i } });
// an exact 6 PM start (no zmanim needed): Thursday 19 Nov 2026, 18:00 New York
const SIX = { id: 'six', nameEn: 'Melava Malka Siyum', nameHe: 'סיום מלווה מלכה', rule: { kind: 'gregorian', month: 11, day: 19 }, beginsAt: 'time', time: '18:00', zeroKey: 'here', eventEn: 'Main hall' };
const RUN = { id: 'run', nameEn: 'Mivtza Chanukah', nameHe: 'מבצע חנוכה', kind: 'countup', from: { kind: 'gregorian', month: 11, day: 1, year: 2026 }, total: 8, beginsAt: 'midnight', eventEn: 'Every day after Mincha' };
const ADV = (photo) => ({ ...YT, id: 'adv', advent: { on: true, photo, grid: '4x3', daily: { 8: { en: 'Learn one chapter of Tanya with a friend today.', he: 'ללמוד פרק תניא עם חבר', source: 'Hayom Yom, 19 Kislev', checked: true } } } });
const doc = (occasions, settings = {}) => ({ version: 1, settings: { withinDays: 30, ...settings }, occasions });

// New York, 2026: Rosh Chodesh Kislev = 10-11 Nov (eve 9 Nov, shkia ~4:43 PM), Yud-Tes Kislev = 29 Nov (eve 28 Nov), Chanukah 5 Dec
const T = (s) => new Date(`${s}-05:00`);
const FONTS = ['Rubik', 'Frank Ruhl Libre', 'Suez One'];
const cases = [
  { tag: 'far (pinned, 27 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', big: 120, shot: 'land' },
  { tag: 'days (8 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), form: 'days', big: 150, fonts: true, tap: true, shot: 'port' },
  { tag: 'hours (last day)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', big: 150 },
  { tag: 'minutes (last hour)', time: T('2026-11-09T16:20:00'), occ: doc([RC, YT, CH]), form: 'minutes', big: 150, tick: true },
  { tag: 'zero (celebration)', time: T('2026-11-09T16:44:00'), occ: doc([RC, YT, CH], { takeover: false }), form: 'zero', zero: true, fonts: true },
  { tag: 'day itself, day 1 of 2', time: T('2026-11-10T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Day 1 of 2/i },
  { tag: 'day with event line', time: T('2026-11-29T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Farbrengen 8 PM/ },
  { tag: 'worst case text, days', time: T('2026-11-03T11:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)], { comingUpCount: 3 }), form: 'days', explain: true, fonts: true },
  { tag: 'worst case text, day itself', time: T('2026-11-10T12:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)]), form: 'day', explain: true, fonts: true },
  { tag: 'worst case text, zero', time: T('2026-11-09T16:44:00'), occ: doc([BIG], { takeover: false }), form: 'zero', zero: true, fonts: true },
  { tag: 'explanation without a source stays hidden', time: T('2026-11-03T11:00:00'), occ: doc([{ ...BIG, source: '' }]), form: 'days', explain: false },
  { tag: 'Hebrew only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'hebrew' }), form: 'days', noLatinName: true },
  { tag: 'English only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'english' }), form: 'days', noHebrewName: true },
  { tag: 'approximate time (no location, no zmanim)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', noLoc: true, approx: true },
  { tag: 'cycle (3 take turns)', time: T('2026-11-05T11:00:00'), occ: doc([RC, YT, CH], { pick: 'cycle', cycleCount: 3 }), form: 'days', pager: /1 \/ 3/ },
  { tag: 'nothing inside the window: slide out of the rotation', time: T('2026-11-01T11:00:00'), occ: doc([CH], { withinDays: 10 }), absent: true },
  // display types
  { tag: 'flip, days', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { display: 'flip' }), form: 'days', flip: 2, fonts: true, shot: 'land' },
  { tag: 'flip, minutes (seconds cell)', time: T('2026-11-09T16:20:00'), occ: doc([RC, YT, CH], { display: 'flip' }), form: 'minutes', flip: 2 },
  { tag: 'flip, worst case text', time: T('2026-11-03T11:00:00'), occ: doc([BIG], { display: 'flip' }), form: 'days', flip: 2 },
  { tag: 'count-up, day 3 of 8', time: T('2026-11-03T12:00:00'), occ: doc([RUN]), form: 'day', run: true, text: /of 8/i, fonts: true },
  { tag: 'advent with a photo (+ step page, tiles open once)', time: T('2026-11-21T11:00:00'), occ: doc([ADV(WHITE)], { withinDays: 30 }), form: 'days', advent: 'photo', step: true, shot: 'land' },
  { tag: 'advent without a photo', time: T('2026-11-21T11:00:00'), occ: doc([ADV('')], { withinDays: 30 }), form: 'days', advent: 'grid', step: true },
  // photos: readability over a pure white and a pure black picture, dark and light theme
  { tag: 'photo white, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: WHITE, dim: 30 } }]), form: 'far', contrast: true },
  { tag: 'photo black, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: BLACK, dim: 30 } }]), form: 'far', contrast: true },
  { tag: 'photo white, light theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: WHITE, dim: 30 } }]), form: 'far', contrast: true, theme: 'ivory' },
  { tag: 'photo black, light theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: BLACK, dim: 30 } }]), form: 'far', contrast: true, theme: 'ivory' },
  // takeovers (an exact 6 PM start)
  { tag: 'takeover: milestone (7 days)', time: T('2026-11-12T11:00:30'), occ: doc([SIX]), takeover: 'milestone', fonts: true, shot: 'land' },
  { tag: 'takeover: final minute', time: T('2026-11-19T17:59:20'), occ: doc([SIX]), takeover: 'final', tabular: true },
  { tag: 'takeover: zero', time: T('2026-11-19T18:00:20'), occ: doc([SIX]), takeover: 'zero', zero: true, fonts: true },
  { tag: 'takeover: worst case name, milestone', time: T('2026-11-12T11:00:30'), occ: doc([{ ...SIX, nameEn: LONG_EN, nameHe: LONG_HE }]), takeover: 'milestone', fonts: true },
  // live moments (admin fired; real time)
  { tag: 'moment: burst', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'burst', text: { en: '', he: '' }, occasionKey: 'yt', secs: 8 }, zero: true },
  { tag: 'moment: shout-out', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'shoutout', text: { en: 'Mazel tov to the 8th grade on finishing Mishnayos!', he: 'מזל טוב לכיתה ח׳ על סיום משניות!' }, occasionKey: '', secs: 15 } },
  { tag: 'moment: ten', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'ten', text: { en: '', he: '' }, occasionKey: 'yt', secs: 10 }, ten: true },
];

const PNG = {
  [WHITE]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#ffffff' } }).png().toBuffer(),
  [BLACK]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#000000' } }).png().toBuffer(),
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, time, occ, noLoc, font, theme, moment, seedAdvent }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : canvas === '4k' ? [3840, 2160] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  if (seedAdvent) await page.addInitScript((list) => { try { if (!sessionStorage.getItem('aud-seeded')) { for (const s of list) localStorage.setItem(s.k, JSON.stringify(s.v)); sessionStorage.setItem('aud-seeded', '1'); } } catch {} }, seedAdvent);
  await page.route('**/uploads/*.png', (route) => {
    const p = new URL(route.request().url()).pathname;
    return PNG[p] ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG[p] }) : route.continue();
  });
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = [{ id: 'occasion', type: 'OCCASION', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }];
    j.occasions = occ;
    j.occasionMoment = moment ? { id: 'mtest', kind: moment.kind, text: moment.text, occasionKey: moment.occasionKey, startedAt: time.getTime(), until: time.getTime() + moment.secs * 1000 } : null;
    j.cache = { ...(j.cache || {}), zmanim: null, weather: null };
    j.settings = {
      ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme: theme || 'midnight',
      fontRoles: { ...(j.settings?.fontRoles || {}), ...(font ? { hebrewDisplay: font, hebrewBody: font } : {}) },
      location: noLoc ? { timezone: 'America/New_York' } : { timezone: 'America/New_York', lat: 40.67, lon: -73.94 },
    };
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  return { page, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const SEL = { slide: 'section.tt-panel[data-occ-form]', takeover: '[data-occ-takeover] section.tt-panel', moment: '[data-occ-moment] section.tt-panel' };

const probe = (page, sel) => page.evaluate((sel) => {
  const panel = document.querySelector(sel);
  const out = { panel: !!panel, form: panel?.getAttribute('data-occ-form') || null, view: panel?.getAttribute('data-occ-view') || null, overflow: [], small: [], big: 0, anims: [], text: panel ? panel.innerText : document.body.innerText.slice(0, 300), confetti: 0, fit: [], overlap: [] };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => { const t = a.effect?.target; return `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}@${t?.tagName}.${String(t?.className || '').slice(0, 40)}`; });
  out.infinite = document.getAnimations().filter((a) => a.effect?.getComputedTiming?.().iterations === Infinity && !a.effect?.target?.closest?.('#tt-splash')).length;
  if (!panel) return out;
  const pb = panel.getBoundingClientRect();
  const scale = pb.width / panel.offsetWidth || 1;
  out.scale = scale;
  for (const el of panel.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[data-bd-confetti]') || el.closest('[aria-hidden]')) continue;
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    if (clips && el !== panel && el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
      out.overflow.push(`${el.tagName}[${(el.textContent || '').slice(0, 30)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
    }
  }
  // auto-fitted boxes (vcenter Fit: the inner div) must fit their box: otherwise a line, a descender or nikud sticks out
  for (const el of panel.querySelectorAll('[data-occ-name] > div, .tt-bd-hero, .tt-bd-up')) {
    const inner = el.firstElementChild;
    if (!inner || el.closest('[aria-hidden]') || !el.clientHeight) continue;
    if (inner.offsetHeight > el.clientHeight + 3 || inner.scrollWidth > el.clientWidth + 2) out.fit.push(`"${el.textContent.slice(0, 24)}" ${inner.scrollWidth}x${inner.offsetHeight}>${el.clientWidth}x${el.clientHeight}`);
  }
  const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  const rects = [];
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; const cs = getComputedStyle(el);
    if (el.closest('[aria-hidden]') || cs.visibility === 'hidden') continue;
    const range = document.createRange(); range.selectNodeContents(t);
    const b = range.getBoundingClientRect(); if (!b.width) continue;
    if (b.right > pb.right + 1 || b.left < pb.left - 1 || b.bottom > pb.bottom + 1 || b.top < pb.top - 1) out.overflow.push(`outside the panel: "${t.textContent.trim().slice(0, 24)}"`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 24) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
    rects.push({ b, s: t.textContent.trim().slice(0, 18), blk: el.closest('[data-occ-name],[data-occ-date],[data-occ-begins],[data-occ-event],[data-occ-count],[data-occ-coming],[data-occ-tagline],header,[data-occ-card],[data-occ-step]') });
  }
  // text of different blocks never overlaps (a too-tall line box from a display font would)
  const tol = 3 * scale;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i]; const B = rects[j];
    if (!A.blk || !B.blk || A.blk === B.blk || A.blk.contains(B.blk) || B.blk.contains(A.blk)) continue;
    const ox = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
    const oy = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
    if (ox > tol && oy > tol * 3) out.overlap.push(`"${A.s}" x "${B.s}"`);
  }
  const nums = [...panel.querySelectorAll('[data-occ-count] [data-occ-big]')].map((n) => parseFloat(getComputedStyle(n).fontSize));
  out.big = nums.length ? Math.max(...nums) : 0;
  out.bigW = panel.querySelector('[data-occ-count] [data-occ-big]')?.offsetWidth || 0;
  out.bigText = panel.querySelector('[data-occ-count] [data-occ-big]')?.textContent || '';
  out.confetti = panel.querySelectorAll('.tt-bd-f').length;
  out.explain = !!panel.querySelector('[data-occ-explain]');
  out.source = panel.querySelector('[data-occ-source]')?.textContent || '';
  out.flip = panel.querySelectorAll('[data-occ-cell]').length;
  out.cells = [...panel.querySelectorAll('[data-occ-cell]')].map((c) => c.getAttribute('data-occ-cell')).join('');
  out.advent = panel.querySelector('[data-occ-advent]')?.getAttribute('data-occ-advent') || null;
  out.tilesOpen = panel.querySelectorAll('[data-occ-tile=open]').length;
  out.fading = panel.querySelectorAll('.tt-adv-open').length;
  out.step = !!panel.querySelector('[data-occ-step]');
  out.run = !!panel.querySelector('[data-occ-count=run]');
  out.display = panel.getAttribute('data-occ-display');
  return out;
}, sel);

/** WCAG contrast of every text element against what is really painted behind it (text hidden, screenshot sampled). */
async function contrast(page) {
  const items = await page.evaluate(() => {
    const panel = document.querySelector('section.tt-panel[data-occ-form]');
    const out = [];
    const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode; if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (el.closest('[aria-hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect();
      if (!b.width) continue;
      out.push({ s: t.textContent.trim().slice(0, 16), c: getComputedStyle(el).color, fs: parseFloat(getComputedStyle(el).fontSize), x: b.left, y: b.top, w: b.width, h: b.height });
    }
    const st = document.createElement('style'); st.id = 'aud-hide'; st.textContent = 'section.tt-panel *{color:transparent!important;text-shadow:none!important}'; document.head.appendChild(st);
    return out;
  });
  await page.waitForTimeout(150);
  const buf = await page.screenshot();
  await page.evaluate(() => document.getElementById('aud-hide')?.remove());
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (Math.min(info.height - 1, Math.max(0, Math.round(y))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x)))) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (c) => {
    let m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
    return null;
  };
  let worst = { ratio: 99 };
  for (const it of items) {
    const col = parse(it.c); if (!col) continue;
    const bgs = [[0.2, 0.5], [0.5, 0.5], [0.8, 0.5]].map(([fx, fy]) => px(it.x + it.w * fx, it.y + it.h * fy));
    for (const bg of bgs) {
      const fg = [0, 1, 2].map((k) => col[k] * col[3] + bg[k] * (1 - col[3]));
      const L1 = lum(fg); const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const need = it.fs >= 32 ? 3 : 4.5;
      if (ratio / need < (worst.ratio / (worst.need || 1))) worst = { ratio, need, s: it.s, fs: it.fs };
    }
  }
  return worst;
}

let shots = 0;
const shot = async (page, name) => {
  if (!SHOTS || shots >= 6) return;
  shots++;
  await page.evaluate(() => document.getElementById('tt-splash')?.remove());
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`shot ${SHOTS}/${name}.png`);
};

async function run(canvas, c, font) {
  const tag = `${canvas}${font ? ` [${font}]` : ''} ${c.tag}`;
  const sel = c.takeover ? SEL.takeover : c.moment ? SEL.moment : SEL.slide;
  // advent: pretend yesterday this screen saw every tile still shut, so today's open tiles fade once
  const seedAdvent = c.advent ? ['2026-11-28', '2026-11-29'].map((d) => ({ k: `tt-adv:adv|${d}`, v: { day: 99, prev: null, now: '000000000000' } })) : null;
  const { page, close } = await open({ canvas, time: c.time, occ: c.occ, noLoc: c.noLoc, font, theme: c.theme, moment: c.moment, seedAdvent });
  try {
    let r = await probe(page, sel);
    if (c.absent) { check(`${tag}: the Countdown is not shown`, r.form === null, r.text.slice(0, 80)); return; }
    if (c.takeover) check(`${tag}: takeover '${c.takeover}' shows`, r.panel && r.form === c.takeover, `${r.form} ${r.text.slice(0, 80)}`);
    else if (c.moment) check(`${tag}: moment overlay shows`, r.panel, r.text.slice(0, 80));
    else check(`${tag}: page renders in the '${c.form}' form`, r.panel && r.form === c.form, `${r.form} ${r.text.slice(0, 80)}`);
    if (c.advent) {
      check(`${tag}: advent grid (${c.advent})`, r.advent === c.advent && r.tilesOpen > 0 && r.tilesOpen < 12, `${r.advent} open ${r.tilesOpen}`);
      check(`${tag}: tiles opened today fade once`, r.fading > 0, String(r.fading));
    }
    if (c.zero || c.advent || c.ten || c.takeover) {
      if (c.zero) check(`${tag}: confetti falls`, r.confetti > 0 || !r.anims.length, String(r.confetti));
      if (c.ten) {
        const a = r.bigText;
        await page.clock.setFixedTime(new Date(c.time.getTime() + 3000)); await page.waitForTimeout(1300);
        const b = (await probe(page, sel)).bigText;
        check(`${tag}: counts down each second (${a} -> ${b})`, Number(a) - Number(b) === 3, `${a} ${b}`);
        await page.clock.setFixedTime(new Date(c.time.getTime() + 10500)); await page.waitForTimeout(1300);
        const z = await probe(page, sel);
        check(`${tag}: ends in a burst`, z.panel && z.confetti > 0, `${z.panel} ${z.confetti}`);
        await page.clock.setFixedTime(new Date(c.time.getTime() + 14500)); await page.waitForTimeout(1300);
        const gone = await page.evaluate(() => !document.querySelector('[data-occ-moment]'));
        check(`${tag}: gone after its end + the burst`, gone);
        return;
      }
      if (c.tabular) {
        const a = r; await page.clock.setFixedTime(new Date(c.time.getTime() + 1000)); await page.waitForTimeout(1300);
        const b = await probe(page, sel);
        check(`${tag}: M:SS ticks (${a.bigText} -> ${b.bigText})`, /^\d:\d\d$/.test(b.bigText) && a.bigText !== b.bigText, `${a.bigText} ${b.bigText}`);
        check(`${tag}: tabular figures (same width each second)`, Math.abs(a.bigW - b.bigW) <= 1, `${a.bigW} ${b.bigW}`);
      }
      await page.waitForTimeout(c.zero ? 6500 : 2600);
      r = await probe(page, sel);
    }
    check(`${tag}: nothing clips or leaves the panel`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
    check(`${tag}: fitted lines fit their box`, r.fit.length === 0, r.fit.slice(0, 3).join(' | '));
    check(`${tag}: no text blocks overlap`, r.overlap.length === 0, r.overlap.slice(0, 3).join(' | '));
    check(`${tag}: text >= 24 canvas px`, r.small.every((s) => parseFloat(s) / (r.scale || 1) >= 23.5), r.small.slice(0, 4).join(', '));
    if (c.big) check(`${tag}: countdown numerals >= ${c.big} canvas px`, r.big / (r.scale || 1) >= c.big - 1, String(r.big));
    check(`${tag}: nothing animating after the page settled`, r.anims.length === 0 && r.infinite === 0, r.anims.slice(0, 3).join(','));
    if (c.flip) check(`${tag}: flip cells (${r.cells})`, r.display === 'flip' && r.flip >= c.flip, `${r.display} ${r.cells}`);
    if (c.flip && c.form === 'minutes') check(`${tag}: seconds cell while ticking each second`, r.cells.includes('s'), r.cells);
    if (c.run) check(`${tag}: count-up view`, r.run, r.text.slice(0, 80));
    if (c.text) check(`${tag}: shows ${c.text}`, c.text.test(r.text), r.text.slice(0, 120));
    if (c.pager) check(`${tag}: pager ${c.pager}`, c.pager.test(r.text), r.text.slice(0, 80));
    if (c.approx) check(`${tag}: approximate time says ~`, /~/.test(r.text) && /approximate/i.test(r.text), r.text.slice(0, 160));
    if (c.noLatinName) check(`${tag}: no English name`, !/Rosh Chodesh Kislev/.test(r.text) && /ראש חודש כסלו/.test(r.text), r.text.slice(0, 80));
    if (c.noHebrewName) check(`${tag}: no Hebrew name`, !/ראש חודש/.test(r.text) && /Rosh Chodesh Kislev/.test(r.text), r.text.slice(0, 80));
    if (c.explain === false) check(`${tag}: explanation hidden without a source`, !r.explain);
    if (c.tick) {
      const a = r.bigText;
      check(`${tag}: shows M:SS`, /^\d{1,2}:\d\d$/.test(a), a);
    }
    if (c.contrast) {
      const w = await contrast(page);
      check(`${tag}: every line readable on the photo (worst ${w.ratio?.toFixed(2)} vs ${w.need} at ${w.fs}px "${w.s}")`, w.ratio >= w.need, '');
    }
    if (c.shot && c.shot === canvas && !font) await shot(page, `occasion-${canvas}-${c.tag.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}`);
    if (c.tap && !font) {
      await page.evaluate(() => document.getElementById('tt-splash')?.remove());
      const box = await page.locator(SEL.slide).boundingBox();
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await page.waitForTimeout(120);
      const p = await page.evaluate(() => document.querySelectorAll('[data-occ-pop] .tt-pop').length);
      check(`${tag}: a tap pops (finite)`, p > 0, String(p));
      await page.waitForTimeout(1300);
      const after = await probe(page, sel);
      check(`${tag}: the pop is gone, nothing running`, after.anims.length === 0 && !(await page.evaluate(() => document.querySelector('[data-occ-pop]'))), after.anims.join(','));
    }
    if (c.explain === true || c.step) {
      // the countdown page first, then the sourced explanation / today's step on its own page
      check(`${tag}: countdown page first`, !r.explain && r.view === 'main', r.view);
      await page.clock.setFixedTime(new Date(c.time.getTime() + 15000));
      await page.waitForTimeout(10600);
      const v = await probe(page, SEL.slide);
      if (c.step) check(`${tag}: today's step page + source`, v.view === 'step' && v.step && /Hayom Yom/.test(v.source), `${v.view} ${v.source.slice(0, 40)}`);
      else check(`${tag}: vort page: explanation + source shown`, v.view === 'vort' && v.explain && /Source: Sefer Sample/i.test(v.source), `${v.view} ${v.source.slice(0, 40)}`);
      check(`${tag}: second page: nothing clips or leaves the panel`, v.overflow.length === 0, v.overflow.slice(0, 3).join(' | '));
      check(`${tag}: second page: no overlap, fits`, v.overlap.length === 0 && v.fit.length === 0, [...v.overlap, ...v.fit].slice(0, 3).join(' | '));
      check(`${tag}: second page: text >= 24 canvas px`, v.small.every((x) => parseFloat(x) / (v.scale || 1) >= 23.5), v.small.slice(0, 4).join(', '));
      check(`${tag}: second page: nothing animating`, v.anims.length === 0, v.anims.slice(0, 3).join(','));
    }
  } finally { await close(); }
}

const FOURK = ['days (8 days)', 'minutes (last hour)', 'worst case text, days', 'zero (celebration)', 'flip, days', 'takeover: milestone (7 days)', 'advent with a photo (+ step page, tiles open once)'];
for (const canvas of ['land', 'port', '4k']) {
  for (const c of cases) {
    if (ONLY && !c.tag.includes(ONLY)) continue;
    if (canvas === '4k' && !FOURK.includes(c.tag)) continue;
    if (QUICK && canvas === '4k') continue;
    await run(canvas, c, null);
    if (c.fonts && canvas !== '4k' && !QUICK) for (const f of FONTS.slice(1)) await run(canvas, c, f);
  }
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
