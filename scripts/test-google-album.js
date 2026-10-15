#!/usr/bin/env node
// Manually test Google Photos album fetching on the real device. Read-only
// (downloads nothing, writes nothing). Prints how many photos each strategy
// found, how long it took, and the first 3 URLs.
//
//   npm run test:google-album -- <album-url>
//   npm run test:google-album -- <album-url> --plain     # plain HTTP only
//   npm run test:google-album -- <album-url> --browser   # headless browser only
//   GPHOTOS_BROWSER_TIME_MS=180000 npm run test:google-album -- <url>   # longer scroll budget
import { fetchAlbumPlain, fetchAlbumBrowser, withDisplaySize } from '../src/fetchers/google-photos.js';
import { findBrowserExecutable } from '../src/fetchers/browserFetch.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('usage: npm run test:google-album -- <album-url> [--plain|--browser]');
  process.exit(2);
}
const onlyPlain = args.includes('--plain');
const onlyBrowser = args.includes('--browser');
console.log('chromium:', findBrowserExecutable() || 'NONE FOUND (set CHROMIUM_PATH)');

async function run(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n${name}: ${r.urls.length} photos in ${secs}s${r.extra ? ` (${r.extra})` : ''}`);
    r.urls.slice(0, 3).forEach((u) => console.log('  ', withDisplaySize(u)));
    return r;
  } catch (err) {
    console.log(`\n${name}: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s - ${err.message}`);
    return null;
  }
}

let plain = null;
if (!onlyBrowser) plain = await run('plain HTTP', () => fetchAlbumPlain(url));
let browser = null;
if (!onlyPlain) {
  let last = 0;
  browser = await run('headless browser scroll', async () => {
    const r = await fetchAlbumBrowser(url, {
      profilePics: plain?.profilePics,
      onProgress: (n) => { if (n - last >= 50) { last = n; process.stdout.write(`\r  ...${n} found`); } },
    });
    process.stdout.write('\r');
    return { ...r, extra: `${r.passes} passes, stopped: ${r.stopped}` };
  });
}
if (plain && browser) {
  const d = browser.urls.length - plain.urls.length;
  console.log(`\nbrowser found ${d >= 0 ? '+' : ''}${d} vs plain`);
}
process.exit((plain?.urls.length || browser?.urls.length) ? 0 : 1);
