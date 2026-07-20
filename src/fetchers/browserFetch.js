import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

// chabad.org's dailystudy/*.asp pages now sit behind a Cloudflare JS challenge
// that a plain HTTP fetch can never pass (confirmed: 403 "Just a moment..."
// even with a real browser User-Agent). A real browser engine resolves the
// challenge automatically within a few seconds. Rather than bundling our own
// Chromium download, this reuses whatever browser is already installed for
// the kiosk (or on a dev machine).
const BROWSER_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

function findBrowserExecutable() {
  for (const p of BROWSER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const CHALLENGE_TITLE_RE = /just a moment/i;

/**
 * Fetch a URL's fully-rendered HTML via a real (headless) browser, waiting
 * out any Cloudflare interstitial challenge before returning the content.
 * @param {string} url
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<string|null>}
 */
export async function fetchRenderedHTML(url, opts = {}) {
  const { timeoutMs = 20000 } = opts;
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    console.error('[browserFetch] no Chromium/Chrome binary found — set CHROMIUM_PATH env var');
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const title = await page.title();
      if (!CHALLENGE_TITLE_RE.test(title)) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return await page.content();
  } catch (err) {
    console.error('[browserFetch] failed:', err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}
