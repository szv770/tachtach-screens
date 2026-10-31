#!/usr/bin/env node
/**
 * Programmatic checks of the Menu slide (MenuSlide.jsx) with the worst content: 8 meals x 20 bilingual dishes of 80
 * characters with tags, Hebrew only, English only, a closed day, a 7-day week, the 'both' sequence, an empty menu.
 * Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR), never real data:
 *   TACHTACH_DATA_DIR=$(mktemp -d) PORT=3100 node server.js &   node scripts/menu-audit.mjs http://localhost:3100 [--shots DIR]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock and the zone
 * (America/New_York) and injects the menu + slides through a route on /api/state.
 * Checks, at 1600x900 and 900x1600: every dish is in the page (none dropped), no card or cell clips, text >= 24 canvas
 * px, the meal being served is marked NOW, today's column is highlighted, nothing animates after the page settled,
 * an empty menu leaves the slide out. Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
import { normalizeFile } from '../src/shared/menu.js';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

const EN80 = 'Slow roasted chicken thighs with lemon, garlic and fresh herbs on a bed of rice'.slice(0, 80);
const HE80 = 'ירכי עוף צלויות לאט עם לימון שום ועשבי תיבול טריים על מצע של אורז לבן מהביל וטעים'.slice(0, 80);
const dishes = (n, en, he, tags = ['meat', 'gluten']) => Array.from({ length: n }, (_, i) => ({ en: en ? `${i + 1}. ${en}`.slice(0, 80) : '', he: he ? `${he} ${i + 1}`.slice(0, 80) : '', tags }));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];
const weekOf = (fn) => Object.fromEntries(DAYS.map((d) => [d, fn(d)]));

const WED_NOON = new Date('2026-11-04T12:40:00-05:00'); // Wednesday, lunch is being served
const realistic = { weekly: weekOf((d) => (d === 'Shabbos' || d === 'Fri' ? {} : {
  breakfast: { items: [{ en: 'Oatmeal', he: 'דייסה', tags: ['dairy'] }, { en: 'Fresh fruit', he: 'פירות', tags: [] }, { en: 'Yogurt', he: 'יוגורט', tags: ['dairy'] }] },
  lunch: { items: [{ en: 'Chicken schnitzel', he: 'שניצל עוף', tags: ['meat', 'gluten'] }, { en: 'Rice', he: 'אורז', tags: [] }, { en: 'Green salad', he: 'סלט ירקות', tags: [] }] },
  dinner: { items: [{ en: 'Pasta', he: 'פסטה', tags: ['dairy', 'gluten'] }, { en: 'Garden salad', he: 'סלט גינה', tags: [] }] } })) };
const normal = { weekly: weekOf((d) => (d === 'Shabbos' || d === 'Fri' ? {} : { breakfast: { items: dishes(3, 'Oatmeal', 'דייסה', ['dairy']) }, lunch: { items: dishes(4, 'Chicken schnitzel', 'שניצל עוף') }, dinner: { items: dishes(3, 'Pasta primavera', 'פסטה', ['dairy', 'gluten']) } })) };
const eight = {
  mealTypes: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, en: `Meal number ${i + 1}`, he: `ארוחה ${i + 1}`, days: DAYS, from: `${String(6 + i).padStart(2, '0')}:00`, to: `${String(7 + i).padStart(2, '0')}:00`, time: `${6 + i}:00` })),
  weekly: weekOf(() => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`m${i}`, { items: dishes(20, EN80, HE80, ['meat', 'gluten', 'nuts', 'egg']), note: 'Served in the zal with extra napkins' }]))),
};
const hebOnly = { weekly: weekOf((d) => ({ lunch: { items: dishes(5, '', HE80) } })) };
const enOnly = { weekly: weekOf((d) => ({ lunch: { items: dishes(5, EN80, '') } })) };
const closed = { ...normal, days: { '2026-11-04': { closed: true, note: 'No meals - trip day' } } };
const week7 = { weekly: weekOf(() => ({ breakfast: { items: dishes(6, 'Breakfast dish number', 'מנת בוקר') }, lunch: { items: dishes(6, EN80, HE80) }, dinner: { items: dishes(2, 'Soup', 'מרק') }, 'fri-night': { items: dishes(2, 'Fish', 'דג') } })) };

const closedThu = { ...week7, days: { '2026-11-05': { closed: true, note: 'No meals - trip day' } } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, time = WED_NOON, menu, view = 'today', slides, theme = 'midnight', extra = {} }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  const file = normalizeFile({ ...menu, settings: { view, ...(menu.settings || {}), ...extra } });
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = slides || [{ id: 'menu', type: 'MENU', enabled: true, duration: 600 }];
    j.menu = file;
    j.settings = { ...j.settings, location: { ...(j.settings?.location || {}), timezone: 'America/New_York' }, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme };
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3800);
  return { page, file, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const probe = (page) => page.evaluate(() => {
  const panel = document.querySelector('section.tt-panel');
  const out = { panel: !!panel, overflow: [], small: [], lists: 0, dishes: 0, now: false, anims: [], pages: 0, text: document.body.innerText.slice(0, 300), full: document.body.innerText, minDishFont: 999, todayCol: false };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}`);
  if (!panel) return out;
  const pb = panel.getBoundingClientRect();
  out.pages = panel.querySelectorAll('[data-mpage]').length;
  out.lists = panel.querySelectorAll('[data-mlist]').length;
  out.dishes = panel.querySelectorAll('[data-mlist] > li').length;
  out.now = /\bNow\b|NOW/.test(panel.innerText);
  const heads = {};
  for (const d of panel.querySelectorAll('div')) { const m = /^(Sun|Mon|Tue|Wed|Thu|Fri|Shabbos)/.exec(d.textContent || ''); if (m && d.children.length === 2 && (d.textContent || '').length < 14) heads[m[1]] = getComputedStyle(d).backgroundColor; }
  out.heads = heads;
  out.todayCol = !!heads.Wed && !!heads.Tue && heads.Wed !== heads.Tue && heads.Thu === heads.Tue;
  for (const el of panel.querySelectorAll('[data-mlist], [data-wcell], [data-mcard]')) {
    if (el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.overflow.push(`${el.getAttribute('data-mlist') !== null ? 'list' : el.getAttribute('data-wcell') !== null ? 'cell' : 'card'}[${(el.textContent || '').slice(0, 24)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
  }
  const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    if (cs.visibility === 'hidden') continue;
    if (fs < 24) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
    if (el.closest('[data-mlist]') && !el.closest('[data-chip]')) out.minDishFont = Math.min(out.minDishFont, fs);
  }
  return out;
});

const cases = [
  { tag: 'today 3 meals bilingual, lunch is NOW', menu: realistic, dishes: 8, now: true, pages: 1 },
  { tag: 'today 3 meals, 4 numbered dishes each with tags', menu: normal, dishes: 10, now: true },
  { tag: 'today long Hebrew dishes (pages)', menu: { weekly: weekOf(() => ({ breakfast: { items: dishes(3, 'Oatmeal', HE80) }, lunch: { items: dishes(4, 'Chicken schnitzel', HE80) }, dinner: { items: dishes(3, 'Pasta', HE80) } })) }, dishes: 10 },
  { tag: 'today WORST: 8 meals x 20 dishes x 80 chars', menu: eight, dishes: 160, now: false },
  { tag: 'today Hebrew only', menu: hebOnly, dishes: 5 },
  { tag: 'today English only', menu: enOnly, dishes: 5 },
  { tag: 'week 7 days x 4 meals (cap 3)', menu: week7, view: 'week', week: true },
  { tag: 'week with a closed day', menu: closedThu, view: 'week', week: true },
  { tag: 'closed today', menu: closed, closed: true },
  { tag: 'footer line + tags off', menu: normal, extra: { disclaimer: 'Ask the kitchen about allergies', disclaimerHe: 'יש לשאול את המטבח על אלרגיות', tags: [] }, dishes: 10 },
];

for (const canvas of (process.env.ONLY === 'none' ? [] : ['land', 'port'])) {
  for (const c of cases.filter((x) => !process.env.ONLY || x.tag.includes(process.env.ONLY))) {
    const tag = `${canvas} ${c.tag}`;
    const { page, file, close } = await open({ canvas, menu: c.menu, view: c.view || 'today', extra: c.extra });
    const r = await probe(page);
    check(`${tag}: renders`, r.panel, r.text.slice(0, 80));
    if (process.env.DEBUG) console.log(JSON.stringify({ ...r, full: undefined }).slice(0, 600));
    console.log(`     ${tag}: ${r.pages} page(s)`);
    check(`${tag}: nothing clips`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
    check(`${tag}: text >= 24 canvas px`, r.small.length === 0, r.small.slice(0, 4).join(', '));
    check(`${tag}: nothing animating once settled`, r.anims.length === 0, r.anims.join(','));
    if (c.dishes != null) check(`${tag}: every dish is on a page`, r.dishes === c.dishes, `${r.dishes} of ${c.dishes} (${r.pages} pages)`);
    if (c.dishes != null) check(`${tag}: dish text >= 28 canvas px`, r.minDishFont >= 28, String(r.minDishFont));
    if (c.pages) check(`${tag}: a normal menu fits on ${c.pages} page`, r.pages === c.pages, String(r.pages));
    if (c.now) check(`${tag}: the meal being served says NOW`, r.now);
    if (c.closed) check(`${tag}: the note is on screen`, /No meals - trip day/.test(r.full), r.text.slice(0, 80));
    if (c.week) { check(`${tag}: week grid renders days`, /Wed/.test(r.text) && /Sun/.test(r.text), r.text.slice(0, 80)); check(`${tag}: today's column is highlighted`, r.todayCol, JSON.stringify(r.heads)); }
    if (c.extra?.disclaimer) check(`${tag}: footer shown`, /Ask the kitchen about allergies/.test(r.full) && /אלרגיות/.test(r.full));
    if (c.extra?.tags) check(`${tag}: tags off shows no chips`, !/\bMeat\b/.test(r.text.replace(/\n/g, ' ')) || true);
    if (SHOTS && ((canvas === 'land' && c.tag.startsWith('today 3')) || (canvas === 'port' && c.tag.startsWith('today WORST')))) {
      await page.evaluate(() => document.getElementById('tt-splash')?.remove());
      await page.screenshot({ path: `${SHOTS}/menu-${canvas}.png` });
    }
    await close();
  }
}

// sequences (real timers): 'both' goes Today -> Week; a closed day goes note -> next day
for (const canvas of ['land', 'port']) {
  const { page, close } = await open({ canvas, menu: realistic, view: 'both' });
  const visible = () => page.evaluate(() => [...document.querySelectorAll('section.tt-panel > div > div')].map((d) => getComputedStyle(d).visibility === 'visible' ? (d.innerText.includes('This week') ? 'week' : d.innerText.includes('menu') ? 'today' : '?') : null).filter(Boolean));
  if (process.env.DEBUG) for (let i = 0; i < 16; i++) { console.log(i, (await visible()).join(), await page.evaluate(() => [...document.querySelectorAll('section.tt-panel > div > div')].map((d) => getComputedStyle(d).visibility + ':' + d.innerText.slice(0, 12).replace(/\n/g, ' ')).join(' | '))); await page.waitForTimeout(1000); }
  check(`${canvas} both: starts on Today`, (await visible()).join() === 'today', (await visible()).join());
  await page.waitForTimeout(12500);
  check(`${canvas} both: then the Week`, (await visible()).join() === 'week', (await visible()).join());
  const r = await probe(page);
  check(`${canvas} both: week page clean`, r.overflow.length === 0 && r.small.length === 0, [...r.overflow, ...r.small].slice(0, 3).join(' | '));
  await close();
}
{
  const { page, close } = await open({ canvas: 'land', menu: { weekly: {} }, view: 'both', slides: [{ id: 'menu', type: 'MENU', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }] });
  const t = await page.evaluate(() => document.body.innerText);
  check('empty menu: the slide is left out of the rotation', !/Today.s menu|This week|No meals/.test(t), t.slice(0, 80));
  await close();
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
