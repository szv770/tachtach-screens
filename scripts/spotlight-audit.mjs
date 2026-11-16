#!/usr/bin/env node
/**
 * Programmatic checks of the Spotlight graphics (src/screen/spotlight), through the dev preview (scripts/spotlight-preview).
 *   npx vite --config scripts/spotlight-preview/vite.config.mjs &      (serves http://127.0.0.1:5199)
 *   node scripts/spotlight-audit.mjs [http://127.0.0.1:5199] [--sheet out.png [--pick tag,tag]] [--only flip] [--quick]
 * Per case (every kind at its stages, the seal (major / notable), every story act, the Day hero; landscape 1600x900 +
 * portrait 900x1600; English+Hebrew ('both') and Hebrew RTL; dark + light themes):
 *   - no page error; the canvas and the expected view render;
 *   - no text leaves the canvas; every fitted text fits its box (scroll <= client); no two text blocks overlap;
 *   - text >= 24 canvas px (Hebrew runs too);
 *   - motion budget: every animation moves ONLY transform / opacity; at most 7 looping animations; no filter /
 *     backdrop-filter / mix-blend-mode / mask anywhere on the canvas;
 *   - reduced motion: zero animations, and the view still renders.
 * --sheet: a small contact sheet (quarter-size shots of a sample of cases) for a human look.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const sharp = createRequire(import.meta.url)('sharp');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:5199';
const SHEET = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const QUICK = args.includes('--quick');
const PICK = args.includes('--pick') ? args[args.indexOf('--pick') + 1].split(',') : null; // sheet: exactly these case tags
const MAX_LOOPS = 7;

const KIND_STAGES = {
  flip: ['week', 'eve'], ring: ['month', 'lastHour'], journey: ['announce', 'eve'], glow: ['twoWeeks', 'lastHour'],
  calendar: ['month', 'week'], meter: ['announce'], sleeps: ['week'], odometer: ['lastHour', 'month'],
};
const cases = [];
const SIZES = { land: [1600, 900], port: [900, 1600] };
for (const [type, stages] of Object.entries(KIND_STAGES)) {
  for (const stage of stages) {
    for (const o of ['land', 'port']) {
      for (const lang of ['both', 'hebrew']) cases.push({ tag: `${type}-${stage}-${o}-${lang}`, q: { view: 'count', type, stage, lang }, o, sheet: lang === 'both' && stage === stages[0] });
    }
    cases.push({ tag: `${type}-${stage}-land-light`, q: { view: 'count', type, stage, theme: 'parchment' }, o: 'land', sheet: stage === stages[0] && ['flip', 'ring', 'glow'].includes(type) });
  }
}
for (const tier of ['major', 'notable']) for (const o of ['land', 'port']) for (const lang of ['both', 'hebrew']) cases.push({ tag: `seal-${tier}-${o}-${lang}`, q: { view: 'seal', tier, stage: 'week', lang }, o, sheet: lang === 'both' && o === 'land' });
cases.push({ tag: 'seal-major-land-light', q: { view: 'seal', tier: 'major', stage: 'week', theme: 'ivory' }, o: 'land' });
for (const act of ['happened', 'history', 'vort', 'photo', 'story']) for (const o of ['land', 'port']) for (const lang of ['both', 'hebrew']) cases.push({ tag: `act-${act}-${o}-${lang}`, q: { view: `act:${act}`, stage: 'month', lang }, o, sheet: lang === 'both' && o === 'land' && ['history', 'photo'].includes(act) });
for (const photo of ['1', '0']) for (const o of ['land', 'port']) cases.push({ tag: `day-photo${photo}-${o}`, q: { view: 'day', photo }, o, sheet: o === 'land' && photo === '1' });
cases.push({ tag: 'flip-week-land-long', q: { view: 'count', type: 'flip', stage: 'week', long: '1' }, o: 'land' });
cases.push({ tag: 'act-story-land-long', q: { view: 'act:story', long: '1' }, o: 'land' });
cases.push({ tag: 'day-port-long-hebrew', q: { view: 'day', long: '1', lang: 'hebrew' }, o: 'port' });
cases.push({ tag: 'journey-eve-port-sheet', q: { view: 'count', type: 'journey', stage: 'eve' }, o: 'port', sheet: true });
cases.push({ tag: 'calendar-week-port-hebrew-sheet', q: { view: 'count', type: 'calendar', stage: 'week', lang: 'hebrew' }, o: 'port', sheet: true });

let list = ONLY ? cases.filter((c) => c.tag.includes(ONLY)) : cases;
if (QUICK) list = list.filter((_, i) => i % 4 === 0);

const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) { fails.push(`${name} ${info}`); console.log(`FAIL ${name} ${String(info).slice(0, 300)}`); } };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux/chrome' }).catch(() => chromium.launch());
const shots = [];

async function run(c, reduced) {
  const [w, h] = SIZES[c.o];
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference', locale: 'en-US', timezoneId: 'America/New_York' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const qs = new URLSearchParams({ live: '1', ...c.q }).toString();
  await page.goto(`${BASE}/?${qs}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2300);
  const tag = `${c.tag}${reduced ? '-reduced' : ''}`;
  check(`${tag} no errors`, !errors.length, errors.join(' | '));
  const r = await page.evaluate(({ maxLoops }) => {
    const cv = document.querySelector('[data-sp-canvas]');
    if (!cv) return { missing: true };
    const k = cv.getBoundingClientRect().width / cv.offsetWidth;
    const cr = cv.getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { x: (b.left - cr.left) / k, y: (b.top - cr.top) / k, w: b.width / k, h: b.height / k }; };
    const out = { W: cv.offsetWidth, H: cv.offsetHeight, outside: [], unfit: [], small: [], overlap: [], forbidden: [], badAnim: [], loops: 0, anims: 0, view: '' };
    out.view = cv.querySelector('[data-sp-kind]')?.getAttribute('data-sp-kind') || cv.querySelector('[data-sp-view]')?.getAttribute('data-sp-view') || '';
    const texts = [];
    for (const el of cv.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.filter !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none') || cs.mixBlendMode !== 'normal' || (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) out.forbidden.push(el.className?.baseVal ?? el.className);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || el.closest('[aria-hidden]') || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('svg')) continue; // SVG text (the seal's ring) is geometry, checked by eye
      if (el.closest('[data-sp-glyph]')) continue; // a flip card / wheel: checked as one block below
      const b = rel(el);
      if (b.w < 1) continue;
      if (el.hasAttribute('data-sp-fit')) { const pt = parseFloat(cs.paddingTop) || 0; const pb = parseFloat(cs.paddingBottom) || 0; b.y += pt; b.h -= pt + pb; } // the fit's ink padding
      texts.push({ el, b, t: el.textContent.trim().slice(0, 40) });
      if (b.x < -2 || b.y < -2 || b.x + b.w > out.W + 2 || b.y + b.h > out.H + 2) out.outside.push(`${el.textContent.trim().slice(0, 30)} @${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}x${Math.round(b.h)}`);
      const fs = parseFloat(cs.fontSize);
      if (fs < 23.5) out.small.push(`${el.textContent.trim().slice(0, 24)}=${fs}`);
    }
    for (const g of cv.querySelectorAll('[data-sp-glyph]')) {
      const b = rel(g);
      texts.push({ el: g, b, t: `card ${g.textContent.trim().slice(0, 4)}` });
      if (b.x < -2 || b.y < -2 || b.x + b.w > out.W + 2 || b.y + b.h > out.H + 2) out.outside.push(`card @${Math.round(b.x)},${Math.round(b.y)}`);
    }
    for (const el of cv.querySelectorAll('[data-sp-fit]')) {
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) out.unfit.push(`${el.textContent.slice(0, 30)} ${el.scrollWidth}/${el.clientWidth} ${el.scrollHeight}/${el.clientHeight}`);
    }
    // text blocks that overlap (neither contains the other)
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i]; const b = texts[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ga = a.el.closest('[data-sp-glyph]'); if (ga && ga === b.el.closest('[data-sp-glyph]')) continue; // a flip card's halves / a wheel's strip
        const ix = Math.min(a.b.x + a.b.w, b.b.x + b.b.w) - Math.max(a.b.x, b.b.x);
        const iy = Math.min(a.b.y + a.b.h, b.b.y + b.b.h) - Math.max(a.b.y, b.b.y);
        if (ix > 4 && iy > 4) out.overlap.push(`"${a.t}" x "${b.t}"`);
      }
    }
    const anims = document.getAnimations();
    out.anims = anims.length;
    for (const an of anims) {
      const ef = an.effect;
      const timing = ef?.getTiming?.() || {};
      if (timing.iterations === Infinity && an.playState === 'running') out.loops++;
      const kf = ef?.getKeyframes?.() || [];
      const props = new Set(); kf.forEach((f) => Object.keys(f).forEach((p) => { if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) props.add(p); }));
      for (const p of props) if (!['transform', 'opacity'].includes(p)) out.badAnim.push(`${an.animationName || an.transitionProperty || '?'}:${p}`);
    }
    out.maxLoops = maxLoops;
    return out;
  }, { maxLoops: MAX_LOOPS });
  if (r.missing) { check(`${tag} canvas`, false, 'no canvas'); await ctx.close(); return; }
  const want = c.q.view === 'count' ? c.q.type : c.q.view === 'seal' ? 'seal' : c.q.view === 'day' ? 'day' : c.q.view.slice(4);
  check(`${tag} view`, r.view === want, `got ${r.view}`);
  check(`${tag} inside canvas`, !r.outside.length, r.outside.join('; '));
  check(`${tag} fits`, !r.unfit.length, r.unfit.join('; '));
  check(`${tag} text >= 24px`, !r.small.length, r.small.join('; '));
  check(`${tag} no overlap`, !r.overlap.length, r.overlap.slice(0, 4).join('; '));
  check(`${tag} no forbidden css`, !r.forbidden.length, r.forbidden.slice(0, 4).join('; '));
  check(`${tag} transform/opacity only`, !r.badAnim.length, [...new Set(r.badAnim)].join('; '));
  check(`${tag} loops <= ${MAX_LOOPS}`, r.loops <= MAX_LOOPS, `loops=${r.loops}`);
  if (reduced) check(`${tag} no animations`, r.anims === 0, `anims=${r.anims}`);
  if (SHEET && (PICK ? PICK.includes(c.tag) : c.sheet) && !reduced) shots.push({ tag, buf: await page.screenshot({ type: 'png' }), o: c.o });
  console.log(`ok   ${tag} (loops ${r.loops}, anims ${r.anims})`);
  await ctx.close();
}

for (const c of list) await run(c, false);
for (const c of list.filter((x, i) => i % 6 === 0)) await run(c, true);
await browser.close();

if (SHEET && shots.length) {
  const tw = 400; const th = 225; const pw = 127; const ph = 225; // quarter of 1600x900, ~quarter of 900x1600
  const cols = 4; let x = 0; let y = 0; let rowH = 0; const comps = [];
  for (const s of shots) {
    const w = s.o === 'land' ? tw : pw; const h = s.o === 'land' ? th : ph;
    if (x + w > cols * tw) { x = 0; y += rowH + 6; rowH = 0; }
    comps.push({ input: await sharp(s.buf).resize(w, h).png().toBuffer(), left: x, top: y });
    x += w + 6; rowH = Math.max(rowH, h);
  }
  await sharp({ create: { width: cols * tw + 18, height: y + rowH, channels: 3, background: { r: 128, g: 128, b: 128 } } }).composite(comps).png().toFile(SHEET);
  console.log(`sheet: ${SHEET} (${shots.length} shots: ${shots.map((s) => s.tag).join(', ')})`);
}
console.log(`\n${checks - fails.length}/${checks} checks passed, ${list.length} cases`);
process.exit(fails.length ? 1 : 0);
