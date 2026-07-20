import fetch from "node-fetch";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { RSS_MAP } from "../shared/constants.js";
import { fetchRenderedHTML } from "./browserFetch.js";

const UA = "Mozilla/5.0 (compatible; TachTach-Screens/1.0)";

// chabad.org's dailystudy/*.asp pages sit behind a Cloudflare JS challenge for
// bot-like User-Agents/requests. Detect the interstitial so callers can fall
// back to a real (headless) browser fetch instead of parsing garbage.
function isChallengePage(html) {
  return /just a moment/i.test(html) && /cloudflare/i.test(html);
}

// ---------------------------------------------------------------------------
// Zmanim
// ---------------------------------------------------------------------------

export function parseZmanimRSS(xml) {
  const parser = new XMLParser();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item || [];
  const res = {};
  for (const item of items) {
    const title = item.title || "";
    const cat = (item.category || "").trim();
    const m = title.match(/^(.+?) - \d+:/);
    if (m && cat && !cat.includes("min.")) {
      const key = RSS_MAP[m[1].trim()];
      if (key) res[key] = cat;
    }
  }
  return res;
}

/**
 * Fetch zmanim from Chabad.org RSS feed.
 * @param {string} locationId — Chabad.org location ID
 * @param {string} [date] — optional YYYY-MM-DD string (for tomorrow's zmanim)
 * @returns {Promise<Record<string, string>|null>}
 */
export async function fetchZmanim(locationId, date) {
  try {
    let url = `https://www.chabad.org/tools/rss/zmanim.xml?locationid=${locationId}&locationtype=2`;
    if (date) url += `&tdate=${date}`;

    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseZmanimRSS(xml);
  } catch (err) {
    console.error("[chabad] fetchZmanim failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hayom Yom
// ---------------------------------------------------------------------------

/**
 * Shared helper: strip trailing dedication/memorial text from a Hebrew word array.
 * Chabad.org pages always include sponsorship blocks like
 * "הרה"ת ר' יוסף ב"ר זאב הלוי ע"ה וויינבערג" which are not part of the lesson.
 * Works at word level: finds the last ע"ה / ב"ר / ז"ל marker (only if in the last
 * 30% of words), walks back to the nearest name-title word, and trims from there.
 */
function trimDedication(heWords) {
  if (heWords.length === 0) return heWords;

  // Markers that appear inside/after a person's name (gershayim = ASCII double-quote)
  const endMarkers = new Set(['\u05E2"\u05D4', '\u05D1"\u05E8', '\u05D6"\u05DC', "\u05E9\u05D9\u05D7\u05D9'", '\u05E0"\u05E2']);
  // Words that typically START a dedication block
  const startMarkers = new Set(['\u05D4\u05E8\u05D4"\u05EA', '\u05D4\u05E8\u05D4"\u05D2', '\u05D4\u05E8\u05D1', "\u05E8'", '\u05DC\u05E2\u05D9\u05DC\u05D5\u05D9', '\u05DC\u05D6\u05DB\u05D5\u05EA', '\u05E0\u05E9\u05DE\u05EA', '\u05DC\u05E8\u05E4\u05D5\u05D0\u05EA']);

  // Find the last end-marker in the word list
  let lastMarkerIdx = -1;
  for (let i = heWords.length - 1; i >= 0; i--) {
    if (endMarkers.has(heWords[i])) { lastMarkerIdx = i; break; }
  }

  // Only trim if the marker is in the last 30% of words
  if (lastMarkerIdx < 0 || lastMarkerIdx < heWords.length * 0.7) return heWords;

  // Walk back up to 12 words — keep updating clusterStart for every start-marker
  // found (so we catch הרה"ת even when ר' appears one position later)
  let clusterStart = lastMarkerIdx;
  for (let i = lastMarkerIdx; i >= Math.max(0, lastMarkerIdx - 12); i--) {
    if (startMarkers.has(heWords[i])) { clusterStart = i; }
  }

  return heWords.slice(0, clusterStart);
}

export function parseHayomYom(html) {
  const $ = cheerio.load(html);

  // Remove the shiurim schedule table first — its Hebrew labels (חומש/תניא)
  // would otherwise pollute the saying extraction below.
  $('.hayom-yom-info, script, style, nav, header, footer, noscript, iframe').remove();

  // ── Hebrew extraction ───────────────────────────────────────────────────────
  // .hayom-yom-hebrew > div.hebrew holds just the day's saying (no header/copyright).
  // Hayom Yom entries are frequently Yiddish in their original — authentic, not noise.
  let hayomHe = '';
  const heText = $('.hayom-yom-hebrew .hebrew').first().text().replace(/\s+/g, ' ').trim();
  if (heText) {
    const rawWords = heText.split(/\s+/).filter(w => /[\u05D0-\u05EA]/.test(w) && w.length > 1);
    hayomHe = trimDedication(rawWords).join(' ');
  } else {
    // Fallback: generic Hebrew-char detection
    const heSegments = [];
    $('p, td, span, div').each((_, el) => {
      const $el = $(el);
      if ($el.children('p, div, table').length > 1) return;
      const raw = $el.text().replace(/\s+/g, ' ').trim();
      if (raw.length < 20) return;
      const total = raw.replace(/\s/g, '').length || 1;
      const heCount = (raw.match(/[\u05D0-\u05EA\uFB1D-\uFB4E]/g) || []).length;
      if (heCount / total > 0.45 && heCount >= 12) {
        heSegments.push(raw);
      }
    });
    if (heSegments.length > 0) {
      const deduped = heSegments.filter(
        (s, i) => !heSegments.some((t, j) => j !== i && t.length > s.length && t.includes(s))
      );
      const allHeWords = deduped
        .join(' ')
        .split(/\s+/)
        .filter(w => /[\u05D0-\u05EA]/.test(w) && w.length > 1);
      hayomHe = trimDedication(allHeWords).join(' ');
    }
  }

  // ── English extraction ──────────────────────────────────────────────────────
  // .hayom-yom-native > co:body holds just the day's saying (footnotes live in
  // a separate sibling <co:footnotetable>, so this is already clean).
  let hayomEn = $('.hayom-yom-native').find('co\\:body').first().text().replace(/\s+/g, ' ').trim();
  const enParts = [];
  if (!hayomEn) $('span.co_verse, span.text-with-annotation').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length < 10) return;
    const heChars = (text.match(/[\u05D0-\u05EA]/g) || []).length;
    if (heChars / text.length > 0.3) return;
    enParts.push(text);
  });

  // Fallback to <p> elements if no co_verse spans found
  if (!hayomEn && enParts.length === 0) {
    $('p').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length < 60) return;
      if (/copyright|chabad\.org|privacy|terms of use|compiled and arranged|alter rebbe|all rights|subscribe/i.test(text)) return;
      if (/©|\bURL\b|http/i.test(text)) return;
      const heChars = (text.match(/[\u05D0-\u05EA]/g) || []).length;
      if (heChars / text.length > 0.3) return;
      enParts.push(text);
    });
  }

  if (!hayomEn) hayomEn = enParts.slice(0, 5).join(' ');

  return { hayomHe, hayomEn };
}

/**
 * Fetch Hayom Yom from Chabad.org using today's date parameter.
 * @returns {Promise<{hayomEn: string, hayomHe: string}|null>}
 */
export async function fetchHayomYom(date) {
  const d = date || new Date();
  const tdate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const url = `https://www.chabad.org/dailystudy/hayomyom.asp?tdate=${tdate}`;

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (resp.ok) {
      const html = await resp.text();
      if (!isChallengePage(html)) return parseHayomYom(html);
    }
  } catch (err) {
    console.warn("[chabad] fetchHayomYom plain fetch failed, trying browser render:", err.message);
  }

  // Plain fetch got Cloudflare-challenged — fall back to a real headless browser,
  // which resolves the challenge automatically.
  try {
    const html = await fetchRenderedHTML(url);
    if (!html) return null;
    return parseHayomYom(html);
  } catch (err) {
    console.error("[chabad] fetchHayomYom browser fallback failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Daily Study RSS — Chumash, Tehillim, Tanya (authoritative source)
// ---------------------------------------------------------------------------

function parseRambamDescription(desc) {
  if (!desc) return { displayText: '', chaptersArabic: [] };
  // Strip HTML tags
  let text = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Strip "Today's Lesson: " prefix (case-insensitive)
  text = text.replace(/^today's lesson:\s*/i, '').trim();
  // Extract all chapter numbers: "Chapter 4", "Chapter 1", etc.
  const chaptersArabic = [];
  const re = /chapter\s+(\d+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    chaptersArabic.push(parseInt(m[1]));
  }
  return { displayText: text, chaptersArabic };
}

/**
 * Shared helper: extract the text of the first <h2> from an HTML page.
 * Used for preview-mode scraping of Rambam, Tehillim, Chumash heading lines.
 * @param {string} html
 * @returns {string}
 */
function extractH2(html) {
  const $ = cheerio.load(html);
  return $('h2').first().text().replace(/\s+/g, ' ').trim();
}

/**
 * Parse the daily study RSS feed from Chabad.org.
 * Returns chumash, tehillim, tanya descriptions, and rambam1/rambam3.
 */
export function parseDailyStudyRSS(xml) {
  const parser = new XMLParser();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item || [];

  let rambam1 = null;
  let rambam3 = null;

  const findItem = (titlePrefix) => {
    const item = items.find(i => {
      const t = (typeof i.title === 'string' ? i.title : '').trim();
      return t.startsWith(titlePrefix);
    });
    return item ? (typeof item.description === 'string' ? item.description : String(item.description || '')) : '';
  };

  let seferHamitzvot = null;

  // Scan all items for Rambam entries
  for (const item of items) {
    const titleText = (typeof item.title === 'string' ? item.title : '').trim();
    if (titleText.includes('Rambam')) {
      const rawDesc = (typeof item.description === 'string' ? item.description : String(item.description || ''));
      const parsed = parseRambamDescription(rawDesc);
      if (titleText.includes('1 Chapter')) {
        rambam1 = { displayEn: parsed.displayText, chaptersArabic: parsed.chaptersArabic };
      } else if (titleText.includes('3 Chapter')) {
        rambam3 = { displayEn: parsed.displayText, chaptersArabic: parsed.chaptersArabic };
      }
    }
    const titleLower = titleText.toLowerCase();
    if (titleLower.includes('daily mitzvah') || titleLower.includes('sefer')) {
      const rawDesc = (typeof item.description === 'string' ? item.description : String(item.description || ''));
      const parsed = parseRambamDescription(rawDesc);
      seferHamitzvot = { displayEn: parsed.displayText };
    }
  }

  const chumashDesc = findItem('Daily Chumash with Rashi');
  const tehillimDesc = findItem('Daily Tehilim - Psalms');
  const tanyaDesc = findItem('Daily Tanya');

  // Clean up descriptions — strip HTML tags and known prefixes
  const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  let chumash = clean(chumashDesc);
  let tehillim = clean(tehillimDesc).replace(/^Today's (Psalms|Tehillim):\s*/i, '');
  let tanya = clean(tanyaDesc).replace(/^Today's Lessons:\s*/i, '');

  // Strip trailing " with Rashi" from chumash
  chumash = chumash.replace(/\s+with Rashi$/i, '');

  // Clean up chumash formatting:
  // Input:  "Parshat Acharei-Kedoshim, 5th Portion (Vayikra (Leviticus) 19:15-19:32)"
  // Output: "Parshat Acharei-Kedoshim · 5th Portion\nVayikra 19:15-32"
  chumash = chumash.replace(
    /^(Parshat\s+[^,]+),\s*([\w]+\s+Portion)\s*\((\w+)\s*\([^)]*\)\s*(\d+:\d+)-\d+:(\d+)\)$/,
    '$1 \u00B7 $2\n$3 $4-$5'
  );
  // Also handle single-chapter references like "19:15-19:32" → "19:15-32"
  // and cases where the regex above doesn't match exactly
  chumash = chumash.replace(
    /^(Parshat\s+[^,]+),\s*([\w]+\s+Portion)\s*\((.+?)\s*(\d+:\d+)-(\d+:\d+)\)$/,
    (_, parsha, portion, book, from, to) => {
      // Remove English book name in parens from book: "Vayikra (Leviticus)" → "Vayikra"
      const cleanBook = book.replace(/\s*\([^)]*\)\s*/g, '').trim();
      // Simplify verse range: "19:15-19:32" → "19:15-32"
      const [fromCh, fromV] = from.split(':');
      const [toCh, toV] = to.split(':');
      const verseRange = fromCh === toCh ? `${from}-${toV}` : `${from}-${to}`;
      return `${parsha} \u00B7 ${portion}\n${cleanBook} ${verseRange}`;
    }
  );

  return { chumash, tehillim, tanya, rambam1, rambam3, seferHamitzvot };
}

/**
 * Fetch daily study data from Chabad.org RSS feed.
 * This is the authoritative source for Chumash, Tehillim, and Tanya.
 * @returns {Promise<{chumash: string, tehillim: string, tanya: string}|null>}
 */
export async function fetchDailyStudyRSS() {
  try {
    const resp = await fetch("https://www.chabad.org/tools/rss/dailystudy_rss.xml", {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseDailyStudyRSS(xml);
  } catch (err) {
    console.error("[chabad] fetchDailyStudyRSS failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Daily Quote RSS
// ---------------------------------------------------------------------------

/**
 * Fetch daily inspirational quote from Chabad.org RSS feed.
 * @returns {Promise<{text: string, source: string}|null>}
 */
export async function fetchDailyQuote() {
  try {
    const resp = await fetch("https://www.chabad.org/tools/rss/dailyquote_rss.xml", {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();

    const parser = new XMLParser();
    const doc = parser.parse(xml);
    const items = doc?.rss?.channel?.item;
    const item = Array.isArray(items) ? items[0] : items;
    if (!item?.description) return null;

    const raw = String(item.description).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Try em-dash — most authoritative separator
    const lastEmDash = raw.lastIndexOf('—');
    if (lastEmDash > 0) {
      return { text: raw.slice(0, lastEmDash).trim(), source: raw.slice(lastEmDash + 1).trim() };
    }
    // Try " -- " (double hyphen with surrounding spaces — Chabad.org common format)
    const doubleDash = raw.lastIndexOf(' -- ');
    if (doubleDash > 0) {
      return { text: raw.slice(0, doubleDash).trim(), source: raw.slice(doubleDash + 4).trim() };
    }
    // Try en-dash
    const lastEnDash = raw.lastIndexOf('–');
    if (lastEnDash > 0) {
      return { text: raw.slice(0, lastEnDash).trim(), source: raw.slice(lastEnDash + 1).trim() };
    }
    return { text: raw, source: '' };
  } catch (err) {
    console.error("[chabad] fetchDailyQuote failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hebrew Daily Study RSS — he.chabad.org
// ---------------------------------------------------------------------------

/**
 * Parse the Hebrew daily study RSS from he.chabad.org.
 * Descriptions contain Hebrew text with occasional English phrases ("Today's Lesson", etc.)
 * — strips everything before the first Hebrew character.
 */
export function parseDailyStudyHebrewRSS(xml) {
  const parser = new XMLParser();
  const doc = parser.parse(xml);
  const items = doc?.rss?.channel?.item || [];

  const findItem = (titlePrefix) => {
    const item = items.find(i => {
      const t = (typeof i.title === 'string' ? i.title : '').trim();
      return t.startsWith(titlePrefix);
    });
    return item ? (typeof item.description === 'string' ? item.description : String(item.description || '')) : '';
  };

  const clean = (s) => {
    let text = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Jump to first Hebrew character — drops any leading English phrases
    const firstHebrew = text.search(/[\u05D0-\u05EA\u05F0-\u05F4\uFB1D-\uFB4E]/);
    if (firstHebrew > 0) text = text.slice(firstHebrew);
    return text.trim();
  };

  let rambam1He = null;
  let rambam3He = null;
  let seferHamitzvotHe = null;

  // Scan all items for Hebrew Rambam entries
  for (const item of items) {
    const titleText = (typeof item.title === 'string' ? item.title : '').trim();
    if (titleText.includes('Rambam')) {
      let rawDesc = (typeof item.description === 'string' ? item.description : String(item.description || ''));
      rawDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      rawDesc = rawDesc.replace(/^today's lesson:\s*/i, '').trim();
      if (titleText.includes('1 Chapter')) rambam1He = rawDesc;
      else if (titleText.includes('3 Chapter')) rambam3He = rawDesc;
    }
    const titleLower = titleText.toLowerCase();
    if (titleLower.includes('daily mitzvah') || titleLower.includes('sefer')) {
      let rawDesc = (typeof item.description === 'string' ? item.description : String(item.description || ''));
      rawDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      rawDesc = rawDesc.replace(/^today's lesson:\s*/i, '').trim();
      seferHamitzvotHe = rawDesc;
    }
  }

  return {
    chumashHe: clean(findItem('Daily Chumash with Rashi')),
    tehillimHe: clean(findItem('Daily Tehilim - Psalms')),
    tanyaHe: clean(findItem('Daily Tanya')),
    rambam1He,
    rambam3He,
    seferHamitzvotHe,
  };
}

/**
 * Fetch Hebrew daily study data from he.chabad.org RSS feed.
 * @returns {Promise<{chumashHe: string, tehillimHe: string, tanyaHe: string}|null>}
 */
export async function fetchDailyStudyHebrewRSS() {
  try {
    const resp = await fetch("https://he.chabad.org/tools/rss/dailystudy_rss.xml", {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();
    return parseDailyStudyHebrewRSS(xml);
  } catch (err) {
    console.error("[chabad] fetchDailyStudyHebrewRSS failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tanya Page — first/last words of the day's learning
// ---------------------------------------------------------------------------

/**
 * Parse the Tanya daily study page HTML and extract the first and last
 * ~8 Hebrew words of the actual Tanya text.
 * @param {string} html
 * @returns {{ tanyaFirstWords: string, tanyaLastWords: string } | null}
 */
export function parseTanyaExcerpt(html) {
  const $ = cheerio.load(html);

  // Remove commentary, noise, and dedication blocks
  $('.co_commentary, script, style, nav, header, footer, noscript, iframe, .subnav, .social-bar, .breadcrumb, .related-articles, .dedication, .sponsor, [class*="sponsor"], [class*="dedicat"]').remove();

  // Primary: target actual Tanya Hebrew text spans (span[lang="he"].alternate_he)
  const heSpans = [];
  $('span[lang="he"].alternate_he').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0) heSpans.push(text);
  });

  if (heSpans.length > 0) {
    const rawWords = heSpans
      .join(' ')
      .split(/\s+/)
      .filter(w => /[\u05D0-\u05EA]/.test(w) && w.length > 1);
    const heWords = trimDedication(rawWords);

    if (heWords.length >= 6) {
      return {
        tanyaFirstWords: heWords.slice(0, 8).join(' '),
        tanyaLastWords:  heWords.slice(-8).join(' '),
      };
    }
  }

  // Fallback: generic Hebrew-char detection for any other page structure
  const segments = [];
  $('p, td, span, div').each((_, el) => {
    const $el = $(el);
    if ($el.children('p, div, table').length > 1) return;
    const raw = $el.text().replace(/\s+/g, ' ').trim();
    if (raw.length < 25) return;
    const totalChars = raw.replace(/\s/g, '').length || 1;
    const heCount = (raw.match(/[\u05D0-\u05EA\uFB1D-\uFB4E]/g) || []).length;
    if (heCount / totalChars > 0.45 && heCount >= 15) {
      segments.push(raw);
    }
  });

  if (segments.length > 0) {
    const deduped = segments.filter(
      (s, i) => !segments.some((t, j) => j !== i && t.length > s.length && t.includes(s))
    );
    const rawWords = deduped
      .join(' ')
      .split(/\s+/)
      .filter(w => /[\u05D0-\u05EA]/.test(w) && w.length > 1);
    const heWords = trimDedication(rawWords);

    if (heWords.length >= 6) {
      return {
        tanyaFirstWords: heWords.slice(0, 8).join(' '),
        tanyaLastWords:  heWords.slice(-8).join(' '),
      };
    }
  }

  // Final fallback: English paragraphs
  const paras = [];
  $('p').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 80 && !/copyright|chabad\.org|privacy|terms of use/i.test(text)) {
      paras.push(text);
    }
  });
  if (paras.length === 0) return null;

  const allWords = paras.join(' ').split(/\s+/);
  return {
    tanyaFirstWords: allWords.slice(0, 8).join(' '),
    tanyaLastWords:  allWords.slice(-8).join(' '),
  };
}

/**
 * Fetch and parse the daily Tanya page, extracting the opening and closing
 * words of today's portion.
 * @returns {Promise<{ tanyaFirstWords: string, tanyaLastWords: string } | null>}
 */
export async function fetchTanyaExcerpt(date) {
  const d = date || new Date();
  const tdate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const url = `https://www.chabad.org/dailystudy/tanya.asp?tdate=${tdate}`;

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': UA } });
    if (resp.ok) {
      const html = await resp.text();
      if (!isChallengePage(html)) return parseTanyaExcerpt(html);
    }
  } catch (err) {
    console.warn('[chabad] fetchTanyaExcerpt plain fetch failed, trying browser render:', err.message);
  }

  try {
    const html = await fetchRenderedHTML(url);
    if (!html) return null;
    return parseTanyaExcerpt(html);
  } catch (err) {
    console.error('[chabad] fetchTanyaExcerpt browser fallback failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Preview-only HTML scrapers (used by /api/preview-state, never by scheduler)
// ---------------------------------------------------------------------------

/**
 * Fetch the Chumash/Torah-reading heading for a given date via HTML scrape.
 * Uses torahreading.asp (chumash.asp returns 403 with tdate param).
 * @param {Date} date
 * @returns {Promise<string|null>}
 */
export async function fetchChumashForDate(date) {
  try {
    const tdate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    const resp = await fetch(
      `https://www.chabad.org/dailystudy/torahreading.asp?tdate=${tdate}`,
      { headers: { 'User-Agent': UA } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return extractH2(await resp.text()) || null;
  } catch (err) {
    console.error('[chabad] fetchChumashForDate failed:', err.message);
    return null;
  }
}

/**
 * Fetch the Tehillim heading for a given date via HTML scrape.
 * @param {Date} date
 * @returns {Promise<string|null>}
 */
export async function fetchTehillimForDate(date) {
  try {
    const tdate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    const resp = await fetch(
      `https://www.chabad.org/dailystudy/tehillim.asp?tdate=${tdate}`,
      { headers: { 'User-Agent': UA } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return extractH2(await resp.text()) || null;
  } catch (err) {
    console.error('[chabad] fetchTehillimForDate failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsha Tidbits RSS
// ---------------------------------------------------------------------------

/**
 * Fetch parsha-related articles/tidbits from Chabad.org RSS feed.
 * @returns {Promise<Array<{title: string, description: string, link: string}>|null>}
 */
export async function fetchParshaTidbits() {
  try {
    const resp = await fetch("https://www.chabad.org/tools/rss/parsha_rss.xml", {
      headers: { "User-Agent": UA },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const xml = await resp.text();

    const parser = new XMLParser();
    const doc = parser.parse(xml);
    const items = doc?.rss?.channel?.item || [];

    return (Array.isArray(items) ? items : [items])
      .filter(item => item?.title)
      .map(item => ({
        title: String(item.title || '').trim(),
        description: String(item.description || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
        link: String(item.link || '').trim(),
      }));
  } catch (err) {
    console.error("[chabad] fetchParshaTidbits failed:", err.message);
    return null;
  }
}
