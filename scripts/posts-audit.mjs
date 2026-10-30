#!/usr/bin/env node
/**
 * Programmatic checks of 'posts are real slides' at phone width (360 px): every post listed with a status chip, live
 * first, filters + search, the post popup (On/Off saves, 44 px targets, no sideways scroll), slide-style posts inline in
 * the Slides list + the Always-on layers group, moving a post, 'Show first', and 'Open it' on the post toast.
 *
 * Run against a THROWAWAY copy, never real data:
 *   1. node scripts/posts-audit.mjs --seed /tmp/x/data      (writes a test login + 8 sample posts; refuses the real data/)
 *   2. TACHTACH_DATA_DIR=/tmp/x/data PORT=3191 HOST=127.0.0.1 NODE_ENV=production node server.js   (after npx vite build)
 *   3. node scripts/posts-audit.mjs http://127.0.0.1:3191
 * Needs Playwright (/opt/node-tools) and chromium. Exit code 1 on any failed check.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

if (process.argv[2] === '--seed') {
  const dir = path.resolve(process.argv[3] || '');
  const real = path.resolve(new URL('../data', import.meta.url).pathname);
  if (!process.argv[3] || dir === real) { console.error('Give a scratch data folder (never the real data/).'); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  seedInto(dir);
  console.log('seeded', dir);
  process.exit(0);
}

function seedInto(dir) {
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = Date.now(); const iso = (h) => new Date(now + h * 3600000).toISOString();
fs.writeFileSync(`${dir}/users.json`, JSON.stringify({ version: 1, users: [{ id: 'u1', username: 'admin', name: 'Admin', role: 'admin', passwordHash: '$2b$12$abcdefghijklmnopqrstuuJ6zv8q6v5sM0fQz2kM7c0vD6q3P0o1y', totpSecret: null, totpEnabled: false, lastTotpStep: 0, trustedDevices: [], sessions: [{ hash: sha('testtoken123'), createdAt: iso(0), expiresAt: iso(24 * 20), lastSeen: iso(0) }], createdAt: iso(0), lastLoginAt: null }], links: [], preauth: [], lockouts: {} }));
const P = (id, h, extra = {}) => ({ id, createdAt: iso(h), updatedAt: iso(h), status: 'published', display: 'slide', hold: false, enabled: true, createdBy: 'Admin', createdById: 'u1', content: { headlineEn: `Message ${id} about the Siyum in the main zal tonight` }, look: { layout: 'bigwords', fit: 'auto' }, slide: { duration: 12, label: '' }, when: { startsAt: null, expiresAt: null, recurrence: null }, ...extra });
const items = [
  P('live1', -5), P('sched1', -2, { when: { startsAt: iso(20), expiresAt: null, recurrence: null } }), P('draft1', -1, { status: 'draft' }),
  P('ended1', -50, { when: { startsAt: null, expiresAt: iso(-3), recurrence: null } }), P('paused1', -10, { enabled: false }),
  P('ban1', -4, { display: 'banner', content: { headlineEn: 'Banner: Mivtzoim at 3' } }), P('note1', -3, { display: 'note', content: { headlineEn: 'Side note: bring siddur' } }),
  P('tk1', -6, { display: 'takeover', content: { headlineEn: 'Takeover later' }, when: { startsAt: iso(48), expiresAt: iso(49), recurrence: null } }),
];
fs.writeFileSync(`${dir}/announcements.json`, JSON.stringify({ version: 1, items }));

}

import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.argv.find((x) => x.startsWith('http')) || 'http://127.0.0.1:3191';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const fails = []; const check = (n, ok, info = '') => { if (!ok) fails.push(n + ' ' + info); console.log(`${ok ? 'ok  ' : 'FAIL'} ${n} ${ok ? '' : info}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium/chrome-linux/chrome', args: ['--no-sandbox'] }).catch(() => chromium.launch({ args: ['--no-sandbox'] }));
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
await ctx.addCookies([{ name: 'tachtach_session', value: 'testtoken123', url: BASE }]);
await ctx.addInitScript(() => { try { localStorage.setItem('tt.welcomeTour', '1'); localStorage.setItem('tt.tour.done', '1'); } catch {} });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const noSideScroll = async (label) => { const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth })); check(`${label}: no sideways scroll`, r.sw <= r.w + 1, JSON.stringify(r)); };
const smallTargets = (sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43.5; }).map((b) => (b.getAttribute('aria-label') || b.textContent).slice(0, 40)), sel);
const state = () => page.evaluate(() => fetch('/api/state').then((r) => r.json()));

await page.goto(BASE + '/admin/announcements', { waitUntil: 'networkidle' });
// close the tour if shown
for (const t of ['Skip', 'Close', 'Not now']) { const b = page.getByRole('button', { name: t }).first(); if (await b.isVisible().catch(() => false)) await b.click().catch(() => {}); }
await page.waitForSelector('[data-testid="announcement-row"]');
const statuses = await page.$$eval('[data-testid="announcement-row"]', (r) => r.map((x) => x.dataset.status));
check('every post listed (8)', statuses.length === 8, JSON.stringify(statuses));
check('live pinned on top', statuses.slice(0, 3).every((s) => s === 'live'), JSON.stringify(statuses));
await noSideScroll('Announcements 360');
const small = await smallTargets('[data-testid="announcement-row"] button, [data-testid^="posts-status"], select');
check('Announcements: 44px targets', small.length === 0, JSON.stringify(small));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/posts-360.png`, fullPage: false });
await page.click('[data-testid="posts-status-ended"]');
check('Ended filter', (await page.$$('[data-testid="announcement-row"]')).length === 1);
await page.click('[data-testid="posts-status-all"]');
await page.fill('[data-testid="posts-search"]', 'mivtzoim');
check('search by text', (await page.$$('[data-testid="announcement-row"]')).length === 1);
await page.fill('[data-testid="posts-search"]', '');

// open a post, turn it off, save
await page.locator('[data-testid="announcement-row"][data-status="live"] [data-testid="post-open"]').first().click();
await page.waitForSelector('[data-testid="post-manage"]');
await noSideScroll('Post popup 360');
const smallSheet = await smallTargets('[data-testid="post-manage"] button, [data-testid="post-manage"] input, [data-testid="post-manage"] select');
check('Post popup: 44px targets', smallSheet.length === 0, JSON.stringify(smallSheet));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/post-popup-360.png` });
await page.locator('[data-testid="post-manage"] [role="switch"], [data-testid="post-manage"] button[aria-label^="This post is"]').first().click();
await page.click('[data-testid="post-save"]');
await page.waitForTimeout(600);
const offCount = (await state()).announcements.filter((a) => a.enabled === false).length;
check('popup On/Off saved', offCount === 2, String(offCount));

// Slides page: posts inline + layers
await page.goto(BASE + '/admin/slides', { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="slide-row"]');
const postRows = await page.$$('[data-testid="slide-row"][data-kind="post"]');
check('slide-style posts inline in the Slides list (5)', postRows.length === 5, String(postRows.length));
const layerRows = await page.$$eval('[data-testid="layer-row"]', (r) => r.map((x) => x.dataset.kind));
check('layers group: banner, note, takeover', layerRows.length === 3, JSON.stringify(layerRows));
await noSideScroll('Slides 360');
const before = (await state()).slides.length;
await page.locator('[data-testid="slide-row"][data-kind="post"]').first().getByRole('button', { name: /Move slide up/ }).click();
await page.waitForTimeout(700);
const rows = (await state()).slides;
check('moving a post materializes ref rows', rows.length === before + 5 && rows.some((r) => r.id.startsWith('ann-')), `${before} -> ${rows.length}`);
const smallSlides = await smallTargets('[data-testid="layer-row"] button');
check('layers: 44px targets', smallSlides.length === 0, JSON.stringify(smallSlides));

// pencil on a message row opens the post popup; 'Show first' places it at the top of the rotation
await page.locator('[data-testid="slide-row"][data-kind="post"] [data-testid="slide-pencil"]').last().click();
await page.waitForSelector('[data-testid="post-manage"]');
check('Slides pencil opens the post popup', await page.isVisible('[data-testid="post-place"]'));
await page.getByRole('button', { name: 'Show first' }).click();
await page.click('[data-testid="post-save"]');
await page.waitForTimeout(700);
const top = (await state()).slides[0];
check('Show first puts the post on top', top.type === 'ANNOUNCEMENT', JSON.stringify(top));
await page.locator('[data-testid="layer-pencil"]').first().click();
await page.waitForSelector('[data-testid="post-manage"]');
check('layer pencil opens the post popup', !(await page.isVisible('[data-testid="post-place"]')));
await page.click('[data-testid="post-cancel"]');

// Toast "Open it" after posting from the composer
await page.goto(BASE + '/admin/announcements', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '+ New announcement' }).click();
await page.getByRole('dialog', { name: 'New announcement' }).waitFor();
await page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"]').first().fill('Fresh post to find');
await page.getByRole('button', { name: 'Post', exact: true }).click();
await page.getByRole('button', { name: 'Open it' }).click();
await page.waitForSelector('[data-testid="post-manage"]');
check('toast Open it opens the post', (await page.textContent('[data-testid="post-manage"]')).includes('Live now'));
check('no page errors', errors.length === 0, JSON.stringify(errors));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall ok');
process.exit(fails.length ? 1 : 0);
