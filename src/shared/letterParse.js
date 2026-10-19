/**
 * "Paste the whole letter": split plain pasted text into the fields of the
 * Letter and Sicha layouts WITHOUT any AI. Pure heuristics, deterministic, and
 * never destructive: Hebrew letters, nikud and quotation marks are kept exactly
 * as pasted (only invisible bidi/zero-width characters and runs of spaces are
 * tidied), and every line ends up in exactly one field so the owner can fix a
 * wrong guess by hand instead of losing text.
 *
 *   parseLetter(text) -> { date, dateHe, salutation, body, signature, source, sourceHe, found }
 *   parseSicha(text)  -> { title, titleHe, body, source, found }
 *
 * `body` is paragraphs joined with a blank line (what the composer expects).
 */

const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;
const HEB = /[֐-׿]/;
const hasHeb = (s) => HEB.test(s);
const norm = (s) => String(s ?? '').replace(INVISIBLE, '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

// Hebrew month names (a bare "אב" is also the word "father", so a date needs a geresh/gershayim as well).
const HE_MONTH = /(תשרי|חשון|חשוון|מרחשון|מרחשוון|כסלו|טבת|שבט|אדר|ניסן|אייר|סיון|תמוז|מנחם[ -]?אב|אלול|(?<![\u0590-\u05FF])אב(?![\u0590-\u05FF]))/;
const EN_MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const EN_DATE = new RegExp(`(\\b${EN_MONTH}\\.?\\s+\\d{1,2}\\b)|(\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${EN_MONTH}\\b)|(\\b${EN_MONTH}\\.?,?\\s+\\d{4}\\b)|(\\b\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}\\b)`, 'i');

const KICKER = /^(?:ב["'״׳]?ה|בס["'״׳]?ד|בעזהשי["'״׳]?ת|b["']?h|b["']?s["']?d)\.?$/i;
const SALUTATION = /^(?:שלום|ברכה|ברכת|ברכות|לכבוד|כבוד|הרה["'״׳]ג|הרב|הת['׳]|ידידי|יקירי|נכבד|אל\s|greeting|dear\b|blessing|to\s+the\b|to\s+my\b|my\s+dear|shalom)/i;
const CLOSING = /^(?:ב?ברכה|ובברכה|בברכת|בברכות|בכבוד|בידידות|בהוקרה|בתודה|כל\s?טוב|בכל\s?הטוב|בדרישת\s?שלום|יהי\s?רצון|with\s+(?:blessings|best|much|warm|kind|every|prayers|esteem|appreciation)|sincerely|cordially|yours\b|respectfully|best\s+(?:wishes|regards)|in\s+the\s+hope|blessings)/i;
const SOURCE = /^(?:source\s*:|sources\s*:|מקור\s*:|מקורות\s*:|from\s*:|מתוך(?![\u0590-\u05FF])|אגרות[\s-]?קודש|אג["'״׳]ק|igros\b|iggeres\b|likkutei\b|sichos\b|sichas\b|שיחות(?![\u0590-\u05FF])|לקוטי(?![\u0590-\u05FF])|תורת\s+מנחם|toras\s+menachem|\([^)]{3,}\)$|\[[^\]]{3,}\]$)/i;
const SOURCE_PREFIX = /^(?:source|sources|מקור|מקורות|from)\s*:\s*/i;
const TERMINAL = /[.!?׃:"”’״׳)\]]$/;

function clean(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(INVISIBLE, '').split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim());
}

/** Drop empty lines at both ends; keep a marker for blank lines in the middle. */
function trimBlank(lines) {
  let a = 0, b = lines.length;
  while (a < b && !lines[a]) a++;
  while (b > a && !lines[b - 1]) b--;
  return lines.slice(a, b);
}

const isShort = (l, n = 90) => l.length > 0 && l.length <= n;
const looksLikeParagraph = (l) => l.length > 90 || (l.length > 45 && /[.!?׃]$/.test(l));

/** Lines -> paragraphs: blank line = new paragraph; hard-wrapped text (no blank lines) is re-joined. */
export function toParagraphs(lines) {
  const trimmed = trimBlank(lines);
  const hasBlank = trimmed.some((l) => !l);
  const out = [];
  if (hasBlank) {
    let cur = [];
    for (const l of trimmed) { if (l) cur.push(l); else if (cur.length) { out.push(cur.join(' ')); cur = []; } }
    if (cur.length) out.push(cur.join(' '));
    return out;
  }
  const real = trimmed.filter(Boolean);
  const lens = real.map((l) => l.length).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)] || 0;
  const open = real.filter((l) => !TERMINAL.test(l)).length;
  const wrapped = real.length >= 4 && median <= 80 && open > real.length / 2;
  if (!wrapped) return real;
  let cur = '';
  for (const l of real) { cur = cur ? `${cur} ${l}` : l; if (TERMINAL.test(l)) { out.push(cur); cur = ''; } }
  if (cur) out.push(cur);
  return out;
}

const isHebDate = (l) => HE_MONTH.test(l) && /['׳"״]/.test(l) && l.length <= 70 && !/[.!?]$/.test(l);
const isEnDate = (l) => EN_DATE.test(l) && l.length <= 70;
const isPlaceLine = (l) => isShort(l, 40) && /,/.test(l) && !/[!?:]$/.test(l) && l.split(/\s+/).length <= 5;

function stripSourcePrefix(l) { return l.replace(SOURCE_PREFIX, '').replace(/^\((.*)\)$/, '$1').replace(/^\[(.*)\]$/, '$1').trim(); }

/**
 * Pull trailing source lines off `lines` (mutates a copy). Returns { rest, sources }.
 */
function takeSource(lines) {
  const rest = trimBlank(lines);
  const sources = [];
  while (rest.length) {
    const l = rest[rest.length - 1];
    if (!l) { rest.pop(); if (sources.length) continue; else continue; }
    if (isShort(l, 160) && SOURCE.test(l)) { sources.unshift(stripSourcePrefix(l)); rest.pop(); } else break;
  }
  return { rest: trimBlank(rest), sources };
}

function joinSources(sources) {
  const en = sources.filter((s) => !hasHeb(s)).join(' · ');
  const he = sources.filter(hasHeb).join(' · ');
  return { en, he };
}

/** Split a letter into date / salutation / body / signature / source. */
export function parseLetter(text) {
  let lines = trimBlank(clean(text));
  const found = { date: false, salutation: false, signature: false, source: false };
  const out = { date: '', dateHe: '', salutation: '', body: '', signature: '', source: '', sourceHe: '' };
  if (!lines.length) return { ...out, found };

  // 1. header: kicker lines are dropped (the layout draws its own ב״ה), dates and the greeting are lifted out.
  let i = 0;
  const header = [];
  while (i < lines.length && i < 6) {
    const l = lines[i];
    if (!l) { if (header.length || i === 0) { i++; continue; } break; }
    if (KICKER.test(l)) { i++; continue; }
    if (looksLikeParagraph(l) && !SALUTATION.test(l)) break;
    header.push(l); i++;
  }
  const dates = [], places = [], sal = [];
  for (let k = 0; k < header.length; k++) {
    const l = header[k];
    const last = k === header.length - 1;
    const salLike = SALUTATION.test(l) || (last && isShort(l, 70) && /[!:]$/.test(l));
    if (sal.length < 2 && salLike && isShort(l, 90) && !isHebDate(l) && !isEnDate(l)) sal.push(l);
    else if (isHebDate(l)) dates.push({ l, he: true });
    else if (isEnDate(l)) dates.push({ l, he: false });
    else if (isPlaceLine(l)) places.push(l);
  }
  const salutation = sal.join(' ');
  // header lines we could not classify stay in the body (nothing is ever dropped except ב״ה)
  const used = new Set([...dates.map((d) => d.l), ...places, ...sal]);
  const restLines = [];
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (k < i && (!l || KICKER.test(l) || used.has(l))) continue;
    restLines.push(l);
  }
  const hebDates = dates.filter((d) => d.he).map((d) => d.l);
  const enDates = dates.filter((d) => !d.he).map((d) => d.l);
  out.dateHe = [...places.filter(hasHeb), ...hebDates].join(' · ');
  out.date = [...places.filter((p) => !hasHeb(p)), ...enDates].join(' · ');
  out.salutation = salutation;
  found.date = !!(out.date || out.dateHe);
  found.salutation = !!salutation;

  // 2. source at the very end
  let { rest, sources } = takeSource(restLines);
  // 3. closing + signature at the end of the body
  let signature = '';
  const tail = Math.max(0, rest.length - 6);
  let ci = -1;
  for (let k = rest.length - 1; k >= tail; k--) { if (rest[k] && isShort(rest[k], 90) && CLOSING.test(rest[k])) { ci = k; break; } }
  if (ci >= 0) {
    const parts = rest.slice(ci).filter(Boolean);
    signature = parts.map((p, k) => (k < parts.length - 1 ? p.replace(/[,،]\s*$/, '') : p)).join(' — ');
    rest = trimBlank(rest.slice(0, ci));
  } else {
    // no closing phrase: a lone short last line after a blank line is the signature (a name)
    const n = rest.length;
    if (n >= 3 && rest[n - 2] === '' && isShort(rest[n - 1], 40) && !TERMINAL.test(rest[n - 1]) && !looksLikeParagraph(rest[n - 1])) {
      signature = rest[n - 1];
      rest = trimBlank(rest.slice(0, n - 1));
    }
  }
  // a source that came BEFORE the signature
  if (!sources.length) {
    const t = takeSource(rest); rest = t.rest; sources = t.sources;
  }
  out.signature = signature;
  found.signature = !!signature;
  const src = joinSources(sources);
  out.source = src.en; out.sourceHe = src.he;
  found.source = sources.length > 0;
  out.body = toParagraphs(rest).join('\n\n');
  return { ...out, found };
}

/** Split a sicha excerpt into title / body / source. */
export function parseSicha(text) {
  const lines = trimBlank(clean(text));
  const found = { title: false, source: false };
  const out = { title: '', titleHe: '', body: '', source: '' };
  if (!lines.length) return { ...out, found };
  let rest = lines;
  // title: an explicit "Title:" / "כותרת:" line, or a short first line that is not a sentence
  const first = lines[0];
  const explicit = /^(?:title|כותרת)\s*:\s*(.+)$/i.exec(first);
  if (explicit) { rest = lines.slice(1); setTitle(explicit[1].trim()); } else if (
    lines.length > 1 && isShort(first, 90) && !TERMINAL.test(first.replace(/[:]$/, '')) && !SOURCE.test(first)
    && (lines[1] === '' || lines[1].length > first.length)
  ) { rest = lines.slice(1); setTitle(first); }
  function setTitle(t) { if (hasHeb(t)) out.titleHe = t; else out.title = t; found.title = true; }
  const t = takeSource(rest);
  out.source = t.sources.join(' · ');
  found.source = t.sources.length > 0;
  out.body = toParagraphs(t.rest).join('\n\n');
  return { ...out, found };
}

/** Which kind does this pasted text look like? ('letter' when it has a greeting or closing, else 'sicha'). */
export function guessKind(text) {
  const l = parseLetter(text);
  return l.found.salutation || l.found.signature ? 'letter' : 'sicha';
}
