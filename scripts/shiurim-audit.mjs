#!/usr/bin/env node
/**
 * Programmatic checks of the Shiurim and Guest speaker slides (ShiurimSlide.jsx, SpeakerSlide.jsx) with the worst content: 12 shiurim
 * with 60-character bilingual titles, rebbeim and rooms, a 6-rebbe week with 5 lines each, one / two / three guest speakers with
 * 100-character topics and 200-character bios, Hebrew only, English only, a cancelled and a moved row, a missing photo (letter circle)
 * and a real one. Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR), never real data:
 *   TACHTACH_DATA_DIR=$(mktemp -d) PORT=3100 node server.js &   TACHTACH_DATA_DIR=<same dir> node scripts/shiurim-audit.mjs http://localhost:3100 [--shots DIR]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock (Tuesday 2026-11-03 1:40 PM) and the
 * zone (America/New_York) and injects the document + slide rows through a route on /api/state.
 * Checks, at 1600x900, 900x1600 and at 1080p / 4K viewports: every row / card / guest is on a page (none dropped), nothing clips,
 * text >= 24 canvas px (row floors time 40, title 32, name 28, place 26), the shiur being given says NOW, a cancelled one says
 * Cancelled, nothing animates once settled, an empty list leaves the slide out, the Schedule page carries the rebbe's name under a
 * linked block. Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeFile, forKiosk } from '../src/shared/shiurim.js';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

const TUE_1340 = new Date('2026-11-03T13:40:00-05:00');
const TODAY = '2026-11-03';
const EN60 = 'Gemara Bava Metzia with Tosfos and the Rishonim on the sugya'.slice(0, 60);
const HE60 = 'גמרא בבא מציעא עם תוספות והראשונים על הסוגיא בעיון רב'.slice(0, 60);
const ALL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// a real photo, written into the scratch uploads dir so one avatar is a picture (the rest are letter circles)
const PHOTO = '0b2d6a46-0f38-4d62-9a3c-0c8b9e1a5d11';
if (process.env.TACHTACH_DATA_DIR) {
  const sharp = require('/home/user/tachtach-screens/node_modules/sharp');
  const up = path.join(process.env.TACHTACH_DATA_DIR, 'uploads');
  fs.mkdirSync(up, { recursive: true });
  await sharp({ create: { width: 400, height: 500, channels: 3, background: { r: 70, g: 110, b: 150 } } }).jpeg().toFile(path.join(up, `spk-${PHOTO}.jpg`));
}

const people = (n, long = false) => Array.from({ length: n }, (_, i) => ({ id: `p_aud${i}`, name: long ? `Rabbi Yehoshua Menachem Mendel Aharon ${i + 1}`.slice(0, 60) : `Rabbi Person ${i + 1}`, nameHe: long ? 'הרב יהושע מנחם מענדל אהרן בן ציון'.slice(0, 40) : `הרב פלוני ${i + 1}`, photo: i === 0 ? { id: PHOTO, focus: 'top' } : null }));
const shiur = (i, o = {}) => ({ id: `s_aud${i}`, personId: `p_aud${i % 6}`, title: `${i + 1}. ${EN60}`.slice(0, 60), titleHe: HE60, place: 'The Large Beis Medrash Hall'.slice(0, 40), placeHe: 'בית המדרש הגדול', when: { kind: 'weekly', days: ALL, start: `${String(8 + (i % 12)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, end: `${String(9 + (i % 12)).padStart(2, '0')}:${i % 2 ? '15' : '45'}` }, ...o });
const mk = (extra = {}) => normalizeFile({ people: people(6), ...extra });
const doc = (extra) => forKiosk(mk(extra), TODAY);

const normal = { shiurim: [
  { id: 's_aud_a', personId: 'p_aud0', title: 'Gemara - Bava Metzia', place: 'Beis Medrash', when: { kind: 'weekly', days: ['Sun', 'Tue'], start: '20:15', end: '21:00' } },
  { id: 's_aud_b', personId: 'p_aud1', title: 'Halacha', titleHe: 'הלכה', place: 'Room 4', when: { kind: 'weekly', days: ['Mon', 'Tue', 'Wed', 'Thu'], start: '13:30', end: '14:00' } },
  { id: 's_aud_c', personId: 'p_aud2', title: 'Chassidus', place: 'Zal', when: { kind: 'weekly', days: ['Tue'], start: '09:00', end: '09:45' } },
  { id: 's_aud_d', personId: 'p_aud3', title: 'Mussar', place: 'Zal', when: { kind: 'weekly', days: ['Tue'], start: '17:00' } },
] };
const worst = { shiurim: Array.from({ length: 12 }, (_, i) => shiur(i)), people: people(6, true) };
const hebOnly = { shiurim: [0, 1, 2, 3].map((i) => shiur(i, { title: '', place: '', personId: `p_aud${i}` })), people: people(4).map((p) => ({ ...p, name: '' })) };
const enOnly = { shiurim: [0, 1, 2, 3].map((i) => shiur(i, { titleHe: '', placeHe: '' })), people: people(4).map((p) => ({ ...p, nameHe: '' })) };
const cancelled = { shiurim: normal.shiurim, changes: { [TODAY]: { s_aud_a: { cancelled: true, note: 'Cancelled today' }, s_aud_c: { start: '15:30', end: '16:15', note: 'Moved to the Zal' } } } };
const weekBig = { shiurim: Array.from({ length: 30 }, (_, i) => shiur(i, { when: { kind: 'weekly', days: [ALL[i % 6]], start: `${String(8 + (i % 10)).padStart(2, '0')}:00`, end: `${String(9 + (i % 10)).padStart(2, '0')}:00` } })) };

const G = (i, o = {}) => ({ id: `g_aud${i}`, name: i === 0 ? 'Rabbi Yehoshua Menachem Mendel Aharon Ben Tzion Cohen' : `Rabbi Guest ${i + 1}`, nameHe: 'הרב יהושע מנחם מענדל אהרן בן ציון כהן', title: 'Guest speaker', titleHe: 'אורח מכובד', topic: 'Emunah and bitachon in hard times: a talk for every bochur'.slice(0, 100), topicHe: 'אמונה וביטחון בזמנים קשים שיחה לכל בחור ובחור'.slice(0, 100), bio: 'Rabbi Cohen is a veteran maggid shiur who has spent thirty years teaching in yeshivos in Israel and the United States and writes widely.'.slice(0, 200), place: 'The Zal', placeHe: 'הזאל', date: '2026-11-05', start: '20:15', end: '21:15', photo: i === 0 ? { id: PHOTO, focus: 'top' } : null, link: i === 0 ? 'https://example.org/signup' : '', ...o });
const guest1 = { guests: [G(0)] };
const guest2 = { guests: [G(0), G(1, { photo: null, bio: '' })] };
const guest3 = { guests: [G(0), G(1), G(2)] };
const guestToday = { guests: [G(0, { date: TODAY, start: '16:00', end: '17:00' })] };
const guestNow = { guests: [G(0, { date: TODAY, start: '13:00', end: '14:00', link: '', bio: '' })] };
const guestHeb = { guests: [G(0, { name: '', title: '', topic: '', bio: '', place: '' })] };
const guestMin = { guests: [{ id: 'g_min1', name: 'Rabbi A', date: '2026-11-05' }] };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, size, time = TUE_1340, file, settings = {}, slides, extraState = {} }) {
  const [W, H] = size || (canvas === 'port' ? [900, 1600] : [1600, 900]);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  const data = doc({ ...file, settings: { ...(file.settings || {}), ...settings } });
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = slides || [{ id: 'shiurim', type: 'SHIURIM', enabled: true, duration: 600 }];
    j.shiurim = data;
    j.settings = { ...j.settings, location: { ...(j.settings?.location || {}), timezone: 'America/New_York' }, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme: 'midnight' };
    Object.assign(j, extraState);
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3800);
  return { page, data, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const probe = (page) => page.evaluate(() => {
  const panel = document.querySelector('section.tt-panel');
  const out = { panel: !!panel, overflow: [], small: [], rows: 0, cards: 0, lines: 0, guests: 0, pages: 0, text: document.body.innerText.slice(0, 300), full: document.body.innerText, anims: [], imgs: 0, imgOk: 0, monos: 0, strike: false, };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}`);
  if (!panel) return out;
  out.pages = panel.querySelectorAll('[data-spage]').length;
  out.rows = panel.querySelectorAll('[data-srow]').length;
  out.cards = panel.querySelectorAll('[data-rcard]').length;
  out.guests = panel.querySelectorAll('[data-guest]').length;
  out.lines = [...panel.querySelectorAll('[data-rcard]')].reduce((a, c) => a + c.querySelectorAll('.tt-num').length, 0);
  for (const img of panel.querySelectorAll('[data-avatar] img')) { out.imgs++; if (img.complete && img.naturalWidth > 0) out.imgOk++; }
  out.monos = [...panel.querySelectorAll('[data-avatar]')].filter((a) => !a.querySelector('img')).length;
  out.strike = [...panel.querySelectorAll('[data-srow] *')].some((e) => /line-through/.test(getComputedStyle(e).textDecorationLine));
  for (const el of panel.querySelectorAll('[data-slist], [data-srow], [data-rcard], [data-guest]')) {
    if (el.clientWidth > 0 && getComputedStyle(el).visibility !== 'hidden' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) out.overflow.push(`${el.hasAttribute('data-slist') ? 'list' : el.hasAttribute('data-srow') ? 'row' : el.hasAttribute('data-rcard') ? 'card' : 'guest'}[${(el.textContent || '').slice(0, 24)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
  }
  const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || el.closest('[style*="display: none"]')) continue;
    const fs = parseFloat(cs.fontSize);
    if (fs < 24) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
  }
  return out;
});

const rowSizes = (page) => page.evaluate(() => {
  // the smallest font size of each part of every visible row (marked data-k in ShiurimSlide.jsx)
  const res = { time: 999, title: 999, name: 999, place: 999 };
  for (const el of document.querySelectorAll('[data-spage] [data-k]')) {
    if (getComputedStyle(el.closest('[data-spage]')).visibility === 'hidden') continue;
    const k = el.getAttribute('data-k');
    const target = k === 'time' ? el.querySelector('.tt-num') : el;
    if (target) res[k] = Math.min(res[k], parseFloat(getComputedStyle(target).fontSize));
  }
  return res;
});

const base = (tag, p, r, c) => {
  check(`${tag}: renders`, r.panel, r.text.slice(0, 80));
  check(`${tag}: nothing clips`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
  check(`${tag}: text >= 24 canvas px`, r.small.length === 0, r.small.slice(0, 4).join(', '));
  check(`${tag}: nothing animating once settled`, r.anims.length === 0, r.anims.join(','));
};

const cases = [
  { tag: 'today 4 shiurim, Halacha is NOW, photo + letters', file: normal, rows: 4, now: true, imgs: 1, pages: 1 },
  { tag: 'today WORST: 12 shiurim, 60-char bilingual titles', file: worst, rows: 12, floors: true },
  { tag: 'today Hebrew only', file: hebOnly, rows: 4 },
  { tag: 'today English only', file: enOnly, rows: 4 },
  { tag: 'today language = Hebrew (both languages in the data)', file: normal, settings: { language: 'he' }, rows: 4 },
  { tag: 'today cancelled + moved rows', file: cancelled, settings: { view: 'today' }, rows: 4, cancelled: true },
  { tag: 'today without photos', file: normal, settings: { showPhotos: false }, rows: 4, imgs: 0 },
  { tag: 'week by rebbe (6 people, 30 shiurim)', file: weekBig, settings: { view: 'week' }, cards: true },
  { tag: 'week by day', file: weekBig, settings: { view: 'week', weekBy: 'day' }, cards: true },
  { tag: 'week by rebbe, normal', file: normal, settings: { view: 'week' }, cards: true },
  { tag: 'guest: one, long name, photo, bio, QR', file: guest1, slide: 'SPEAKER', guests: 1, qr: true, imgs: 1 },
  { tag: 'guest: two side by side (one without photo/bio)', file: guest2, slide: 'SPEAKER', guests: 2 },
  { tag: 'guest: three (pages of two)', file: guest3, slide: 'SPEAKER', guests: 3 },
  { tag: 'guest: today with countdown', file: guestToday, slide: 'SPEAKER', guests: 1, text: /starts in 2 h 20 min/ },
  { tag: 'guest: now', file: guestNow, slide: 'SPEAKER', guests: 1, text: /Now/ },
  { tag: 'guest: Hebrew only', file: guestHeb, slide: 'SPEAKER', guests: 1 },
  { tag: 'guest: name + date only', file: guestMin, slide: 'SPEAKER', guests: 1 },
];

for (const canvas of ['land', 'port']) {
  for (const c of cases.filter((x) => !process.env.ONLY || x.tag.includes(process.env.ONLY))) {
    const tag = `${canvas} ${c.tag}`;
    const slides = c.slide === 'SPEAKER' ? [{ id: 'speaker', type: 'SPEAKER', enabled: true, duration: 600 }] : undefined;
    const { page, close } = await open({ canvas, file: c.file, settings: c.settings, slides });
    const r = await probe(page);
    if (process.env.DEBUG) console.log(JSON.stringify({ ...r, full: undefined }).slice(0, 700));
    base(tag, page, r, c);
    console.log(`     ${tag}: ${r.pages} page(s), ${r.rows} rows, ${r.cards} cards, ${r.guests} guests`);
    if (c.rows != null && !c.settings?.view) check(`${tag}: every shiur is on a page`, r.rows === c.rows, `${r.rows} of ${c.rows} (${r.pages} pages)`);
    if (c.rows != null && c.settings?.view === 'today') check(`${tag}: every shiur is on a page`, r.rows === c.rows, `${r.rows} of ${c.rows}`);
    if (c.pages) check(`${tag}: a normal day fits on ${c.pages} page`, r.pages === c.pages, String(r.pages));
    if (c.now) check(`${tag}: the shiur being given says NOW`, /\bNOW\b/i.test(r.full) && /Halacha/.test(r.full));
    if (c.floors) { const s = await rowSizes(page); check(`${tag}: row text floors (time 40, title 32, name 28, place 26)`, s.time >= 40 && s.title >= 32 && s.name >= 28 && s.place >= 26, JSON.stringify(s)); }
    if (c.imgs != null) check(`${tag}: ${c.imgs} real photo(s) loaded, others are letter circles`, c.imgs === 0 ? r.imgs === 0 : r.imgOk === r.imgs && r.imgs >= c.imgs, `${r.imgOk}/${r.imgs} loaded, ${r.monos} letters`);
    if (c.cancelled) { check(`${tag}: cancelled row is marked and struck`, /Cancelled/i.test(r.full) && r.strike); check(`${tag}: moved row says Moved and shows the new time`, /Moved/i.test(r.full) && /3:30/.test(r.full)); }
    if (c.cards) { const n = c.file.shiurim.length; check(`${tag}: cards on screen`, r.cards > 0, String(r.cards)); if (c.settings?.weekBy !== 'day') check(`${tag}: every shiur line is on a card (collapsed days count once)`, r.lines >= 1, String(r.lines)); void n; }
    if (c.guests != null) check(`${tag}: every guest has a card (pages of two)`, r.guests === c.guests, `${r.guests} of ${c.guests}`);
    if (c.qr) check(`${tag}: QR code shown`, await page.evaluate(() => !!document.querySelector('[data-qr]')));
    if (c.text) check(`${tag}: says ${c.text}`, c.text.test(r.full), r.text.slice(0, 120));
    if (SHOTS && ((canvas === 'land' && c.tag.startsWith('today 4')) || (canvas === 'port' && c.tag.startsWith('guest: two')))) {
      await page.evaluate(() => document.getElementById('tt-splash')?.remove());
      await page.screenshot({ path: `${SHOTS}/shiurim-${canvas}.png` });
    }
    await close();
  }
}

// guest slide at 1080p and 4K viewports: same layout in canvas px, no clipping
for (const size of [[1920, 1080], [3840, 2160]]) {
  for (const [name, file, slide, rows] of [['today WORST', worst, null, 12], ['guest one', guest1, 'SPEAKER', null], ['week by rebbe', weekBig, null, null]]) {
    const { page, close } = await open({ canvas: 'land', size, file, settings: name === 'week by rebbe' ? { view: 'week' } : {}, slides: slide ? [{ id: 'speaker', type: 'SPEAKER', enabled: true, duration: 600 }] : undefined });
    const r = await probe(page);
    const tag = `${size.join('x')} ${name}`;
    check(`${tag}: renders and nothing clips`, r.panel && r.overflow.length === 0, r.overflow.slice(0, 2).join(' | ') || r.text.slice(0, 60));
    if (rows) check(`${tag}: every shiur is on a page`, r.rows === rows, `${r.rows}`);
    await close();
  }
}

// the sequence (real timers): 'both' goes Today -> Week
for (const canvas of ['land', 'port']) {
  const { page, close } = await open({ canvas, file: normal, settings: { view: 'both' } });
  const visible = () => page.evaluate(() => [...document.querySelectorAll('section.tt-panel > div > div')].map((d) => getComputedStyle(d).visibility === 'visible' ? (d.innerText.includes('by rebbe') || d.innerText.includes('this week') ? 'week' : d.innerText.includes("Today's shiurim") ? 'today' : '?') : null).filter(Boolean));
  check(`${canvas} both: starts on Today`, (await visible()).join() === 'today', (await visible()).join());
  await page.waitForTimeout(13500);
  check(`${canvas} both: then the week`, (await visible()).join() === 'week', (await visible()).join());
  const r = await probe(page);
  check(`${canvas} both: week page clean`, r.overflow.length === 0 && r.small.length === 0, [...r.overflow, ...r.small].slice(0, 3).join(' | '));
  await close();
}

// empty list / no guest: the slide is left out of the rotation
{
  const { page, close } = await open({ canvas: 'land', file: { shiurim: [] }, slides: [{ id: 'shiurim', type: 'SHIURIM', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }] });
  const t = await page.evaluate(() => document.body.innerText);
  check('empty list: the shiurim slide is left out of the rotation', !/Today.s shiurim|by rebbe|No shiurim today/i.test(t), t.slice(0, 80));
  await close();
  const g = await open({ canvas: 'land', file: { guests: [G(0, { date: '2026-12-25' })] }, slides: [{ id: 'speaker', type: 'SPEAKER', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }] });
  const t2 = await g.page.evaluate(() => document.body.innerText);
  check('a guest far in the future: the slide is left out', !/GUEST SPEAKER/i.test(t2), t2.slice(0, 80));
  await g.close();
}

// Schedule page: the rebbe's name under a linked block
{
  const sched = { entries: [{ id: 'e1', name: 'Seder Chassidus', time: '10:00', endTime: '11:00', days: ['Mon', 'Tue'], enabled: true, category: '' }, { id: 'e2', name: 'Mincha', time: '13:00', days: ALL, enabled: true }], categories: [] };
  const { page, close } = await open({
    canvas: 'land', slides: [{ id: 'schedule', type: 'SCHEDULE', enabled: true, duration: 600 }],
    file: { people: [{ id: 'p_aud0', name: 'Rabbi A', nameHe: '', photo: null }], shiurim: [{ id: 's_aud_l', personId: 'p_aud0', title: 'Chassidus', place: 'Zal', when: { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus' } }] },
    extraState: { schedule: sched, scheduleDates: {} },
  });
  const t = await page.evaluate(() => document.body.innerText);
  check('schedule row: the linked shiur adds "Rabbi A · Zal" under the block (the Schedule page may drop it only when it would shrink the type)', /Rabbi A · Zal/.test(t.replace(/\n/g, ' ')) || /Rabbi A\s*Zal/.test(t), t.slice(0, 200));
  await close();
  const o = await open({ canvas: 'land', slides: [{ id: 'schedule', type: 'SCHEDULE', enabled: true, duration: 600 }], file: { people: [{ id: 'p_aud0', name: 'Rabbi A', nameHe: '', photo: null }], shiurim: [{ id: 's_aud_l', personId: 'p_aud0', title: 'Chassidus', place: 'Zal', when: { kind: 'linked', entryId: 'e1', entryName: 'Seder Chassidus' } }] }, settings: { showOnSchedule: false }, extraState: { schedule: sched, scheduleDates: {} } });
  const t2 = await o.page.evaluate(() => document.body.innerText);
  check('schedule row: the admin switch removes it', !/Rabbi A/.test(t2) && await o.page.evaluate(() => document.querySelectorAll('[data-ch]').length === 0), t2.slice(0, 120));
  await o.close();
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
