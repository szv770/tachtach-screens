/**
 * Bidi helpers (pure, no DOM): which way a text run reads, so Hebrew
 * punctuation lands on the correct side.
 *
 * The rule (docs/claude/GOTCHAS.md "Hebrew punctuation side"): every text run
 * gets an explicit direction from its own content, never from the page. A
 * Hebrew run inside an LTR page/paragraph without its own `dir="rtl"` shows
 * "מזל טוב!" with the "!" on the RIGHT (wrong); with `dir="rtl"` the "!"
 * sits at the LEFT end, where a Hebrew reader expects it. Inline spans also
 * need `unicode-bidi: isolate` (CSS `direction` alone does nothing on inline
 * elements).
 */

const HEB = /[֐-׿יִ-ﭏ]/;
// First strong character: Hebrew (R) or a Latin/other letter (L). Digits and
// punctuation are weak/neutral and skipped, exactly like dir="auto".
const STRONG = /[֐-׿יִ-ﭏA-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** True when the string contains any Hebrew letter. */
export function hasHebrew(s) {
  return HEB.test(String(s ?? ''));
}

/**
 * 'rtl' | 'ltr' | null for a string, by its first strong character (like
 * dir="auto"). A string with no letters at all (a time, "!!!") is null:
 * callers keep their context direction.
 */
export function textDir(s) {
  const m = STRONG.exec(String(s ?? ''));
  if (!m) return null;
  return HEB.test(m[0]) ? 'rtl' : 'ltr';
}

/**
 * Direction for a slot that is MEANT to hold one language (e.g. the Hebrew
 * title slot): any Hebrew in it makes it RTL, so "Lag BaOmer בשדה!" in the
 * Hebrew slot still reads right-to-left; otherwise by first strong char.
 */
export function slotDir(s, lang) {
  if (lang === 'he' && hasHebrew(s)) return 'rtl';
  return textDir(s);
}

/**
 * Split a string into runs for an LTR paragraph that contains Hebrew: each
 * Hebrew run (Hebrew letters, the spaces, digits, geresh/gershayim, maqaf and
 * dashes between them, plus the punctuation that closes it) becomes its own
 * RTL run, so "Mazel Tov — מזל טוב!" keeps the "!" at the Hebrew end.
 * Returns [{ text, dir }] with dir 'rtl' for Hebrew runs and null otherwise.
 * For an RTL paragraph nothing needs isolating (Latin runs and numbers are
 * strong/weak LTR and order themselves), so it returns one run.
 */
export function bidiRuns(s, baseDir = textDir(s)) {
  const str = String(s ?? '');
  if (baseDir === 'rtl' || !hasHebrew(str)) return [{ text: str, dir: null }];
  const re = /[֐-׿יִ-ﭏ](?:[֐-׿יִ-ﭏ0-9\s'"״׳־\-–—,.:;]*[֐-׿יִ-ﭏ״׳'"])?[!?.,:;…]*/g;
  const out = [];
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), dir: null });
    out.push({ text: m[0], dir: 'rtl' });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ text: str.slice(last), dir: null });
  return out;
}

/** `dir="…"` attribute text for an HTML string ('' when no direction). */
export function dirAttr(dir) {
  return dir ? ` dir="${dir}"` : '';
}
