#!/usr/bin/env node
/**
 * Takeover audit (Playwright): renders every style x layout on the kiosk against a
 * THROWAWAY server and checks it. Never point it at a real Pi: it only reads
 * /screen and /api/state (it injects the test announcement into the /api/state
 * response in the browser, nothing is written to the server's data/).
 *
 *   node scripts/takeover-audit.mjs --base http://127.0.0.1:3000 [options]
 *
 *   --base URL        server to test (default http://127.0.0.1:3000)
 *   --out DIR         screenshots, sheets and report.json (default ./takeover-audit-out)
 *   --canvas LIST     land,16x10,port  (default land = 1600x900)
 *   --len LIST        real (the designer's sample for the style), s, m, l = one word / typical / at
 *                     the composer limits (default real)
 *   --styles LIST     only these styles       --layouts LIST   only these layouts
 *   --theme ID        theme (default midnight; light themes: ivory, sky, ...)
 *   --hescale N       hebrewFontScale to render with (default 1)
 *   --no-sheets       skip the contact sheets    --shots   save every render as a PNG
 *
 * Per render it fails on: page errors, text under its slot's min or under 20 px, a
 * clipped / over-full slot, a stack taller than its box, text outside the content box,
 * text touching a side graphic or the clock / ב״ה, and any animation that is not
 * transform/opacity (plus the hygiene rules in docs/claude/GOTCHAS.md "Takeover
 * animation rules": no filter/blur/blend/shadow animation, <= 10 looping layers,
 * entrance <= 1.2 s, seamless loops, nothing moves for Animation=entrance/off or
 * prefers-reduced-motion). Exit code 1 if anything fails.
 *
 * Playwright is not a project dependency: it is loaded from PLAYWRIGHT_PATH, the
 * project's node_modules, or the global npm root.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { STYLES: STYLE_LIST, LAYOUTS: LAYOUT_LIST, toItem, sampleFor } = await import(path.join(ROOT, 'src/shared/takeoverSamples.js'));

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright'];
  try { tries.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch { /* no npm */ }
  for (const t of tries.filter(Boolean)) {
    try { return createRequire(import.meta.url)(t); } catch { /* next */ }
  }
  throw new Error('Playwright not found: npm i -g playwright (or set PLAYWRIGHT_PATH)');
}

function parseArgs(argv) {
  const o = { base: 'http://127.0.0.1:3000', out: 'takeover-audit-out', canvas: 'land', len: 'real', theme: 'midnight', hescale: 1, sheets: true, shots: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-sheets') o.sheets = false;
    else if (a === '--shots') o.shots = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
  }
  o.canvases = String(o.canvas).split(',');
  o.lens = String(o.len).split(',');
  o.styleSel = o.styles ? o.styles.split(',') : STYLE_LIST;
  o.layoutSel = o.layouts ? o.layouts.split(',') : LAYOUT_LIST;
  return o;
}

const CANVAS = { land: [1600, 900], '16x10': [1600, 1000], port: [900, 1600] };
const LIGHT_THEMES = new Set(['parchment', 'clean-white', 'ivory', 'sky', 'stone']);

/** Runs in the page: layout + animation checks for the rendered stage. */
function inPage(expect) {
  const out = { fails: [], info: {} };
  const root = document.querySelector('.tkr');
  if (!root) { out.fails.push('no .tkr stage rendered'); return out; }
  const stage = root.querySelector('.stage');
  const sr = stage.getBoundingClientRect();
  const k = sr.width / stage.offsetWidth || 1;          // layout px = screen px / k
  const rel = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k }; };
  const box = JSON.parse(root.dataset.box), art = JSON.parse(root.dataset.art || '[]');
  const [bl, bt, br, bb] = box;
  const hit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;

  // 1. fit slots
  root.querySelectorAll('.fit').forEach((el) => {
    const name = el.className.replace(/\s+/g, '.').slice(0, 40);
    if (el.dataset.over) out.fails.push(`${name}: text does not fit even at its minimum size`);
    if (el.scrollWidth > el.clientWidth + 1) out.fails.push(`${name}: clipped horizontally (${el.scrollWidth} > ${el.clientWidth})`);
    if (!el.classList.contains('nw') && el.scrollHeight > el.clientHeight + parseFloat(getComputedStyle(el).fontSize) * 0.2 + 1) out.fails.push(`${name}: clipped vertically`);
  });
  // 2. stack taller than its box
  root.querySelectorAll('.lyt').forEach((l) => {
    const bottom = Math.max(...[...l.children].map((c) => c.offsetTop + c.offsetHeight));
    if (bottom > l.clientHeight + 4) out.fails.push(`layout stack taller than its box (${bottom} > ${l.clientHeight})`);
  });

  // 3. every text leaf: >= 20 px, inside the content box, off the side graphic and the chrome
  const chrome = [...root.querySelectorAll('.chrome')].map(rel);
  const leaves = [...root.querySelectorAll('.box *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  let minPx = 999;
  for (const el of leaves) {
    const cs = getComputedStyle(el), px = parseFloat(cs.fontSize);
    minPx = Math.min(minPx, px);
    const label = `"${el.textContent.trim().slice(0, 18)}"`;
    if (px < 19.5 && !el.closest('.pg')) out.fails.push(`${label} is ${px.toFixed(1)}px (< 20)`);
    const r = rel(el);
    if (r.w === 0 || r.h === 0) continue;
    if (r.x < bl - 4 || r.x + r.w > br + 4 || r.y < bt - 4 || r.y + r.h > bb + 4) out.fails.push(`${label} outside the content box`);
    for (const a of art) if (hit(r, a)) out.fails.push(`${label} touches a side graphic`);
    for (const c of chrome) if (hit(r, c, 2)) out.fails.push(`${label} touches the clock / ב״ה`);
  }
  out.info.minFontPx = +minPx.toFixed(1);

  // 4. animation hygiene
  const anims = document.getAnimations();
  const OK = new Set(['transform', 'opacity']);
  const SKIP = new Set(['offset', 'easing', 'composite', 'computedOffset']);
  let loops = 0, longest = 0;
  const kinds = new Set();
  for (const a of anims) {
    const t = a.effect.getComputedTiming();
    const kf = a.effect.getKeyframes();
    const props = [...new Set(kf.flatMap((x) => Object.keys(x)).filter((p) => !SKIP.has(p)))];
    const bad = props.filter((p) => !OK.has(p));
    if (bad.length) out.fails.push(`animation ${a.animationName || a.id} animates ${bad.join(',')} (only transform/opacity allowed)`);
    if (Number.isFinite(t.iterations)) { longest = Math.max(longest, t.endTime); continue; }
    loops++; kinds.add(a.animationName);
    const first = kf[0], last = kf[kf.length - 1], dir = t.direction;
    let seamless = dir === 'alternate' || dir === 'alternate-reverse' || (first.opacity === last.opacity && first.transform === last.transform) || (+first.opacity === 0 && +last.opacity === 0);
    if (!seamless && a.animationName === 'kSpin') seamless = /360deg/.test(last.transform);
    if (!seamless && (a.animationName === 'kFall' || a.animationName === 'kDrift')) seamless = true;   // period translate over duplicated content
    if (!seamless) out.fails.push(`loop ${a.animationName} is not seamless`);
  }
  out.info.loops = loops; out.info.longestEntranceMs = Math.round(longest); out.info.loopKinds = [...kinds].join(',');
  if (longest > 1200 + 1) out.fails.push(`entrance takes ${Math.round(longest)} ms (> 1200)`);
  if (loops > 10) out.fails.push(`${loops} looping layers (> 10)`);
  if (expect.anim === 'full' && expect.style === 'quiet' && loops) out.fails.push('quiet must not loop');
  if (expect.anim !== 'full' && loops) out.fails.push(`${loops} loops running with Animation=${expect.anim}`);
  if (expect.anim === 'off' && anims.length) out.fails.push(`${anims.length} animations running with Animation=off`);
  for (const sh of document.styleSheets) {
    let rules; try { rules = sh.cssRules; } catch { continue; }
    for (const rule of rules) if (rule.type === CSSRule.KEYFRAMES_RULE) for (const f of rule.cssRules) {
      if (/filter|blur|blend|shadow|clip/.test(f.style.cssText)) out.fails.push(`@keyframes ${rule.name} uses ${f.style.cssText}`);
    }
  }
  let bad = 0;
  root.querySelectorAll('*').forEach((e) => { const cs = getComputedStyle(e); if (cs.filter !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none') || cs.mixBlendMode !== 'normal') bad++; });
  if (bad) out.fails.push(`filter / backdrop-filter / blend mode on ${bad} elements`);
  return out;
}

async function contactSheet(pw, files, cols, cellW, out) {
  if (!files.length) return;
  const cellH = Math.round(cellW * 9 / 16);
  const html = `<body style="margin:0;background:#777;display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:4px">${files.map((f) => `<figure style="margin:0;position:relative"><img src="file://${f.file}" style="width:${cellW}px;height:${cellH}px;display:block"><figcaption style="position:absolute;left:4px;bottom:4px;font:12px sans-serif;color:#fff;background:#0009;padding:1px 5px;border-radius:3px">${f.label}</figcaption></figure>`).join('')}</body>`;
  const tmp = out + '.html'; fs.writeFileSync(tmp, html);
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: cols * (cellW + 4), height: Math.ceil(files.length / cols) * (cellH + 4) } });
  await p.goto('file://' + tmp); await p.waitForTimeout(500); await p.screenshot({ path: out });
  await b.close(); fs.unlinkSync(tmp);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const pw = loadPlaywright();
  fs.mkdirSync(o.out, { recursive: true });
  const shotDir = path.resolve(o.out, 'shots'); fs.mkdirSync(shotDir, { recursive: true });
  const browser = await pw.chromium.launch();
  const report = { options: { ...o, styleSel: undefined, layoutSel: undefined }, renders: 0, failures: [], per: {} };
  const shots = [];
  const light = LIGHT_THEMES.has(o.theme);
  for (const canvas of o.canvases) {
    const [W, H] = CANVAS[canvas];
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    for (const style of o.styleSel) for (const layout of o.layoutSel) for (const len of o.lens) {
      for (const anim of ['full']) {
        const m = sampleFor(style, layout, len === 'real' ? null : len);
        const item = toItem(style, layout, m, { look: { animation: anim } });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(e.message));
        page.on('console', (c) => { if (c.type() === 'error' && !/Failed to load resource|net::ERR/.test(c.text())) errs.push(c.text().slice(0, 200)); });
        await page.route('**/api/state', async (route) => {
          const r = await route.fetch(); const j = await r.json();
          j.announcements = [item];
          j.settings = { ...j.settings, theme: o.theme, themeAuto: { ...(j.settings?.themeAuto || {}), enabled: false }, hebrewFontScale: +o.hescale, fontRoles: {}, orientation: canvas === 'port' ? 'portrait' : 'landscape' };
          await route.fulfill({ response: r, json: j });
        });
        const tag = `${canvas}/${style}/${layout}/${len}`;
        try {
          await page.goto(o.base + '/screen', { waitUntil: 'load' });
          await page.waitForSelector('.tkr .stage', { timeout: 15000 });
          await page.waitForTimeout(1700);
          const res = await page.evaluate(inPage, { anim, style });
          const fails = [...errs.map((e) => `page error: ${e}`), ...res.fails];
          report.renders++;
          report.per[tag] = res.info;
          if (fails.length) report.failures.push({ tag, fails: [...new Set(fails)] });
          const file = path.join(shotDir, `${canvas}-${style}-${layout}-${len}.png`);
          if (o.shots || o.sheets) { await page.screenshot({ path: file }); shots.push({ canvas, style, layout, len, file, label: `${style} · ${layout}` }); }
          if (report.renders % 20 === 0) console.log(`  ${report.renders} renders, ${report.failures.length} with problems`);
        } catch (e) {
          report.failures.push({ tag, fails: [`render failed: ${e.message.split('\n')[0]}`] });
        }
        await page.close();
      }
    }
    // reduced-motion and the Animation setting: nothing may move
    for (const [anim, rm] of [['entrance', false], ['off', false], ['full', true]]) {
      const page = await (await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: rm ? 'reduce' : 'no-preference' })).newPage();
      const item = toItem('celebration', 'bigwords', sampleFor('celebration', 'bigwords'), { look: { animation: anim } });
      await page.route('**/api/state', async (route) => {
        const r = await route.fetch(); const j = await r.json();
        j.announcements = [item]; j.settings = { ...j.settings, theme: o.theme, themeAuto: { enabled: false } };
        await route.fulfill({ response: r, json: j });
      });
      await page.goto(o.base + '/screen', { waitUntil: 'load' });
      await page.waitForSelector('.tkr .stage'); await page.waitForTimeout(2200);
      const n = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
      report.renders++;
      if (n) report.failures.push({ tag: `${canvas}/motion/${anim}${rm ? '+reduced-motion' : ''}`, fails: [`${n} animations still running`] });
      await page.context().close();
    }
    await ctx.close();
  }
  await browser.close();

  if (o.sheets) {
    for (const canvas of o.canvases) for (const len of o.lens) {
      for (const style of o.styleSel) await contactSheet(pw, shots.filter((s) => s.canvas === canvas && s.style === style && s.len === len), 4, 480, path.resolve(o.out, `sheet-style-${canvas}-${len}-${style}.png`));
      for (const layout of o.layoutSel) await contactSheet(pw, shots.filter((s) => s.canvas === canvas && s.layout === layout && s.len === len), 6, 320, path.resolve(o.out, `sheet-layout-${canvas}-${len}-${layout}.png`));
    }
  }
  fs.writeFileSync(path.join(o.out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`${report.renders} renders (${light ? 'light' : 'dark'} theme ${o.theme}), ${report.failures.length} with problems`);
  for (const f of report.failures) console.log(`  FAIL ${f.tag}\n    - ${f.fails.join('\n    - ')}`);
  process.exit(report.failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
