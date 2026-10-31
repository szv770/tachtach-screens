#!/usr/bin/env node
/**
 * Phone checks of admin > Screen > Shiurim against a THROWAWAY server (scratch TACHTACH_DATA_DIR, never real data):
 *   TOKEN=<session token of a Full editor/admin> node scripts/shiurim-admin-audit.mjs http://localhost:3100
 * Needs Playwright (/opt/node-tools) + chromium (/opt/pw-browsers/chromium). At 360x740 and 412x915 (touch): no sideways page
 * scroll, taps >= 44 px, inputs >= 16 px, every control named, text >= 12 px, no console errors, sheets fit, then a real flow:
 * add a shiur (new person typed inline) -> it shows in Today -> cancel today -> Undo -> move today -> add a guest speaker (the
 * preview sentence) -> import a pasted list (dry-run preview with a line error, then apply) -> settings sections open.
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
const clean = async (tag, what, page) => {
  const r = await scan(page);
  check(`${tag} ${what}: no sideways scroll`, !r.hscroll);
  check(`${tag} ${what}: taps >= 44px`, r.small.length === 0, r.small.slice(0, 6).join(', '));
  check(`${tag} ${what}: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
  check(`${tag} ${what}: every control named`, r.unnamed.length === 0, r.unnamed.join(' | '));
  check(`${tag} ${what}: text >= 12px`, r.tiny.length === 0, r.tiny.slice(0, 4).join(', '));
};

for (const [W, H] of [[360, 740], [412, 915]]) {
  const tag = `${W}x${H}`;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'tachtach_session', value: TOKEN, url: BASE }]);
  await ctx.addInitScript(() => { localStorage.setItem('tachtach-tour-v1', '1'); sessionStorage.setItem('tt-splash-seen', '1'); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/admin/shiurim`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="shiurim-onoff"]', { timeout: 8000 });
  if (W === 360) check(`${tag} empty state shows`, await page.locator('[data-testid="shiurim-empty"]').count() === 1);
  await clean(tag, 'page', page);

  // add a shiur with a new person typed inline, every day so Today has it whatever the weekday
  await page.click('[data-testid="shiur-add"]');
  await page.waitForSelector('[data-testid="shiur-title"]');
  await page.fill('input[aria-label="New person\'s name"]', 'Rabbi Audit');
  await page.fill('[data-testid="shiur-title"]', 'Gemara - Bava Metzia');
  await page.fill('input[aria-label="Where, in English"]', 'Beis Medrash');
  for (const d of ['Fri', 'Shabbos']) await page.getByRole('button', { name: new RegExp(`^${d === 'Shabbos' ? 'Shabbos' : 'Friday'}`) }).first().click().catch(() => {});
  await page.fill('input[aria-label="Start"]', '08:15');
  await page.fill('input[aria-label="End"]', '09:00');
  check(`${tag} shiur sheet: the sentence shows what the screen will say`, /Rabbi Audit · Gemara - Bava Metzia · Beis Medrash/.test(await page.innerText('[data-testid="shiur-sentence"]')), await page.innerText('[data-testid="shiur-sentence"]'));
  await clean(tag, 'shiur sheet', page);
  await page.click('[data-testid="shiur-save"]');
  await page.waitForSelector('[data-testid^="today-row-"]', { timeout: 8000 });
  await page.waitForTimeout(500);
  check(`${tag} the shiur shows in Today`, /Gemara - Bava Metzia/.test(await page.innerText('[data-testid="shiurim-today"]')));
  check(`${tag} sheet closed and scroll lock released`, await page.locator('[role="dialog"]').count() === 0 && (await page.evaluate(() => document.body.style.overflow)) !== 'hidden');

  // cancel today -> Cancelled today -> Undo -> back to normal
  await page.getByRole('button', { name: 'Cancel today' }).first().click();
  await page.waitForFunction(() => /Cancelled today/.test(document.querySelector('[data-testid="shiurim-today"]')?.textContent || ''));
  check(`${tag} cancel today: marked Cancelled today at once`, true);
  await page.getByRole('button', { name: 'Undo' }).last().click(); // the newest toast (the older ones undo the earlier saves)
  await page.waitForFunction(() => !/Cancelled today/.test(document.querySelector('[data-testid="shiurim-today"]')?.textContent || '') && /Gemara/.test(document.querySelector('[data-testid="shiurim-today"]')?.textContent || ''));
  check(`${tag} cancel today: Undo brings it back`, true);

  // move today
  await page.getByRole('button', { name: 'Move...' }).first().click();
  await page.waitForSelector('[data-testid="move-save"]');
  await page.fill('input[aria-label="New start"]', '15:30');
  await clean(tag, 'move sheet', page);
  await page.click('[data-testid="move-save"]');
  await page.waitForFunction(() => /Moved/.test(document.querySelector('[data-testid="shiurim-today"]')?.textContent || ''));
  check(`${tag} move today: the row says Moved and shows 3:30 PM`, /3:30 PM/.test(await page.innerText('[data-testid="shiurim-today"]')));
  await page.getByRole('button', { name: 'Reset' }).first().click();
  await page.waitForTimeout(500);

  // guest speaker
  await page.locator('[data-testid="shiurim-lists"]').getByRole('button', { name: /^Guests/ }).first().click();
  await page.click('[data-testid="guest-add"]');
  await page.waitForSelector('[data-testid="guest-name"]');
  await page.fill('[data-testid="guest-name"]', 'Rabbi Guest');
  await page.fill('input[aria-label="Topic in English"]', 'Emunah in hard times');
  await page.fill('input[aria-label="Start"]', '20:15');
  await page.waitForSelector('[data-testid="guest-preview"]');
  check(`${tag} guest sheet: preview says when it shows on the screen`, /Shows on the screen from/.test(await page.innerText('[data-testid="guest-preview"]')));
  await page.getByRole('button', { name: 'More options' }).click();
  await clean(tag, 'guest sheet', page);
  await page.fill('input[aria-label="Link"]', 'http://not-secure.example.org');
  check(`${tag} guest sheet: an http link is refused in words`, /https:\/\//.test(await page.innerText('[role="dialog"]')) && await page.locator('[data-testid="guest-save"]').evaluate((b) => b.style.opacity === '0.5' || b.disabled));
  await page.fill('input[aria-label="Link"]', '');
  await page.click('[data-testid="guest-save"]');
  await page.waitForSelector('[data-testid^="guest-g_"]', { timeout: 8000 });
  check(`${tag} guest listed with its status`, /Shows from|On the screen now/.test(await page.innerText('[data-testid="shiurim-lists"]')));

  // people tab
  await page.locator('[data-testid="shiurim-lists"]').getByRole('button', { name: /^People/ }).first().click();
  check(`${tag} the typed person was created`, /Rabbi Audit/.test(await page.innerText('[data-testid="shiurim-lists"]')));
  await page.click('[data-testid="person-add"]');
  await page.waitForSelector('[data-testid="person-name"]');
  await clean(tag, 'person sheet', page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // import: line error first, then apply
  await page.locator('[data-testid="shiurim-lists"]').getByRole('button', { name: /^Shiurim/ }).first().click();
  await page.click('[data-testid="shiurim-import-open"]');
  await page.fill('[data-testid="shiurim-import-text"]', 'Rabbi Imp | Halacha | Room 4 | Mon-Thu | 1:30 PM - 2:00 PM\nRabbi Imp | Bad | Room 4 | Someday | 1:30 PM');
  await page.waitForSelector('[data-testid="shiurim-import-preview"]');
  check(`${tag} import: the error names its line`, /Line 2: could not read the days/.test(await page.innerText('[data-testid="shiurim-import-preview"]')));
  check(`${tag} import: Use disabled while there is an error`, await page.locator('[data-testid="shiurim-import-apply"]').isDisabled());
  await page.fill('[data-testid="shiurim-import-text"]', 'Rabbi Imp | Halacha | Room 4 | Mon-Thu | 1:30 PM - 2:00 PM');
  await page.waitForFunction(() => /Found:/.test(document.querySelector('[data-testid="shiurim-import-preview"]')?.textContent || ''));
  await clean(tag, 'import sheet', page);
  await page.click('[data-testid="shiurim-import-apply"]');
  await page.waitForFunction(() => /Halacha/.test(document.querySelector('[data-testid="shiurim-lists"]')?.textContent || ''), null, { timeout: 8000 });
  check(`${tag} import: applied (added to the list)`, true);

  // settings sections open and fit
  for (const id of ['shiurim-what', 'shiurim-guests', 'shiurim-preview']) {
    await page.locator(`#${id} button[aria-expanded]`).first().click();
    await page.waitForTimeout(150);
  }
  await clean(tag, 'settings open', page);
  check(`${tag} no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
