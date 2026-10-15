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
