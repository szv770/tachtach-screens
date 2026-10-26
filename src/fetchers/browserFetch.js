import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { systemTmpDir, extraBrowserCandidates, hasUnixSocketPathLimit } from '../server/platform.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Everything the headless browser writes lives under data/.puppeteer-tmp.
// On the Pi, tachtach-server.service runs under systemd ProtectSystem=strict +
// ProtectHome=read-only: only data/ is writable. Two things broke there:
//   1. puppeteer-core's default profile dir is in os.tmpdir() → EROFS mkdtemp.
//   2. Chromium's ProcessSingleton creates its SingletonSocket in a fresh dir
//      under $TMPDIR (default /tmp). When that fails Chromium prints "Failed to
//      create a ProcessSingleton for your profile directory" and exits, which
//      puppeteer reports as the misleading "The browser is already running for
//      <userDataDir>" — even though nothing else is running. Reproduced by
//      launching with /tmp mounted read-only; a writable TMPDIR fixes it.
// PrivateTmp=true in the unit also fixes (2); choosing a writable TMPDIR here
// keeps it working however the process is sandboxed (or if the updated unit
// never got installed). HOME/XDG_* are pointed at data/ too since
// ProtectHome=read-only blocks ~/.config, ~/.cache, ~/.pki (non-fatal, but noisy).
const ROOT = path.join(PROJECT_ROOT, 'data', '.puppeteer-tmp');
const PROFILE_ROOT = path.join(ROOT, 'profiles');
const DATA_TMP_DIR = path.join(ROOT, 't'); // kept short — see pickTmpDir()
const HOME_DIR = path.join(ROOT, 'home');

// Chromium's singleton socket lives at $TMPDIR/.org.chromium.Chromium.XXXXXX/
// SingletonSocket and a unix socket path must fit in 108 bytes — past that
// Chromium dies with SIGTRAP (also reproduced). So prefer the system tmp dir
// when it's writable (PrivateTmp) and only fall back to data/.
const SOCKET_SUFFIX_LEN = '/.org.chromium.Chromium.XXXXXX/SingletonSocket'.length;
function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.rmdirSync(fs.mkdtempSync(path.join(dir, '.ttw-')));
    return true;
  } catch {
    return false;
  }
}
let pickedTmpDir = null;
function pickTmpDir() {
  if (pickedTmpDir) return pickedTmpDir;
  const sys = systemTmpDir(); // Linux: $TMPDIR or /tmp (unchanged); Windows: the account's own temp folder
  pickedTmpDir = isWritableDir(sys) ? sys : DATA_TMP_DIR;
  if (pickedTmpDir === DATA_TMP_DIR) {
    fs.mkdirSync(DATA_TMP_DIR, { recursive: true });
    if (hasUnixSocketPathLimit() && DATA_TMP_DIR.length + SOCKET_SUFFIX_LEN > 107) {
      console.warn(`[browserFetch] ${sys} is not writable and ${DATA_TMP_DIR} is too long for Chromium's singleton socket — launches will likely crash. Set PrivateTmp=true or a short writable TMPDIR.`);
    }
  }
  return pickedTmpDir;
}

// chabad.org's dailystudy/*.asp pages sit behind a Cloudflare JS challenge
// that a plain HTTP fetch can never pass (403 "Just a moment..." even with a
// real browser User-Agent). A real browser engine resolves it within seconds.
// Rather than bundling our own Chromium download, reuse the kiosk's browser.
// Prefer the real ELF binaries over /usr/bin/chromium{,-browser}: on Debian /
// Raspberry Pi OS those are shell wrappers that source /etc/chromium.d/* and
// inject kiosk/GPU flags meant for the desktop browser, not a headless fetcher.
const browserCandidates = () => [
  process.env.CHROMIUM_PATH,
  '/usr/lib/chromium/chromium',
  '/usr/lib/chromium-browser/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ...extraBrowserCandidates(), // Windows only: Chrome per-user install, Edge (docs/windows/AUDIT.md A12)
].filter(Boolean);

export function findBrowserExecutable() {
  for (const p of browserCandidates()) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch { /* not present */ }
  }
  return null;
}

const CHALLENGE_TITLE_RE = /just a moment/i;

// Only one headless Chromium at a time. fetchAll fires Hayom Yom and Tanya in
// parallel (and Track A/C runs can overlap), which on a Pi meant two full
// browsers launching at once — slow, memory-hungry, and noisy to debug.
let queue = Promise.resolve();
function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-crash-reporter',
  '--disable-breakpad',
];

function browserEnv() {
  return {
    ...process.env,
    TMPDIR: pickTmpDir(),
    HOME: HOME_DIR,
    XDG_CONFIG_HOME: path.join(HOME_DIR, '.config'),
    XDG_CACHE_HOME: path.join(HOME_DIR, '.cache'),
  };
}

// puppeteer swallows Chromium's stderr when launch fails (its "The browser is
// already running" message hides the real cause). Re-run Chromium directly
// with the same env/flags and log the tail of its stderr so the journal
// actually says what went wrong.
function logLaunchDiagnostics(executablePath) {
  let diagDir;
  try {
    diagDir = fs.mkdtempSync(path.join(PROFILE_ROOT, 'diag-'));
    const r = spawnSync(executablePath, [
      '--headless', ...BROWSER_ARGS, `--user-data-dir=${diagDir}`, '--dump-dom', 'about:blank',
    ], { env: browserEnv(), timeout: 30000, encoding: 'utf8' });
    const tail = String(r.stderr || '').trim().split('\n').slice(-15).join('\n');
    console.error(`[browserFetch] diagnostic launch: exit=${r.status} signal=${r.signal || '-'}${r.error ? ` error=${r.error.message}` : ''}`);
    if (tail) console.error(`[browserFetch] chromium stderr:\n${tail}`);
  } catch (e) {
    console.error('[browserFetch] diagnostic launch itself failed:', e.message);
  } finally {
    if (diagDir) fs.rm(diagDir, { recursive: true, force: true }, () => {});
  }
}

function ensureDirs() {
  for (const d of [PROFILE_ROOT, HOME_DIR,
    path.join(HOME_DIR, '.config'), path.join(HOME_DIR, '.cache')]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/**
 * Fetch a URL's fully-rendered HTML via a real (headless) browser, waiting
 * out any Cloudflare interstitial challenge before returning the content.
 * Returns null (and logs why) on failure, including if the challenge never
 * cleared — callers must not mistake the challenge page for real content.
 * @param {string} url
 * @param {{ timeoutMs?: number, waitForSelector?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export function fetchRenderedHTML(url, opts = {}) {
  return serialize(() => fetchRenderedHTMLNow(url, opts));
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * Launch headless Chromium with the writable TMPDIR/HOME/profile handling above.
 * Returns { browser, profileDir, executablePath }; throws (err.code
 * 'NO_BROWSER' when no binary exists). Callers must go through serialize().
 */
async function launchBrowserNow() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    const e = new Error('no Chromium/Chrome binary found — set CHROMIUM_PATH env var');
    e.code = 'NO_BROWSER';
    throw e;
  }
  ensureDirs();
  const profileDir = fs.mkdtempSync(path.join(PROFILE_ROOT, `${crypto.randomBytes(2).toString('hex')}-`));
  try {
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      userDataDir: profileDir,
      timeout: 60000, // a cold Chromium start on a Pi can be slow
      env: browserEnv(),
      args: BROWSER_ARGS,
    });
    return { browser, profileDir, executablePath };
  } catch (err) {
    logLaunchDiagnostics(executablePath);
    fs.rm(profileDir, { recursive: true, force: true }, () => {});
    throw err;
  }
}

/**
 * Generic helper: run `fn(page, browser)` in a fresh headless-Chromium page
 * (serialised with every other browserFetch use). Cleans up the browser and
 * profile afterwards. THROWS on failure — callers decide how to fall back.
 * @param {(page: import('puppeteer-core').Page, browser: any) => Promise<any>} fn
 * @param {{ userAgent?: string, viewport?: {width:number,height:number} }} [opts]
 */
export function withBrowserPage(fn, opts = {}) {
  return serialize(async () => {
    const { browser, profileDir } = await launchBrowserNow();
    try {
      const page = await browser.newPage();
      await page.setUserAgent(opts.userAgent || DEFAULT_UA);
      if (opts.viewport) await page.setViewport(opts.viewport);
      return await fn(page, browser);
    } finally {
      await browser.close().catch(() => {});
      fs.rm(profileDir, { recursive: true, force: true }, () => {});
    }
  });
}

async function fetchRenderedHTMLNow(url, opts) {
  const { timeoutMs = 30000, waitForSelector } = opts;
  try {
    return await withBrowserPageNow(async (page) => {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

      const start = Date.now();
      let title = '';
      while (Date.now() - start < timeoutMs) {
        try {
          title = await page.title();
          if (!CHALLENGE_TITLE_RE.test(title)) break;
        } catch { /* mid-navigation after the challenge clears — retry */ }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (CHALLENGE_TITLE_RE.test(title)) {
        console.error(`[browserFetch] Cloudflare challenge did not clear within ${timeoutMs}ms for ${url} (initial HTTP ${resp?.status() ?? '?'})`);
        return null;
      }

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {
          console.warn(`[browserFetch] "${waitForSelector}" not found on ${url} (title: "${title}")`);
        });
      }

      // The challenge redirect can still be settling; retry a destroyed context.
      for (let i = 0; i < 3; i++) {
        try {
          return await page.content();
        } catch (err) {
          if (i === 2) throw err;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      return null;
    });
  } catch (err) {
    console.error(`[browserFetch] failed: ${err.message}`);
    return null;
  }
}

// Same as withBrowserPage but without re-entering the serial queue (we are
// already inside serialize() when fetchRenderedHTMLNow runs).
async function withBrowserPageNow(fn) {
  const { browser, profileDir } = await launchBrowserNow();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_UA);
    return await fn(page, browser);
  } finally {
    await browser.close().catch(() => {});
    fs.rm(profileDir, { recursive: true, force: true }, () => {});
  }
}
