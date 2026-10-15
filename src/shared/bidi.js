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
 *
 * In an RTL paragraph the opposite is needed: a Latin run that starts with a
 * number ("2:00 PM", "9:30–10:00", "Lot B 12") would otherwise reorder to
 * "PM 2:00" (the digits and the letters resolve to separate levels), so each
 * Latin/number run that contains a letter or a separator is isolated as LTR.
 * A plain number ("2:00", "5786") orders itself and is left alone.
 */
export function bidiRuns(s, baseDir = textDir(s)) {
  const str = String(s ?? '');
  if (baseDir === 'rtl') return splitRuns(str, /[A-Za-z0-9](?:[A-Za-z0-9\s:.,'’&/+\-–]*[A-Za-z0-9])?/g, 'ltr', (t) => /[A-Za-z]/.test(t) || /\d\s*[–\-/]\s*\d/.test(t));
  if (!hasHebrew(str)) return [{ text: str, dir: null }];
  const re =/[֐-׿יִ-ﭏ](?:[֐-׿יִ-ﭏ0-9\s'"״׳־\-–—,.:;]*[֐-׿יִ-ﭏ״׳'"])?[!?.,:;…]*/g;
  return splitRuns(str, re, 'rtl', () => true);
}

function splitRuns(str, re, dir, keep) {
  const out = [];
  let last = 0, m;
  while ((m = re.exec(str))) {
    if (!keep(m[0])) continue;
    if (m.index > last) out.push({ text: str.slice(last, m.index), dir: null });
    out.push({ text: m[0], dir });
    last = m.index + m[0].length;
  }
  if (last < str.length || !out.length) out.push({ text: str.slice(last), dir: null });
  return out;
}

/** `dir="…"` attribute text for an HTML string ('' when no direction). */
export function dirAttr(dir) {
  return dir ? ` dir="${dir}"` : '';
}
