// Bidi helpers (pure, React-free). The kiosk root is `direction: ltr`, so a
// Hebrew string in an element WITHOUT its own dir takes the LTR paragraph
// direction and its leading/trailing punctuation ("!", "?", quotes, brackets)
// lands on the wrong side. Always give user/data text a dir from its content.
const HE = /[֐-׿יִ-ﭏ]/;
const LATIN = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

export const hasHebrew = (s) => HE.test(String(s ?? ''));

/** 'rtl' when the first strong character is Hebrew, 'ltr' when it is Latin
 *  etc., `fallback` (default 'ltr') for neutral-only / empty text. */
export function textDir(s, fallback = 'ltr') {
  for (const ch of String(s ?? '')) {
    if (HE.test(ch)) return 'rtl';
    if (LATIN.test(ch)) return 'ltr';
  }
  return fallback;
}

/**
 * Split text into language runs so each can be isolated: [{ text, dir }].
 * Words are classified by script (Hebrew letter -> rtl, Latin letter -> ltr);
 * neutral words (digits, '-', '7:30') join the run before them (or after, at
 * the start). Punctuation glued to a word stays with that word's run.
 */
export function bidiRuns(s) {
  const parts = String(s ?? '').split(/(\s+)/);
  const runs = [];
  let pending = '';
  for (const p of parts) {
    if (p === '') continue;
    const d = HE.test(p) ? 'rtl' : LATIN.test(p) ? 'ltr' : null;
    const last = runs[runs.length - 1];
    if (d === null) {
      if (last) last.text += p; else pending += p;
    } else if (last && last.dir === d) {
      last.text += p;
    } else {
      runs.push({ text: pending + p, dir: d });
      pending = '';
    }
  }
  if (!runs.length && pending) runs.push({ text: pending, dir: 'ltr' });
  return runs;
}

/** True when the text mixes Hebrew and Latin (needs per-run isolation). */
export const isMixed = (s) => hasHebrew(s) && LATIN.test(String(s ?? ''));

// ---- Takeover-stage helpers (announcement slots; see GOTCHAS "Hebrew punctuation side") ----
// First strong character: Hebrew (R) or a Latin/other letter (L). Digits and
// punctuation are weak/neutral and skipped, exactly like dir="auto".
const STRONG = /[֐-׿יִ-ﭏA-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/**
 * 'rtl' | 'ltr' | null for a string, by its first strong character (like
 * dir="auto"). A string with no letters at all (a time, "!!!") is null:
 * callers keep their context direction.
 */
export function strongDir(s) {
  const m = STRONG.exec(String(s ?? ''));
  if (!m) return null;
  return HE.test(m[0]) ? 'rtl' : 'ltr';
}

/**
 * Direction for a slot that is MEANT to hold one language (e.g. the Hebrew
 * title slot): any Hebrew in it makes it RTL, so "Lag BaOmer בשדה!" in the
 * Hebrew slot still reads right-to-left; otherwise by first strong char.
 */
export function slotDir(s, lang) {
  if (lang === 'he' && hasHebrew(s)) return 'rtl';
  return strongDir(s);
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
export function takeoverRuns(s, baseDir = strongDir(s)) {
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
