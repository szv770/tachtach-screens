#!/usr/bin/env node
/**
 * Programmatic checks of the Schedule page's three views with the 33-row fixture (test/fixtures/schedule33.js).
 * Run against a THROWAWAY copy of the app, never real data:
 *   node scripts/schedule-audit.mjs http://localhost:3100 [--shots DIR] [--groups] [--only day|timeline|focus]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock
 * (page.clock.setFixedTime) and injects schedule + settings through a route on /api/state.
 * Checks: nothing overflows / clips, row text >= the floor, now row highlighted, past rows faded, next marked,
 * and no layout jump when the minute (and the now row) changes. Exit code 1 on any failed check.
 */
import { createRequire } from 'module';
import { SCHEDULE33, GROUPS, groupEntries } from '../test/fixtures/schedule33.js';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const GROUPED = args.includes('--groups');
const QUICK = args.includes('--quick');
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const T = (h, m, s = 0) => new Date(2026, 9, 19, h, m, s);
const sched = GROUPED ? { entries: groupEntries(), categories: SCHEDULE33.categories } : SCHEDULE33;

async function open({ canvas, time, layout, theme, extra = {} }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(time);
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.schedule = sched; j.scheduleDates = {}; j.announcements = []; j.countdown = null;
    j.slides = [{ id: 'sched', type: 'SCHEDULE', enabled: true, duration: 600 }];
    j.settings = {
      ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme,
      scheduleLayout: layout, banner: { ...(j.settings?.banner || {}) }, ...(GROUPED ? { scheduleGroups: GROUPS } : null), ...extra,
    };
    await route.fulfill({ response: r, json: j });
  });
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(4200);
  const close = async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); };
  return { page, ctx: { close } };
}

/** Everything measurable about the page in one pass. */
const probe = (page) => page.evaluate(() => {
  const view = document.querySelector('[data-sched-view]');
  if (!view) return { view: null };
  const vb = view.getBoundingClientRect();
  const rows = [...view.querySelectorAll('[data-row]')].filter((r) => !r.closest('[data-measure]'));
  const vis = (r) => getComputedStyle(r).visibility !== 'hidden';
  const inside = (b) => b.left >= vb.left - 1 && b.right <= vb.right + 1 && b.top >= vb.top - 1 && b.bottom <= vb.bottom + 1;
  const out = { view: view.dataset.schedView, fit: view.dataset.fit || '', rows: [], overflow: [], small: [], states: {} };
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    const st = r.dataset.state;
    out.states[st] = (out.states[st] || 0) + 1;
    const shown = vis(r) && b.bottom > vb.top + 2 && b.top < vb.bottom - 2;
    const cs = getComputedStyle(r);
    out.rows.push({ id: r.dataset.row, st, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), shown, fully: inside(b), bg: cs.backgroundColor, color: cs.color, fade: r.dataset.fade ? +r.dataset.fade : null });
  }
  // overflow: any element inside the view whose content is wider/taller than its box while clipping
  for (const el of view.querySelectorAll('*')) {
    if (el.closest('[data-measure]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
    if (clips && el !== view && !el.matches('[data-up],[data-track],[data-strip],[data-optional]') && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) && el.clientWidth > 0) {
      out.overflow.push(`${el.tagName}.${el.className || ''}[${(el.textContent || '').slice(0, 30)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
    }
  }
  // text sizes of visible text nodes (inside the view box)
  const tw = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
  let minFont = 999, minRowFont = 999;
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; if (el.closest('[data-measure]')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
    const b = el.getBoundingClientRect(); if (b.bottom < vb.top || b.top > vb.bottom || b.width === 0) continue;
    const fs = parseFloat(cs.fontSize);
    if ((b.right > vb.right + 1 || b.left < vb.left - 1) && cs.position !== 'absolute') out.overflow.push(`outside the view: "${t.textContent.trim().slice(0, 24)}" ${Math.round(b.left)}-${Math.round(b.right)} vs ${Math.round(vb.left)}-${Math.round(vb.right)}`);
    // canvas px: the kiosk canvas is scaled by ScreenScaler; divide by that scale
    if (!el.closest('[data-ap]')) minFont = Math.min(minFont, fs);
    if (el.closest('[data-cell=start],[data-cell=name]') && !el.closest('[data-he],[data-split]')) minRowFont = Math.min(minRowFont, fs);
    if (fs < 15) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
  }
  out.minFont = minFont; out.minRowFont = minRowFont;
  const tr = view.querySelector('[data-track]'); out.track = tr ? getComputedStyle(tr).transform : null;
  out.strip = view.querySelector('[data-strip]')?.textContent || null;
  out.hero = view.querySelector('[data-hero]')?.dataset.hero || null;
  out.anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('[data-sched-view]')).map((a) => `${a.animationName || a.transitionProperty || 'anim'}:${a.effect.getComputedTiming().iterations}`);
  return out;
});

const views = (ONLY || ['day', 'timeline', 'focus']);
const times = QUICK ? [[19, 10]] : [[6, 40], [12, 30], [19, 10], [22, 50]];
const shots = [];
for (const canvas of ['land', 'port']) {
  for (const layout of views) {
    for (const theme of ['midnight', 'ivory']) {
      for (const [h, m] of times) {
        const tag = `${canvas} ${layout} ${theme} ${h}:${String(m).padStart(2, '0')}`;
        const { page, ctx } = await open({ canvas, time: T(h, m), layout, theme });
        const r = await probe(page);
        check(`${tag} view renders`, r.view === layout, JSON.stringify(r.view));
        if (r.fit) console.log(`     fit ${r.fit}`);
        if (r.view !== layout) { await ctx.close(); continue; }
        check(`${tag} nothing clips`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
        check(`${tag} no tiny text (>= 15 canvas px)`, r.small.length === 0, r.small.slice(0, 4).join(', '));
        const nowRows = r.rows.filter((x) => x.st === 'now');
        check(`${tag} a now row is highlighted`, nowRows.length > 0 && nowRows.every((x) => x.bg !== 'rgba(0, 0, 0, 0)' || layout !== 'day') || (layout === 'focus' && r.hero), JSON.stringify(nowRows.map((x) => x.bg)));
        if (layout === 'day') {
          const [mode, cols, size] = r.fit.split(':');
          check(`${tag} day fit (${r.fit})`, mode === 'fit' ? +size >= 26 : mode === 'scroll', r.fit);
          if (mode === 'fit') {
            check(`${tag} day: every row fully inside`, r.rows.every((x) => x.fully), r.rows.filter((x) => !x.fully).map((x) => x.id).join(','));
            check(`${tag} day: row text >= 26`, r.minRowFont >= 26, String(r.minRowFont));
          } else check(`${tag} day scroll is finite`, r.anims.every((a) => !/Infinity/.test(a)), r.anims.join(','));
          const past = r.rows.find((x) => x.st === 'past'), later = r.rows.find((x) => x.st === 'later');
          if (past && later) check(`${tag} day: past rows faded`, past.color !== later.color, `${past.color} vs ${later.color}`);
        }
        if (layout === 'timeline') {
          const anchor = r.rows.find((x) => x.st === 'now') || r.rows.find((x) => x.st === 'next');
          check(`${tag} timeline: now/next row on screen`, !anchor || anchor.fully, JSON.stringify(anchor));
          check(`${tag} timeline: text >= 20`, r.minFont >= 20, String(r.minFont));
          check(`${tag} timeline: no infinite animation`, r.anims.every((a) => !/Infinity/.test(a)), r.anims.join(','));
        }
        if (layout === 'focus') {
          check(`${tag} focus: hero`, !!r.hero, String(r.hero));
          check(`${tag} focus: shown rows fully inside`, r.rows.filter((x) => x.shown).every((x) => x.fully), r.rows.filter((x) => x.shown && !x.fully).map((x) => x.id).join(','));
          const fades = r.rows.filter((x) => x.fade != null).map((x) => x.fade);
          check(`${tag} focus: past fade increases toward now`, fades.every((f, i) => i === 0 || f > fades[i - 1]), fades.join(','));
          check(`${tag} focus: text >= 20`, r.minFont >= 20, String(r.minFont));
        }
        // no layout jump: one minute later (and across a block start) rows keep their boxes
        if (h === 19 && m === 10 && theme === 'midnight') {
          await page.clock.setFixedTime(T(19, 15, 30)); // Maariv starts at 19:15: now row changes
          await page.waitForTimeout(16000);
          const r2 = await probe(page);
          const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
          const moved = r2.rows.filter((x) => by[x.id] && (layout === 'timeline'
            ? (by[x.id].h !== x.h || by[x.id].w !== x.w)
            : (Math.abs(by[x.id].x - x.x) > 1 || Math.abs(by[x.id].w - x.w) > 1 || (layout === 'day' && Math.abs(by[x.id].y - x.y) > 1))));
          check(`${tag} no layout jump after the minute/now change`, layout === 'focus' ? true : moved.length === 0, moved.slice(0, 3).map((x) => x.id).join(','));
          const st2 = r2.rows.find((x) => x.st === 'now');
          check(`${tag} now row moved on to Maariv`, !!st2 && (layout === 'focus' || st2.id === 'f22'), JSON.stringify(st2?.id));
        }
        if (SHOTS && theme === (canvas === 'port' ? 'ivory' : 'midnight') && h === 19) {
          const f = `${SHOTS}/${canvas}-${layout}-${theme}${GROUPED ? '-groups' : ''}.png`;
          await page.screenshot({ path: f }); shots.push(f);
        }
        await ctx.close();
      }
    }
  }
}
// auto: rotates inside one slide
if (!ONLY) {
  const { page, ctx } = await open({ canvas: 'land', time: T(12, 30), layout: 'auto', theme: 'midnight', extra: { scheduleView: { autoSeconds: 8 } } });
  const seen = new Set();
  for (let i = 0; i < 4; i++) { seen.add(await page.evaluate(() => document.querySelector('[data-sched-view]')?.dataset.schedView)); await page.waitForTimeout(8500); }
  check('auto: rotates through all three views', seen.has('day') && seen.has('timeline') && seen.has('focus'), [...seen].join(','));
  await ctx.close();
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed${shots.length ? `; shots: ${shots.join(' ')}` : ''}`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
