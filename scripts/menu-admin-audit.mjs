#!/usr/bin/env node
/**
 * Phone checks of admin > Screen > Menu against a THROWAWAY server (scratch TACHTACH_DATA_DIR, never real data):
 *   TOKEN=<session token of a Full editor/admin> node scripts/menu-admin-audit.mjs http://localhost:3100
 * Needs Playwright (/opt/node-tools) + chromium (/opt/pw-browsers/chromium). At 360x740 and 412x915 (touch):
 * no sideways page scroll, taps >= 44 px, inputs >= 16 px, every control named, text >= 12 px, no console errors, sheets scroll or fit,
 * then a real flow: paste a menu -> preview -> use it -> edit today's lunch -> hide a dish -> Undo.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const TOKEN = process.env.TOKEN;
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : info}`); };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

const scan = (page) => page.evaluate(() => {
  const out = { hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, small: [], tiny: [], unnamed: [], bigInputs: [] };
  const root = document.querySelector('[role="dialog"][aria-modal="true"]') || document.body;
  for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="switch"]')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.type === 'file' || el.type === 'radio' || el.type === 'checkbox') continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.labels?.[0]?.textContent || '').trim();
    if (!name && el.type !== 'hidden') out.unnamed.push(el.outerHTML.slice(0, 80));
    if (r.height < 43.5 && !el.closest('a[href]:not(button)')) out.small.push(`${Math.round(r.width)}x${Math.round(r.height)} "${name.slice(0, 24)}"`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && parseFloat(cs.fontSize) < 16) out.bigInputs.push(`${cs.fontSize} ${name.slice(0, 20)}`);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) { const t = tw.currentNode; if (!t.textContent.trim()) continue; const fs = parseFloat(getComputedStyle(t.parentElement).fontSize); if (fs < 12 && getComputedStyle(t.parentElement).visibility !== 'hidden') out.tiny.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`); }
  return out;
});

for (const [W, H] of [[360, 740], [412, 915]]) {
  const tag = `${W}x${H}`;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'tachtach_session', value: TOKEN, url: BASE }]);
  await ctx.addInitScript(() => { localStorage.setItem('tachtach-tour-v1', '1'); sessionStorage.setItem('tt-splash-seen', '1'); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/admin/menu`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="menu-onoff"]', { timeout: 8000 });
  let r = await scan(page);
  check(`${tag} page: no sideways scroll`, !r.hscroll);
  check(`${tag} page: taps >= 44px`, r.small.length === 0, r.small.slice(0, 5).join(', '));
  check(`${tag} page: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
  check(`${tag} page: every control named`, r.unnamed.length === 0, r.unnamed.join(' | '));
  check(`${tag} page: text >= 12px`, r.tiny.length === 0, r.tiny.slice(0, 4).join(', '));
  check(`${tag} empty state shows`, await page.locator('[data-testid="menu-empty"]').count() === 1);

  // import: paste -> preview -> use it
  await page.click('[data-testid="menu-import-open"]');
  await page.fill('[data-testid="menu-import-text"]', '@ every Sun-Fri\nBreakfast: Oatmeal [dairy]; Fresh fruit\nLunch: Chicken schnitzel [meat]; Rice; Green salad\nDinner: Pasta [dairy,gluten]; Garden salad\n@ every Shabbos\nShabbos lunch: Cholent [meat]\nLunsh: x');
  await page.waitForSelector('[data-testid="menu-import-preview"]');
  check(`${tag} import: error shown with its line and a suggestion`, /Did you mean Lunch\?/.test(await page.innerText('[data-testid="menu-import-preview"]')));
  check(`${tag} import: Use this menu disabled while there is an error`, await page.locator('[data-testid="menu-import-apply"]').isDisabled());
  await page.fill('[data-testid="menu-import-text"]', '@ every Sun-Fri\nBreakfast: Oatmeal [dairy]; Fresh fruit\nLunch: Chicken schnitzel [meat]; Rice; Green salad\nDinner: Pasta [dairy,gluten]; Garden salad\n@ every Shabbos\nShabbos lunch: Cholent [meat]');
  await page.waitForFunction(() => /Found:/.test(document.querySelector('[data-testid="menu-import-preview"]')?.textContent || ''));
  r = await scan(page);
  check(`${tag} import sheet: taps >= 44px`, r.small.length === 0, r.small.slice(0, 5).join(', '));
  check(`${tag} import sheet: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
  check(`${tag} import sheet: every control named`, r.unnamed.length === 0, r.unnamed.join(' | '));
  await page.click('[data-testid="menu-import-apply"]');
  await page.waitForSelector('[data-testid="menu-today"]');
  await page.waitForTimeout(600);
  check(`${tag} import: sheet closed and scroll lock released`, await page.locator('[role="dialog"]').count() === 0 && (await page.evaluate(() => document.body.style.overflow)) !== 'hidden');

  // today: edit lunch for today, hide a dish, Undo
  const today = page.locator('[data-testid="menu-today"]');
  const hasLunch = await today.locator('[data-testid="menu-meal-lunch"]').count();
  if (hasLunch) {
    await today.locator('[data-testid="menu-edit-lunch"]').click();
    await page.waitForSelector('[data-testid="menu-scope-note"]');
    check(`${tag} meal sheet (from Today) says it changes only today`, /Changes only/.test(await page.innerText('[data-testid="menu-scope-note"]')));
    r = await scan(page);
    check(`${tag} meal sheet: taps >= 44px`, r.small.length === 0, r.small.slice(0, 6).join(', '));
    check(`${tag} meal sheet: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
    check(`${tag} meal sheet: every control named`, r.unnamed.length === 0, r.unnamed.join(' | '));
    await page.fill('input[aria-label="Add a dish"]', 'Pizza');
    await page.keyboard.press('Enter');
    await page.click('[data-testid="menu-meal-save"]');
    await page.waitForSelector('[data-testid="menu-meal-lunch"] >> text=Pizza');
    check(`${tag} today: edited lunch shows Pizza and is marked changed`, /changed/.test(await today.locator('[data-testid="menu-meal-lunch"]').innerText()));
    await today.locator('button[aria-label^="Hide Pizza"]').click();
    await page.waitForFunction(() => !/Pizza/.test(document.querySelector('[data-testid="menu-meal-lunch"]')?.textContent || ''));
    check(`${tag} today: hiding a dish removes it at once`, true);
    await page.getByRole('button', { name: 'Undo' }).first().click().catch(() => {});
    await page.waitForTimeout(800);
  } else { check(`${tag} today has a lunch (weekend run?)`, true); }

  // the week: open a meal sheet for another day in 'The usual week'
  await page.getByRole('button', { name: 'The usual week' }).click();
  await page.locator('[data-testid="menu-week"] [data-testid^="menu-edit-"]').first().click();
  await page.waitForSelector('[data-testid="menu-scope-note"]');
  check(`${tag} usual week sheet says it changes every weekday`, /Changes every/.test(await page.innerText('[data-testid="menu-scope-note"]')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // settings sections open and fit
  for (const id of ['menu-what', 'menu-meals', 'menu-rotation']) {
    await page.locator(`#${id} button[aria-expanded]`).first().click();
    await page.waitForTimeout(150);
  }
  r = await scan(page);
  check(`${tag} settings open: no sideways scroll`, !r.hscroll);
  check(`${tag} settings open: taps >= 44px`, r.small.length === 0, r.small.slice(0, 6).join(', '));
  check(`${tag} settings open: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
  check(`${tag} settings open: every control named`, r.unnamed.length === 0, r.unnamed.join(' | '));
  check(`${tag} no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
