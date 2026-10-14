#!/usr/bin/env node
// Manually test the Hayom Yom fetch on the real device. Read-only: prints what
// happened and never writes data/cache.json.
//
//   node scripts/test-hayom-yom.js              # full fetchHayomYom() (plain → browser fallback)
//   node scripts/test-hayom-yom.js --browser    # skip plain fetch, test headless Chromium only
//   node scripts/test-hayom-yom.js --date 2026-10-14
//
// Exit code 0 = got Hayom Yom text, 1 = failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHayomYom, parseHayomYom } from '../src/fetchers/chabad.js';
import { fetchRenderedHTML, findBrowserExecutable } from '../src/fetchers/browserFetch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const browserOnly = args.includes('--browser');
const dateArg = args[args.indexOf('--date') + 1];
const date = args.includes('--date') && dateArg ? new Date(`${dateArg}T12:00:00`) : new Date();

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(f, 'x');
    fs.unlinkSync(f);
    return 'writable';
  } catch (e) {
    return `NOT writable (${e.code || e.message})`;
  }
}

console.log('--- environment');
console.log('date (local)     :', date.toString());
console.log('user / HOME      :', process.env.USER || process.getuid?.(), '/', process.env.HOME);
console.log('chromium         :', findBrowserExecutable() || 'NONE FOUND (set CHROMIUM_PATH)');
console.log('/tmp             :', writable('/tmp'));
console.log('data/.puppeteer-tmp:', writable(path.join(ROOT, 'data', '.puppeteer-tmp')));

const t0 = Date.now();
let result = null;
if (browserOnly) {
  const tdate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  const url = `https://www.chabad.org/dailystudy/hayomyom.asp?tdate=${tdate}`;
  console.log('--- browser render only:', url);
  const html = await fetchRenderedHTML(url, { waitForSelector: '.hayom-yom-hebrew, .hayom-yom-native' });
  if (html) {
    console.log(`rendered ${html.length} bytes, title: ${(html.match(/<title>([^<]*)/i) || [])[1] || '?'}`);
    const r = parseHayomYom(html);
    if (r.hayomHe || r.hayomEn) result = r;
  }
} else {
  console.log('--- fetchHayomYom()');
  result = await fetchHayomYom(date);
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (!result) {
  console.log(`\nFAILURE after ${secs}s — see [chabad]/[browserFetch] lines above for the reason.`);
  process.exit(1);
}
console.log(`\nSUCCESS in ${secs}s`);
console.log(`Hebrew  (${result.hayomHe.length} chars):`, result.hayomHe.slice(0, 300));
console.log(`English (${result.hayomEn.length} chars):`, result.hayomEn.slice(0, 300));
process.exit(0);
