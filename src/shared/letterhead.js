/**
 * Letterhead look of the Letter layout: pure rules, no DOM, unit-tested
 * (test/letterhead.test.js). Shared by the kiosk stage, the admin and the server's whitelist.
 *
 * A letter (look.layout = 'letter') can be drawn two ways:
 *   plain       the original takeover text page (unchanged; every letter saved before this existed)
 *   letterhead  a typed sheet of paper: letterhead (English left, Hebrew right), "By the Grace of G-d" + date,
 *               who it was sent to, the greeting, the body TYPED line by line, the closing with a signature,
 *               and optionally the mailing address + a postmark.
 *
 * Per-letter options live in `look.letter` (sanitised by sanitizeLetterLook). The text lives in
 * `content.letter` next to the old fields. Nothing here names a school or person except the sender
 * PRESETS (the letterhead a letter was really written on), which are data, not code paths.
 */

/** The longest letter text any part of the system accepts. Over it is REFUSED with a message (never silently cut). */
export const MAX_LETTER_BODY = 30000;

export const PAPERS = Object.freeze(['plain', 'letterhead']);
export const BODY_FACES = Object.freeze(['typed', 'serif']);

/**
 * Letterhead presets. `en` / `he` are lines: the first is the NAME (set big), the second the movement
 * ("Lubavitch"), the rest the address. `city` seeds the postmark. `signature` names a bundled facsimile
 * (src/screen/takeover/letterhead/), or null. 'custom' uses the letter's own headEn / headHe lines.
 */
export const HEAD_PRESETS = Object.freeze({
  rebbe: {
    label: 'The Rebbe (Rabbi Menachem M. Schneerson)',
    en: ['RABBI MENACHEM M. SCHNEERSON', 'Lubavitch', '770 Eastern Parkway', 'Brooklyn, N. Y. 11213'],
    he: ['מנחם מענדל שניאורסאהן', 'ליובאוויטש', '770 איסטערן פארקווי', 'ברוקלין, נ. י.'],
    city: 'BROOKLYN, N.Y.', signature: 'rebbe',
  },
  rayatz: {
    label: 'The Frierdiker Rebbe (Rabbi Yosef Yitzchak Schneersohn)',
    en: ['RABBI JOSEPH I. SCHNEERSOHN', 'Lubavitch', '770 Eastern Parkway', 'Brooklyn, N. Y.'],
    he: ['יוסף יצחק שניאורסאהן', 'ליובאוויטש', '770 איסטערן פארקווי', 'ברוקלין, נ. י.'],
    city: 'BROOKLYN, N.Y.', signature: null,
  },
  custom: { label: 'My own letterhead (type the lines)', en: [], he: [], city: '', signature: null },
  none: { label: 'No letterhead', en: [], he: [], city: '', signature: null },
});
export const HEAD_IDS = Object.freeze(Object.keys(HEAD_PRESETS));

/** How fast it types AND how long a page stays up: follow the screen's reading speed (Look > Motion > Long text) or set it for this letter. */
export const LETTER_SPEEDS = Object.freeze(['screen', 'slow', 'normal', 'fast']);
/** Typing-speed multiplier of each per-letter speed ('screen' maps through the screen's own slow | normal | fast). */
export const SPEED_MUL = Object.freeze({ slow: 0.7, normal: 1, fast: 1.5 });
/** How long a page stays up after its last key (a share of the reading time): the owner's 'how fast it goes away'. */
export const LETTER_HOLDS = Object.freeze(['short', 'normal', 'long']);
export const HOLD_MUL = Object.freeze({ short: 0.5, normal: 1, long: 1.8 });

export const DEFAULT_LETTER_LOOK = Object.freeze({
  paper: 'plain', head: 'rebbe', body: 'typed', grace: true, signature: true, mailed: false, stamp: false, speed: 'screen', hold: 'normal',
});

/** What a NEW letter starts with in the composer (old letters have no look.letter and stay 'plain'). */
export const NEW_LETTER_LOOK = Object.freeze({ ...DEFAULT_LETTER_LOOK, paper: 'letterhead' });

const oneOf = (v, list, d) => (list.includes(v) ? v : d);

/** Whitelist a stored look.letter (anything unknown -> the default). Always returns a complete object. */
export function sanitizeLetterLook(v) {
  const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const d = DEFAULT_LETTER_LOOK;
  return {
    paper: oneOf(s.paper, PAPERS, d.paper),
    head: oneOf(s.head, HEAD_IDS, d.head),
    body: oneOf(s.body, BODY_FACES, d.body),
    grace: s.grace !== false,
    signature: s.signature !== false,
    mailed: s.mailed === true,
    stamp: s.stamp === true,
    speed: oneOf(s.speed, LETTER_SPEEDS, d.speed),
    hold: oneOf(s.hold, LETTER_HOLDS, d.hold),
  };
}

/** True when this announcement item draws the letterhead sheet. */
export function isLetterhead(item) {
  const layout = item?.look?.layout;
  return layout === 'letter' && item?.look?.letter?.paper === 'letterhead';
}

const S = (v) => String(v ?? '').trim();
const HEB = /[֐-׿]/;
const lines = (v) => String(v ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
const paragraphs = (v) => String(v ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean);

/**
 * item -> what the sheet draws.
 *   head   { en:[line], he:[line] }  (empty when head = 'none')
 *   grace  the "By the Grace of G-d" / ב״ה line ('' when off)
 *   date   the date line(s) (English and Hebrew, the one that matches the body first)
 *   to     addressee lines
 *   sal    the greeting
 *   body   paragraphs
 *   close  closing line ("With esteem")
 *   sigImg bundled signature id or null
 *   mailed lines (when on), stamp { top, bottom } (when on)
 *   rtl    Hebrew letter (the body reads right to left; the typed face becomes the Torah-text serif)
 *   serif  body face is the serif
 */
export function modelLetterhead(item) {
  const l = item?.content?.letter || {};
  const lk = sanitizeLetterLook(item?.look?.letter);
  const rtl = HEB.test(l.body || '') || (!S(l.body) && (HEB.test(l.salutation || '') || !!S(l.dateHe)));
  const preset = HEAD_PRESETS[lk.head] || HEAD_PRESETS.none;
  const head = lk.head === 'custom' ? { en: lines(l.headEn), he: lines(l.headHe) } : { en: preset.en, he: preset.he };
  const grace = !lk.grace ? '' : S(l.grace) || (rtl ? 'ב״ה' : 'By the Grace of G-d');
  const dateEn = S(l.date), dateHe = S(l.dateHe);
  const date = rtl ? [dateHe, dateEn].filter(Boolean) : [dateEn, dateHe].filter(Boolean);
  const mailed = lk.mailed ? lines(l.mailed) : [];
  let stamp = null;
  if (lk.stamp) {
    const pm = String(l.postmark ?? '').split(/[\n|]+/).map((x) => x.trim()).filter(Boolean);
    stamp = { top: pm[0] || preset.city || '', bottom: pm[1] || '' };
    if (!stamp.top && !stamp.bottom) stamp = null;
  }
  return {
    head, grace, date, to: lines(l.to), sal: S(l.salutation), body: paragraphs(l.body), close: S(l.signature),
    sigImg: lk.signature ? preset.signature : null, mailed, stamp, rtl,
    serif: rtl || lk.body === 'serif',
    source: [S(l.source), S(l.sourceHe)].filter(Boolean),
    speed: lk.speed, hold: lk.hold,
  };
}

/** The speed that really applies: the letter's own, else the screen's reading speed. */
export function effectiveSpeed(letterSpeed, screenSpeed = 'normal') {
  const v = letterSpeed && letterSpeed !== 'screen' ? letterSpeed : screenSpeed;
  return SPEED_MUL[v] ? v : 'normal';
}

/** A Daily Story entry of kind 'letter' -> the announcement-shaped item the stage draws (kiosk + admin preview). */
export function letterEntryItem(e, seconds = 0) { // seconds 0 = automatic
  return {
    id: e?.id || 'letter', status: 'published', display: 'slide', enabled: true, hold: false,
    content: { letter: { ...(e?.letter || {}) } },
    look: { layout: 'letter', style: e?.style || null, animation: 'full', fit: 'auto', letter: sanitizeLetterLook({ ...NEW_LETTER_LOOK, ...(e?.paper || {}) }) },
    slide: { duration: Number.isFinite(seconds) ? seconds : 0, label: '' },
  };
}

// ── Typing timeline (seconds) ───────────────────────────────────────────────

export const TYPING = Object.freeze({
  intro: 1.9,       // sheet lands + letterhead inks in before the first key
  headCps: 38,      // header lines (date, addressee, greeting)
  bodyCps: 20,      // body characters per second: slow enough to read along as it types (~150 words a minute)
  lineGap: 0.14,    // carriage return between lines
  minLine: 0.3,     // a short line still takes a beat
  pageGap: 0.7,     // old page clears, then the next one starts
  holdMin: 1.8,     // after the last key of a page
  sign: 1.5,        // signature write-on
  stamp: 0.35,      // postmark slam
  endHold: 2.2,     // everything shown, still (scaled by 'Stays up')
  loopFade: 0.9,    // takeover loop: the sheet leaves before it replays
});

const lineSec = (chars, cps) => Math.max(TYPING.minLine, chars / cps);
const mulOf = (m) => (m > 0 ? m : 1);

/**
 * Plan the whole show. Pure.
 *   headLines  [chars]            typed once, stay on every page
 *   pages      [{ lines:[chars], words }]
 *   opts       { wpm, hasClose, closeChars, hasSig, hasStamp, hasMailed, loop }
 * Returns absolute times (s) from the moment the sheet mounts:
 *   headT [{s,e}], pages [{ start, lineT:[{s,e}], typedEnd, end, fadeAt }], closeT {s,e}|null, sigT {s,e}|null,
 *   stampT, mailedT, total
 */
export function planTimeline({ headLines = [], pages = [], wpm = 150, typeMul = 1, holdMul = 1, hasClose = false, closeChars = 0, hasSig = false, hasStamp = false, hasMailed = false, loop = false } = {}) {
  let t = TYPING.intro;
  const mul = mulOf(typeMul);
  const headT = headLines.map((c) => { const s = t; const e = s + lineSec(c, TYPING.headCps * mul); t = e + TYPING.lineGap; return { s, e }; });
  const out = [];
  let start = t;
  pages.forEach((pg, pi) => {
    let c = start;
    const lineT = pg.lines.map((n) => { const s = c; const e = s + lineSec(n, TYPING.bodyCps * mul); c = e + TYPING.lineGap; return { s, e }; });
    const typedEnd = lineT.length ? lineT[lineT.length - 1].e : start;
    const hm = holdMul > 0 ? holdMul : 1;
    const read = ((Math.max(1, pg.words || 0) * 60) / Math.max(40, wpm)) * hm;
    const last = pi === pages.length - 1;
    // the reader is already reading while it types, so the page holds for the LONGER of the two
    const end = Math.max(typedEnd + TYPING.holdMin * hm, start + read + 1);
    out.push({ start, lineT, typedEnd, end, fadeAt: end, last });
    start = end + TYPING.pageGap;
  });
  const lastP = out[out.length - 1];
  let closeT = null, sigT = null, stampT = null, mailedT = null;
  let c = lastP ? lastP.typedEnd + 0.45 : TYPING.intro;
  if (hasClose) { closeT = { s: c, e: c + lineSec(closeChars, TYPING.headCps) }; c = closeT.e + 0.15; }
  if (hasSig) { sigT = { s: c, e: c + TYPING.sign }; c = sigT.e; }
  if (hasStamp) { stampT = { s: c + 0.25, e: c + 0.25 + TYPING.stamp }; c = stampT.e; }
  if (hasMailed) { mailedT = { s: Math.max(c - 0.2, TYPING.intro), e: Math.max(c - 0.2, TYPING.intro) + 0.7 }; c = mailedT.e; }
  let end = lastP ? Math.max(lastP.end, c + TYPING.endHold) : c + TYPING.endHold;
  if (lastP) { lastP.end = end; lastP.fadeAt = end; }
  const total = end + (loop ? TYPING.loopFade : 0);
  return { headT, pages: out, closeT, sigT, stampT, mailedT, total, end };
}

/**
 * Greedy page packing for measured lines. `paras` is [[lineText,...], ...]; `capacity` is the height of
 * the body in line-heights; a paragraph break costs `gap` line-heights. Returns [{ paras:[[line]], words }].
 * A paragraph may continue on the next page; a page always takes at least one line.
 */
export function packPages(paras, capacity, gap = 0.5) {
  const pages = [];
  let cur = null, used = 0;
  const wc = (x) => (x.trim() ? x.trim().split(/\s+/).length : 0);
  const open = () => { cur = { paras: [], words: 0 }; pages.push(cur); used = 0; };
  for (const para of paras) {
    let piece = null;
    for (const line of para) {
      const gapCost = !piece && cur && cur.paras.length ? gap : 0;
      if (!cur || (cur.paras.length && used + gapCost + 1 > capacity + 1e-6)) { if (cur && piece) cur.cont = true; open(); }
      if (!piece || cur.paras[cur.paras.length - 1] !== piece) {
        used += cur.paras.length ? gap : 0;
        piece = [];
        cur.paras.push(piece);
      }
      piece.push(line); used += 1; cur.words += wc(line);
    }
  }
  // no lone line stranded at the bottom of a page when its paragraph continues on the next one
  for (let i = 0; i < pages.length - 1; i++) {
    const a = pages[i], b = pages[i + 1];
    const tail = a.paras[a.paras.length - 1];
    if (tail && tail.length === 1 && a.paras.length > 1 && b.paras.length && b.contPara !== false && a.contPara !== false && a.cont) {
      const line = a.paras.pop()[0];
      b.paras[0].unshift(line);
      const w = wc(line); a.words -= w; b.words += w;
    }
  }
  return pages.length ? pages : [{ paras: [], words: 0 }];
}

/** Seconds the rotation should give the slide (rounded up, + the page-transition extra). */
export function letterheadSlideSeconds(total, baseSec = 0) {
  return Math.max(Math.ceil(total + 1), baseSec || 0);
}
