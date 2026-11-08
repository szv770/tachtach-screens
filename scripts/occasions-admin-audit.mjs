#!/usr/bin/env node
/**
 * Phone checks of admin > Screen > Occasions against a THROWAWAY server (scratch TACHTACH_DATA_DIR, never real data):
 *   TOKEN=<session token of an admin> node scripts/occasions-admin-audit.mjs http://localhost:3100
 * Needs Playwright (/opt/node-tools) + chromium (/opt/pw-browsers/chromium). At 360x740 and 412x915 (touch):
 * no sideways page scroll, taps >= 44 px, inputs >= 16 px, every control named, text >= 12 px, no console errors, the sheet fits,
 * then a real flow: add an occasion with a Hebrew date -> 'Next:' line -> explanation hidden without a source -> shown with one ->
 * save -> it is on the list -> switch it off -> Undo -> remove it -> put the starter dates back.
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
  const root = document.querySelector('[role="dialog"][aria-modal="true"]') || document.querySelector('[data-testid="occ-panel"]') || document.body;
  for (const el of root.querySelectorAll('button, a[href], input, select, textarea, [role="switch"]')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.type === 'file' || el.type === 'radio' || el.type === 'checkbox') continue;
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.labels?.[0]?.textContent || '').trim();
    if (!name && el.type !== 'hidden') out.unnamed.push(el.outerHTML.slice(0, 80));
    if (r.height < 43.5) out.small.push(`${Math.round(r.width)}x${Math.round(r.height)} "${name.slice(0, 24)}"`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && parseFloat(cs.fontSize) < 16) out.bigInputs.push(`${cs.fontSize} ${name.slice(0, 20)}`);
    if (r.right > window.innerWidth + 1) out.small.push(`off-screen "${name.slice(0, 24)}"`);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) { const t = tw.currentNode; if (!t.textContent.trim()) continue; const fs = parseFloat(getComputedStyle(t.parentElement).fontSize); if (fs < 12 && getComputedStyle(t.parentElement).visibility !== 'hidden') out.tiny.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`); }
  return out;
});
const scanChecks = async (page, tag) => {
  const r = await scan(page);
  check(`${tag}: no sideways scroll`, !r.hscroll);
  check(`${tag}: taps >= 44px`, r.small.length === 0, r.small.slice(0, 5).join(', '));
  check(`${tag}: inputs >= 16px`, r.bigInputs.length === 0, r.bigInputs.join(', '));
  check(`${tag}: every control named`, r.unnamed.length === 0, r.unnamed.slice(0, 3).join(' | '));
  check(`${tag}: text >= 12px`, r.tiny.length === 0, r.tiny.slice(0, 4).join(', '));
};

for (const [W, H] of [[360, 740], [412, 915]].filter(([w]) => !process.env.ONLY || String(w) === process.env.ONLY)) {
  const tag = `${W}x${H}`;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'tachtach_session', value: TOKEN, url: BASE }]);
  await ctx.addInitScript(() => { localStorage.setItem('tachtach-tour-v1', '1'); sessionStorage.setItem('tt-splash-seen', '1'); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/admin/occasions`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="occ-onoff"]', { timeout: 8000 });
  // open every collapsible so its controls are scanned too
  for (const b of await page.locator('[data-testid="occ-panel"] button[aria-expanded="false"]').all()) await b.click().catch(() => {});
  await scanChecks(page, `${tag} page`);
  check(`${tag} starter list shows with next dates`, await page.locator('[data-testid^="occ-row-"]').count() >= 10);
  check(`${tag} list is grouped by month`, await page.locator('[data-testid^="occ-group-"]').count() >= 6);
  const firstRow = await page.locator('[data-testid^="occ-row-"]').first().innerText();
  check(`${tag} row names the day, when it begins and until it begins`, /The days?:/.test(firstRow) && /Begins:/.test(firstRow) && /until it begins|On now/.test(firstRow), firstRow.slice(0, 120));
  check(`${tag} year strip`, await page.locator('[data-testid^="occ-strip-"]').count() === 12);
  await page.fill('[data-testid="occ-search"]', 'yud tes');
  check(`${tag} search narrows the list`, await page.locator('[data-testid^="occ-row-"]').count() === 1);
  await page.fill('[data-testid="occ-search"]', '');
  await page.click('[data-testid="occ-filter-needs"]');
  check(`${tag} filter: needs an explanation`, await page.locator('[data-testid^="occ-row-"]').count() >= 10);
  await page.click('[data-testid="occ-filter-all"]');
  check(`${tag} footnote says verify with your rav`, /check them with your rav/.test(await page.innerText('[data-testid="occ-footnote"]')));
  check(`${tag} preview buttons`, await page.locator('[data-testid^="occ-preview-"]').count() === 5);

  // Add: the library first
  await page.click('[data-testid="occ-add"]');
  await page.waitForSelector('[data-testid="occ-library"]');
  await scanChecks(page, `${tag} library`);
  check(`${tag} library: starters say Added`, await page.locator('[data-testid="occ-lib-yud-tes-kislev"]').isDisabled());
  await page.fill('[data-testid="occ-library-search"]', 'tisha');
  check(`${tag} library: search finds Tisha B'Av`, await page.locator('[data-testid="occ-lib-tisha-bav"]').count() === 1);
  await page.click('[data-testid="occ-lib-tisha-bav"]');
  await page.waitForSelector('[data-testid="occ-sheet"]');
  check(`${tag} library: tapping adds it and opens the edit sheet`, (await page.inputValue('[data-testid="occ-name-en"]')).includes('Tisha'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${tag} library: it is on the list`, await page.locator('[data-testid^="occ-row-"]', { hasText: "Tisha B'Av" }).count() === 1);

  // Make my own: type-it date, pickers, explanation
  await page.click('[data-testid="occ-add"]');
  await page.click('[data-testid="occ-make-own"]');
  await page.waitForSelector('[data-testid="occ-sheet"]');
  await scanChecks(page, `${tag} sheet`);
  check(`${tag} sheet: four steps`, await page.locator('[data-testid^="occ-step-"]').count() === 4);
  check(`${tag} sheet: Save disabled without a name`, await page.locator('[data-testid="occ-save"]').isDisabled());
  await page.fill('[data-testid="occ-type-date"]', 'Yud Tes Kislev');
  await page.waitForSelector('[data-testid="occ-typed-state"]');
  check(`${tag} type it: understood and fills the name`, /Understood: 19 Kislev/.test(await page.innerText('[data-testid="occ-typed-state"]')) && (await page.inputValue('[data-testid="occ-name-en"]')) === 'Yud-Tes Kislev');
  const prev = await page.innerText('[data-testid="occ-date-preview"]');
  check(`${tag} preview: Hebrew date, next day, evening it begins, next years`, /Hebrew: 19 Kislev/.test(prev) && /Next: \w+day, \w+ \d+, \d{4}/.test(prev) && /evening before/.test(prev) && /After that: \d{4}/.test(prev), prev);
  await page.fill('[data-testid="occ-type-date"]', 'gibberish');
  check(`${tag} type it: not understood`, /Not understood/.test(await page.innerText('[data-testid="occ-typed-state"]')));
  await page.click('[data-testid="occ-month-10"]');
  await page.click('[data-testid="occ-day-5"]');
  await page.fill('[data-testid="occ-name-en"]', `Audit day ${W}`);
  await page.waitForFunction(() => /Hebrew: 5 Teves/.test(document.querySelector('[data-testid="occ-next"]')?.textContent || ''));
  check(`${tag} pickers: month and day chips set the date`, /5 Teves/.test(await page.innerText('[data-testid="occ-next"]')));
  await page.locator('[data-testid="occ-from-regular"] button').first().click();
  await page.fill('[data-testid="occ-regular-date"]', '2026-11-29');
  check(`${tag} from a regular date: shows the Hebrew date`, /19 Kislev 5787/.test(await page.innerText('[data-testid="occ-regular-words"]')));
  await page.click('[data-testid="occ-repeat-hebrew"]');
  await page.waitForFunction(() => /Hebrew: 19 Kislev/.test(document.querySelector('[data-testid="occ-next"]')?.textContent || ''));
  await page.fill('[data-testid="occ-short-en"]', 'A short line.');
  check(`${tag} sheet: short line counted`, /13 \/ 160/.test(await page.innerText('[data-testid="occ-short-en-count"]')));
  check(`${tag} sheet: hidden without a source`, /Hidden: add the source/.test(await page.innerText('[data-testid="occ-source-state"]')));
  await page.fill('[data-testid="occ-source"]', 'Sefer Sample, p. 12');
  check(`${tag} sheet: needs the check`, /Hidden until you check/.test(await page.innerText('[data-testid="occ-source-state"]')));
  await page.click('[data-testid="occ-paste-claude"]');
  await page.waitForSelector('[data-testid="occ-paste-box"]');
  await page.fill('[data-testid="occ-paste-box"]', 'Short English: Pasted short.\nLong English: Pasted long text.\nSource: Likutei Sichos p. 5\nNot sure about: nothing');
  await page.click('[data-testid="occ-paste-apply"]');
  check(`${tag} paste from Claude fills short, long and source`, (await page.inputValue('[data-testid="occ-short-en"]')) === 'Pasted short.' && (await page.inputValue('[data-testid="occ-explain-en"]')) === 'Pasted long text.' && (await page.inputValue('[data-testid="occ-source"]')) === 'Likutei Sichos p. 5');
  await page.click('[data-testid="occ-checked"] [role="switch"], [data-testid="occ-checked"] button');
  check(`${tag} sheet: checked shows`, /Checked: shows on the screen/.test(await page.innerText('[data-testid="occ-source-state"]')));
  check(`${tag} sheet: advanced collapsed with a summary`, await page.locator('[data-testid="occ-advanced"]').count() === 0 && /follow the defaults/.test(await page.innerText('[data-testid="occ-advanced-summary"]')));
  await page.click('[data-testid="occ-advanced-toggle"]');
  await scanChecks(page, `${tag} sheet advanced`);
  const sheetFits = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); const r = d.getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; });
  check(`${tag} sheet fits the screen`, sheetFits);
  await page.click('[data-testid="occ-save"]');
  await page.waitForFunction((w) => [...document.querySelectorAll('[data-testid^="occ-row-"]')].some((e) => e.textContent.includes(`Audit day ${w}`)), W);
  check(`${tag} saved: chip says Shows on the screen`, await page.locator('[data-testid^="occ-row-"]', { hasText: `Audit day ${W}` }).filter({ hasText: 'Shows on the screen' }).count() === 1);
  await page.waitForTimeout(400);
  check(`${tag} sheet closed and scroll lock released`, await page.locator('[role="dialog"]').count() === 0 && (await page.evaluate(() => document.body.style.overflow)) !== 'hidden');

  // switch it off -> Undo
  const row = page.locator('[data-testid^="occ-row-"]', { hasText: `Audit day ${W}` });
  await row.locator('button[aria-pressed="true"]').click();
  await page.waitForTimeout(500);
  check(`${tag} off: leaves the timeline (collapsed under Switched off)`, await page.locator('[data-testid^="occ-group-"] [data-testid^="occ-row-"]', { hasText: `Audit day ${W}` }).count() === 0);
  const undo = page.getByRole('button', { name: 'Undo' }).last();
  if (await undo.count()) { await undo.click(); await page.waitForTimeout(700); }
  check(`${tag} Undo brings it back`, await page.locator('[data-testid^="occ-group-"] [data-testid^="occ-row-"]', { hasText: `Audit day ${W}` }).count() === 1);

  // remove it (and the library one)
  for (const name of [`Audit day ${W}`, "Tisha B'Av"]) {
    await page.locator('[data-testid^="occ-row-"]', { hasText: name }).first().locator('[data-testid^="occ-edit-"]').click();
    await page.click('[data-testid="occ-delete"]');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForTimeout(700);
    check(`${tag} removed ${name}`, await page.locator('[data-testid^="occ-row-"]', { hasText: name }).count() === 0);
  }

  // restore starters
  await page.click('[data-testid="occ-restore"]');
  await page.waitForTimeout(500);
  check(`${tag} no console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close().catch(() => {});
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
