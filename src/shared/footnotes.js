/**
 * Footnote clean-up for text taken from Chabad.org pages / feeds.
 *
 * Chabad.org marks footnotes inline (<sup>12</sup>, <a class="footnote" href="#fn12">12</a>,
 * <co:footnoteref>, bracketed [12], or just a number glued to the end of a word after the
 * tags are stripped: "said.12 Then"). On the kiosk those digits ended up inside the sentence.
 * Two layers, both pure:
 *   1. `removeFootnoteNodes($root)`     DOM level (cheerio): drop the marker elements and the footnote table,
 *                                       return the footnote texts separately (kept, never displayed).
 *   2. `stripFootnoteMarkers(text)`     text level: remove what survived as plain characters, but keep real
 *                                       numerals ("Psalm 119", "Genesis 1:1", "5787", "1,000", "10th of Tishrei").
 *   `stripFootnoteHtml(str)`            for feed descriptions that are HTML in a string (no DOM): marker elements out, then tags out.
 */

// elements that are a footnote REFERENCE (the little number in the text)
const REF_SELECTORS = [
  'a.footnote', 'a.footnote-ref', 'a.footnoteref', 'a.fn', 'a.fnref', 'a.noteref', 'a.co_footnote', 'a.co_fn',
  'a[href^="#fn"]', 'a[href^="#footnote"]', 'a[href^="#note"]', 'a[href^="#ftn"]', 'a[id^="fnref"]', 'a[name^="fnref"]',
  'a[rel="footnote"]', 'span.footnote', 'span.footnote-ref', 'span.co_footnote', 'span.fn-ref', 'span[class*="footnoteref"]',
  'co\\:footnoteref', 'co\\:footnote-ref', 'co\\:noteref', 'co\\:fnref',
];
// elements that CONTAIN the footnote texts
const TABLE_SELECTORS = [
  'co\\:footnotetable', 'co\\:footnote', 'co\\:footnotes', '.footnotes', '.footnote-table', '.footnotetable', '.co_footnotetable',
  '.endnotes', 'div[class*="footnote"]', 'ol.footnotes', 'section.footnotes', 'aside.footnotes',
];

/** True when the text of a <sup> looks like a footnote marker rather than "st/nd/th" or a real exponent. */
export function looksLikeMarker(t) {
  const s = String(t || '').replace(/\s+/g, '');
  if (!s) return true; // empty sup: nothing to keep
  return /^[\[(]?(\d{1,3}|[*†‡§¶]{1,3}|[a-z]|[\u05D0-\u05EA]{1,2}[׳']?)[\])]?$/i.test(s) && !/^(st|nd|rd|th)$/i.test(s);
}

/**
 * Remove footnote reference markers and footnote tables from a cheerio selection (mutates it).
 * @returns {{ marks: number, notes: string[] }} number of markers removed and the footnote texts found
 */
export function removeFootnoteNodes($, root) {
  const $r = root && root.find ? root : $.root();
  const notes = [];
  // 1. footnote tables first (their text is returned, never left in the body)
  $r.find(TABLE_SELECTORS.join(',')).each((_, el) => {
    const $el = $(el);
    // an individual note element (<co:footnote>) inside a table: take it once, from the outermost container
    if ($el.parents(TABLE_SELECTORS.join(',')).length) return;
    const items = $el.find('li, co\\:footnote, p').length ? $el.find('li, co\\:footnote, p') : $el;
    items.each((__, it) => {
      const t = $(it).text().replace(/\s+/g, ' ').trim();
      if (t && !notes.includes(t)) notes.push(t);
    });
  });
  $r.find(TABLE_SELECTORS.join(',')).remove();

  // 2. reference markers
  let marks = 0;
  $r.find(REF_SELECTORS.join(',')).each((_, el) => { marks++; $(el).remove(); });
  // 3. <sup>: drop footnote-like ones, unwrap "st/nd/th" so '1<sup>st</sup>' stays '1st'
  $r.find('sup').each((_, el) => {
    const $el = $(el);
    if (looksLikeMarker($el.text())) { marks++; $el.remove(); } else $el.replaceWith($el.text());
  });
  return { marks, notes };
}

const SUPERSCRIPTS = /[\u00B2\u00B3\u00B9\u2070-\u2079]+/g;
const ABBREV = /^(?:ch|chap|v|vv|p|pp|no|nos|vol|sec|gen|ex|exod|lev|num|deut|ps|ibid|cf|fol|sh|ed|par|pt|art)$/i;
const END = '(?=\\s|$|[\\u2014\\u2013-])';   // what may follow a glued marker: space, end, dash

/**
 * Remove footnote markers that survived as plain characters. Real numerals are left alone:
 * a marker is a SHORT number (1-3 digits) attached with no space to a word or to closing punctuation (.,;!?)"'),
 * never one after a colon, a digit or a slash, and never one that has its own space ("Psalm 119", "Chapter 4").
 * @param {string} text
 * @param {{ glued?: boolean }} [o]  glued:false skips the word-glued/punctuation-glued digits rule (use for references)
 */
export function stripFootnoteMarkers(text, { glued = true } = {}) {
  let s = String(text ?? '');
  s = s.replace(SUPERSCRIPTS, '');
  // [12]  [*]  [a]  (fn 12)  (note 3): bracketed markers only when they are purely a marker
  s = s.replace(/\s?\[(?:\d{1,3}|[*†‡§¶]{1,3})\]/g, '');
  s = s.replace(/\s?\((?:fn|footnote|note)\.?\s*\d{1,3}\)/gi, '');
  if (glued) {
    // closing punctuation + 1-3 digits: "said.12 Then", 'God,"3 and', "end.)4".
    // Not after a digit ("1.5", "3,000"), and not after an abbreviation ("ch.4", "v.3", "Gen.1").
    s = s.replace(new RegExp(`([^\\d\\s:/.,;])([.,;!?)\\]"'\\u201D\\u2019\\u05F3\\u05F4]+)(\\d{1,3})${END}`, 'g'), (m, ch, punct, _d, off, str) => {
      const word = (str.slice(Math.max(0, off - 8), off) + ch).match(/([A-Za-z]+)$/)?.[1] || '';
      return ABBREV.test(word) && punct === '.' ? m : ch + punct;
    });
    // a number glued straight onto a word: "God1 said", Hebrew "הקב"ה12 אמר". Needs 2+ letters before.
    s = s.replace(new RegExp(`(?<=[A-Za-z\\u00C0-\\u024F]{2,}|[\\u05D0-\\u05EA]{2,}|[\\u05D0-\\u05EA]["\\u05F4][\\u05D0-\\u05EA])\\d{1,3}${END}`, 'g'), '');
  }
  return s.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;!?])/g, '$1').trim();
}

const NAMED = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201D', ldquo: '\u201C', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026' };
/** &#x0022; / &#34; / &quot; -> the character (after tags are gone, so a decoded < can never start a tag). */
export function decodeEntities(str) {
  return String(str ?? '').replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi, (m, hex, dec, name) => {
    if (name) return NAMED[name.toLowerCase()] ?? m;
    const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
  });
}

/** HTML held in a string (RSS descriptions): marker elements out, tags out, whitespace tidy, then markers. */
export function stripFootnoteHtml(str, opts) {
  let s = String(str ?? '');
  s = s.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => (looksLikeMarker(inner.replace(/<[^>]+>/g, '')) ? '' : inner.replace(/<[^>]+>/g, '')));
  s = s.replace(/<a\b[^>]*(?:class|rel|href)\s*=\s*["'](?:[^"']*footnote[^"']*|#fn[^"']*|#ftn[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi, '');
  s = s.replace(/<(co:footnote\w*)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<[^>]+>/g, ' ');
  return stripFootnoteMarkers(decodeEntities(s).replace(/\s+/g, ' ').trim(), opts);
}
