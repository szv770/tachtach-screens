#!/usr/bin/env node
/**
 * Programmatic checks of the Friday / Shabbos pages (ShabbosSlide.jsx, ShabbosSign) with the worst content
 * (8 reminder lines of 90 characters, English + Hebrew, Hebrew only, English only, none).
 * Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR), never real data:
 *   node scripts/shabbos-audit.mjs http://localhost:3100 [--shots DIR]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock and the zone
 * (America/New_York) and injects settings / slides / zmanim through a route on /api/state.
 * Checks, at 1600x900 and 900x1600: the page renders, nothing clips or leaves the panel, text >= 24 canvas px
 * (the C6 hard floor), hero time >= 120 px, no running animation after the entrance, 'off' is the blank screen,
 * 'sign' has no rail and nothing animating. Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

const EN90 = 'Shabbos candles: girls and women light 18 minutes before sunset, then say the bracha. Gut!'.slice(0, 90);
const HE90 = 'הדלקת נרות שבת קודש: בנות ונשים מדליקות שמונה עשרה דקות לפני השקיעה ומברכות על הנרות בשמחה'.slice(0, 90);
const many = (n, en, he) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, en: en ? `${i + 1}. ${en}`.slice(0, 90) : '', he: he ? he : '' }));
const FRI = { plagHaMincha: '4:52 PM', candleLighting: '5:39 PM', sunset: '5:57 PM', tzeit7083deg: '6:22 PM' };
const SAT = { plagHaMincha: '4:51 PM', sunset: '5:56 PM', tzeit7083deg: '6:21 PM' };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, time, zmanim, shabbos, slides, theme = 'midnight' }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = slides;
    j.cache = { ...(j.cache || {}), zmanim: { today: zmanim, tomorrow: null, fetchedAt: time.toISOString() }, parsha: { name: 'Parashat Lech-Lecha', hebrew: 'פרשת לך־לך', date: '2026-10-31' } };
    j.settings = { ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme, shabbos };
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  return { page, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const probe = (page) => page.evaluate(() => {
  const panel = document.querySelector('section.tt-panel');
  const out = { panel: !!panel, overflow: [], small: [], minFont: 999, hero: 0, anims: [], text: document.body.innerText.slice(0, 400), rail: !!document.querySelector('[data-rail], aside') };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => { const t = a.effect?.target; return `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}@${t?.tagName}.${String(t?.className || '').slice(0, 40)}#${t?.id || ''}`; });
  if (!panel) return out;
  const pb = panel.getBoundingClientRect();
  const scale = pb.width / panel.offsetWidth || 1;
  for (const el of panel.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    if (clips && el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
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
    if (el.tagName !== 'SMALL') out.minFont = Math.min(out.minFont, fs);
    if (fs < 24 && el.tagName !== 'SMALL') out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
  }
  const tt = [...panel.querySelectorAll('.tt-num b')].map((b) => parseFloat(getComputedStyle(b).fontSize));
  out.hero = tt.length ? Math.max(...tt) : 0;
  out.scale = scale;
  return out;
});

const slidesOn = [{ id: 'shabbos', type: 'SHABBOS', enabled: true, duration: 600 }, { id: 'motzei', type: 'MOTZEI', enabled: true, duration: 600 }];
const cases = [
  { tag: 'erev both-lang 8 reminders', time: new Date('2026-10-30T15:25:00-04:00'), zmanim: FRI, shabbos: { remindersErev: many(8, EN90, HE90) }, page: true, hero: true },
  { tag: 'erev Hebrew-only 3', time: new Date('2026-10-30T15:25:00-04:00'), zmanim: FRI, shabbos: { greeting: 'hebrew', remindersErev: many(3, '', HE90) }, page: true, hero: true },
  { tag: 'erev English-only 1', time: new Date('2026-10-30T17:10:00-04:00'), zmanim: FRI, shabbos: { greeting: 'english', remindersErev: many(1, EN90, '') }, page: true, hero: true },
  { tag: 'erev no reminders', time: new Date('2026-10-30T15:25:00-04:00'), zmanim: FRI, shabbos: {}, page: true, hero: true },
  { tag: 'erev no zmanim', time: new Date('2026-10-30T16:00:00-04:00'), zmanim: {}, shabbos: { remindersErev: many(2, EN90, '') }, page: true, hero: false },
  { tag: 'motzei 8 reminders', time: new Date('2026-10-31T18:40:00-04:00'), zmanim: SAT, shabbos: { remindersMotzei: many(8, EN90, HE90) }, page: true },
  { tag: 'motzei none', time: new Date('2026-10-31T18:40:00-04:00'), zmanim: SAT, shabbos: {}, page: true },
  { tag: 'during sign', time: new Date('2026-10-31T12:00:00-04:00'), zmanim: SAT, shabbos: { during: 'sign' }, sign: true },
  { tag: 'during off', time: new Date('2026-10-31T12:00:00-04:00'), zmanim: SAT, shabbos: { during: 'off' }, off: true },
  { tag: 'during off, no tzeis = shows normally', time: new Date('2026-10-31T12:00:00-04:00'), zmanim: { sunset: '5:56 PM' }, shabbos: { during: 'off' }, normal: true },
];

for (const canvas of ['land', 'port']) {
  for (const c of cases) {
    const tag = `${canvas} ${c.tag}`;
    const { page, close } = await open({ canvas, time: c.time, zmanim: c.zmanim, shabbos: c.shabbos, slides: c.normal ? [{ id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }] : slidesOn });
    const r = await probe(page);
    if (c.page) {
      check(`${tag}: page renders`, r.panel, r.text.slice(0, 80));
      check(`${tag}: nothing clips`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
      check(`${tag}: text >= 24 canvas px`, r.small.length === 0, r.small.slice(0, 4).join(', '));
      if (c.hero === true) check(`${tag}: hero time >= 120 px`, r.hero >= 120, String(r.hero));
      if (c.hero === false) check(`${tag}: no hero time without zmanim`, r.hero < 120, String(r.hero));
      check(`${tag}: nothing animating after the entrance`, r.anims.length === 0, r.anims.join(','));
    }
    if (c.sign) {
      const t = await page.evaluate(() => document.body.innerText);
      check(`${tag}: sign shows greeting and end time`, /Good Shabbos/.test(t) && /Shabbos ends/.test(t) && /6:21/.test(t), t.slice(0, 120));
      check(`${tag}: sign has no slide panel`, !r.panel);
      check(`${tag}: sign: nothing animating`, r.anims.length === 0, r.anims.join(','));
    }
    if (c.off) {
      const t = await page.evaluate(() => document.body.innerText.trim());
      check(`${tag}: off is blank`, !r.panel && t === '', t.slice(0, 60));
    }
    if (c.normal) check(`${tag}: screen shows normally`, r.panel, r.text.slice(0, 60));
    if (SHOTS && ((canvas === 'land' && c.tag === 'erev both-lang 8 reminders') || (canvas === 'port' && c.tag === 'erev Hebrew-only 3'))) {
      await page.evaluate(() => document.getElementById('tt-splash')?.remove()); // the clock is frozen, so the splash never finishes its fade
      await page.screenshot({ path: `${SHOTS}/shabbos-${canvas}.png` });
    }
    await close();
  }
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
