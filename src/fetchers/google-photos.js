import fetch from 'node-fetch';
import { withBrowserPage } from './browserFetch.js';

// Google's shared-album page only embeds the first batch of photos in its
// initial HTML; the rest load lazily while scrolling. So: plain GET first
// (fast), and if it found at least BROWSER_THRESHOLD photos (a sign the album
// is bigger than one batch) drive a real headless browser and scroll to the end.
export const BROWSER_THRESHOLD = Number(process.env.GPHOTOS_BROWSER_THRESHOLD) || 40;
export const BROWSER_TIME_BUDGET_MS = Number(process.env.GPHOTOS_BROWSER_TIME_MS) || 90000;
export const BROWSER_MAX_PASSES = Number(process.env.GPHOTOS_BROWSER_MAX_PASSES) || 200;
const QUIET_PASSES = 3;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const LH3_RE = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-\/=]+/g;
const PROFILE_PATTERNS = [
  /\/a\/[A-Za-z0-9_-]+$/, // Google account avatar
  /\/a\/default$/,
  /\/og\//, // other Google avatars
];

// ── Pure helpers (unit-tested) ────────────────────────────────────────────

/** Strip the size suffix (=w123-h456, =s0 ...) to get the de-dupe key. */
export function baseUrl(url) {
  return url.replace(/=[swh]\d+.*$/, '');
}

export function isProfilePicUrl(url) {
  const p = url.replace('https://lh3.googleusercontent.com', '');
  return PROFILE_PATTERNS.some((re) => re.test(p));
}

/** Display-quality URL for a base URL. */
export function withDisplaySize(base) {
  return `${base}=w1920-h1080`;
}

/**
 * Pull photo base URLs out of a blob of HTML/script text.
 * @returns {{ photos: string[], profilePics: Set<string> }} photos de-duplicated, in order of appearance
 */
export function extractPhotoUrls(text, knownProfilePics = new Set()) {
  const profilePics = new Set(knownProfilePics);
  // Contributor entries (avatar next to a name and a long numeric id)
  const contributorRegex = /\["(https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-\/=]+)"[^]]*?"[A-Za-z\s]+"[^]]*?\d{10,}/g;
  let m;
  while ((m = contributorRegex.exec(text)) !== null) {
    if (m[1]) profilePics.add(baseUrl(m[1]));
  }
  const all = text.match(LH3_RE) || [];
  for (const url of all) if (isProfilePicUrl(url)) profilePics.add(baseUrl(url));

  const seen = new Set();
  const photos = [];
  for (const url of all) {
    if (url.length <= 50) continue; // real photo URLs are long
    const b = baseUrl(url);
    if (profilePics.has(b) || isProfilePicUrl(url) || seen.has(b)) continue;
    seen.add(b);
    photos.push(b);
  }
  return { photos, profilePics };
}

/** Browser result first (album order), then any plain-only URLs. */
export function mergeBaseUrls(primary, secondary) {
  const seen = new Set(primary);
  const out = primary.slice();
  for (const u of secondary) if (!seen.has(u)) { seen.add(u); out.push(u); }
  return out;
}

function checkAlbumUrl(albumUrl, allowLocal) {
  if (!albumUrl || typeof albumUrl !== 'string') throw new Error('Album URL is required');
  if (albumUrl.includes('photos.google.com/share/') || albumUrl.includes('photos.app.goo.gl/')) return;
  // Test-only escape hatch; production validation is unchanged.
  const local = allowLocal === true || process.env.NODE_ENV === 'test';
  if (local && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(albumUrl)) return;
  throw new Error('Invalid Google Photos shared album URL');
}

// ── Strategy 1: plain HTTP GET ────────────────────────────────────────────

/**
 * @returns {Promise<{ urls: string[], profilePics: Set<string> }>} base URLs (no size suffix)
 */
export async function fetchAlbumPlain(albumUrl, opts = {}) {
  checkAlbumUrl(albumUrl, opts.allowLocal);
  let html;
  try {
    const res = await fetch(albumUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      timeout: 15000,
    });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Album not found. The link may be invalid or the album may have been deleted.');
      if (res.status === 403) throw new Error('Album is private. Make sure link sharing is enabled.');
      throw new Error(`Google Photos returned status ${res.status}`);
    }
    html = await res.text();
  } catch (err) {
    if (err.message.includes('Album')) { err.fatal = true; throw err; }
    throw new Error(`Failed to fetch album: ${err.message}`);
  }
  const { photos, profilePics } = extractPhotoUrls(html);
  return { urls: photos, profilePics };
}

// ── Strategy 2: headless browser, scroll to the end ───────────────────────

// Runs inside the page: returns what is visible now, then scrolls one step.
function pageStep(withScripts) {
  const re = /https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_\-\/=]+/g;
  const found = [];
  const add = (v) => { if (v) found.push(v); };
  for (const img of document.querySelectorAll('img')) {
    add(img.currentSrc); add(img.src); add(img.getAttribute('data-src'));
  }
  for (const el of document.querySelectorAll('div, a, span')) {
    const st = el.getAttribute('style') || '';
    if (st.includes('lh3.googleusercontent.com')) { (st.match(re) || []).forEach(add); continue; }
    if (el.children.length) continue;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.includes('lh3.googleusercontent.com')) (bg.match(re) || []).forEach(add);
  }
  const scripts = withScripts ? Array.from(document.scripts).map((s) => s.textContent).join('\n') : '';

  // Candidate scrollers: the document plus every overflow-y element.
  const cands = [document.scrollingElement || document.documentElement];
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollHeight <= el.clientHeight + 20) continue;
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll') cands.push(el);
  }
  let moved = false;
  for (const el of cands) {
    const before = el.scrollTop;
    el.scrollTop = before + Math.max(200, el.clientHeight * 0.95);
    if (el.scrollTop > before) moved = true;
    el.dispatchEvent(new Event('scroll'));
  }
  return { found, scripts, moved };
}

/**
 * Open the album in headless Chromium and scroll until nothing new appears.
 * @param {string} albumUrl
 * @param {{ allowLocal?: boolean, timeBudgetMs?: number, maxPasses?: number,
 *           maxPhotos?: number, profilePics?: Set<string>, onProgress?: (n:number)=>void }} [opts]
 * @returns {Promise<{ urls: string[], passes: number, stopped: string }>} base URLs
 */
export async function fetchAlbumBrowser(albumUrl, opts = {}) {
  checkAlbumUrl(albumUrl, opts.allowLocal);
  const budget = opts.timeBudgetMs ?? BROWSER_TIME_BUDGET_MS;
  const maxPasses = opts.maxPasses ?? BROWSER_MAX_PASSES;
  const maxPhotos = opts.maxPhotos ?? Infinity;
  let profilePics = opts.profilePics || new Set();

  return withBrowserPage(async (page) => {
    // Tall viewport = fewer scroll passes (the grid is virtualised anyway).
    await page.setViewport({ width: 1600, height: 1400 });
    const t0 = Date.now();
    const ordered = new Set(); // base URLs, insertion order = album order
    const ingest = (urls) => {
      let added = 0;
      for (const u of urls) {
        if (u.length <= 50 || isProfilePicUrl(u)) continue;
        const b = baseUrl(u);
        if (profilePics.has(b) || ordered.has(b)) continue;
        ordered.add(b); added++;
      }
      return added;
    };
    await page.goto(albumUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8000 }).catch(() => {});

    let quiet = 0, passes = 0, stopped = 'passes';
    while (passes < maxPasses) {
      if (Date.now() - t0 > budget) { stopped = 'time'; break; }
      if (ordered.size >= maxPhotos) { stopped = 'maxPhotos'; break; }
      const r = await page.evaluate(pageStep, passes === 0);
      passes++;
      if (r.scripts) {
        const ex = extractPhotoUrls(r.scripts, profilePics);
        profilePics = ex.profilePics;
        ingest(ex.photos);
      }
      const added = ingest(r.found.map((u) => (u.match(LH3_RE) || [''])[0]));
      opts.onProgress?.(ordered.size);
      // Only count a pass as quiet once we are at the bottom (nothing scrolled).
      quiet = added === 0 && !r.moved ? quiet + 1 : 0;
      if (quiet >= QUIET_PASSES) { stopped = 'quiet'; break; }
      // Still finding photos: just give lazy loaders a beat. Found nothing: wait for the network.
      if (added === 0) await page.waitForNetworkIdle({ idleTime: 300, timeout: 2500 }).catch(() => {});
      await new Promise((res) => setTimeout(res, added === 0 ? 250 : 120));
    }
    let urls = Array.from(ordered);
    if (urls.length > maxPhotos) urls = urls.slice(0, maxPhotos);
    return { urls, passes, stopped };
  });
}

// ── Combined ──────────────────────────────────────────────────────────────

/**
 * Fetch every photo of a shared album as display-size URLs.
 * @param {string} albumUrl
 * @param {{ browser?: 'auto'|'never'|'always', threshold?: number, allowLocal?: boolean,
 *           maxPhotos?: number, timeBudgetMs?: number, maxPasses?: number,
 *           onProgress?: (n:number)=>void }} [opts]
 */
export async function fetchGooglePhotosAlbum(albumUrl, opts = {}) {
  const mode = opts.browser || 'auto';
  const threshold = opts.threshold ?? BROWSER_THRESHOLD;

  let plain = { urls: [], profilePics: new Set() };
  let plainErr = null;
  try {
    plain = await fetchAlbumPlain(albumUrl, opts);
  } catch (err) {
    if (err.fatal || mode === 'never' || /Invalid Google Photos|URL is required/.test(err.message)) throw err;
    plainErr = err;
  }
  opts.onProgress?.(plain.urls.length);

  const wantBrowser = mode === 'always' || (mode === 'auto' && (plainErr || plain.urls.length === 0 || plain.urls.length >= threshold));
  let urls = plain.urls;
  if (wantBrowser) {
    try {
      const b = await fetchAlbumBrowser(albumUrl, { ...opts, profilePics: plain.profilePics });
      console.log(`[google-photos] browser scroll found ${b.urls.length} (plain ${plain.urls.length}, ${b.passes} passes, stopped: ${b.stopped})`);
      if (b.urls.length > urls.length) urls = mergeBaseUrls(b.urls, urls);
    } catch (err) {
      console.warn(`[google-photos] browser fallback failed, using plain result (${plain.urls.length}): ${err.message}`);
    }
  }

  if (urls.length === 0) {
    if (plainErr) throw plainErr;
    throw new Error('No photos found. The album may be empty, private, or the page format may have changed.');
  }
  return urls.map(withDisplaySize);
}

/**
 * Extract an album ID from a Google Photos shared album URL.
 * Used for naming cache directories.
 */
export function extractAlbumId(albumUrl) {
  // https://photos.google.com/share/AF1QipN.../photo/AF1Qip...
  // Take the share token as the ID
  const match = albumUrl.match(/\/share\/([A-Za-z0-9_-]+)/);
  if (match) {
    // Use first 16 chars to keep directory names manageable
    return match[1].substring(0, 16);
  }
  // Fallback: hash the URL
  let hash = 0;
  for (let i = 0; i < albumUrl.length; i++) {
    hash = ((hash << 5) - hash + albumUrl.charCodeAt(i)) | 0;
  }
  return `album-${Math.abs(hash).toString(36)}`;
}
