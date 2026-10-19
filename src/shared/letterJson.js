/**
 * Letters and sicha excerpts via an AI chat: the admin copies a prompt (with
 * the exact JSON shape), pastes a whole letter into Claude / ChatGPT, then
 * pastes the JSON that comes back. This module holds the prompt, the schema
 * and the validator (clear, line-numbered errors). Pure; mirrors the
 * PROMPT_TYPES pattern of scheduleClaudePrompt.js.
 */

export const LETTER_EXAMPLE = {
  kind: 'letter',
  dateHe: 'ט״ו מרחשון, ה׳תשט״ז',
  date: 'Brooklyn, N.Y.',
  salutation: 'שלום וברכה!',
  paragraphs: ['First paragraph, exactly as written.', 'Second paragraph.'],
  closing: 'בברכה',
  sourceHe: 'אגרות קודש',
  source: 'Igros Kodesh, vol. 12',
};

export const SICHA_EXAMPLE = {
  kind: 'sicha',
  titleHe: 'כותרת',
  title: 'Title',
  paragraphs: ['First paragraph, exactly as written.', 'Second paragraph.'],
  source: 'Likkutei Sichos, vol. 5, p. 23',
};

/** Fields per kind: name -> { type: 'text' | 'paragraphs', max, label }. The JSON shape the owner gets. */
export const JSON_FIELDS = {
  letter: {
    dateHe: { type: 'text', max: 300, label: 'Hebrew date' },
    date: { type: 'text', max: 300, label: 'English date or place' },
    salutation: { type: 'text', max: 300, label: 'Greeting' },
    paragraphs: { type: 'paragraphs', max: 12000, label: 'Paragraphs' },
    closing: { type: 'text', max: 300, label: 'Closing and signature' },
    sourceHe: { type: 'text', max: 300, label: 'Hebrew source' },
    source: { type: 'text', max: 300, label: 'English source' },
  },
  sicha: {
    titleHe: { type: 'text', max: 300, label: 'Hebrew title' },
    title: { type: 'text', max: 300, label: 'English title' },
    paragraphs: { type: 'paragraphs', max: 12000, label: 'Paragraphs' },
    source: { type: 'text', max: 300, label: 'Source' },
  },
};
const ALIASES = { signature: 'closing', body: 'paragraphs', text: 'paragraphs' };
const REQUIRED = { letter: ['paragraphs'], sicha: ['paragraphs'] };

export const JSON_PROMPT_TYPES = [
  { id: 'letter', label: 'A letter', example: LETTER_EXAMPLE },
  { id: 'sicha', label: 'A sicha excerpt', example: SICHA_EXAMPLE },
];

/** The text the owner copies into Claude / ChatGPT. */
export function buildLetterJsonPrompt(kind = 'letter') {
  const k = kind === 'sicha' ? 'sicha' : 'letter';
  const ex = JSON.stringify(k === 'sicha' ? SICHA_EXAMPLE : LETTER_EXAMPLE, null, 2);
  const fields = Object.entries(JSON_FIELDS[k]).map(([name, f]) => `- "${name}": ${f.label}${f.type === 'paragraphs' ? ' (a list of strings, one per paragraph)' : ''}`).join('\n');
  const what = k === 'sicha' ? 'a sicha excerpt' : 'a letter';
  return `I will paste ${what} below. Reply with ONLY one JSON object (no explanation, no markdown fences) in exactly this shape, so my screen software can read it:

${ex}

Fields:
${fields}
- "kind": must be "${k}"

Rules:
1. Copy the text EXACTLY. Do not translate, shorten, correct, paraphrase or add anything. Keep nikud (vowel marks), quotation marks and punctuation as they are.
2. Put Hebrew text in the Hebrew fields ("...He") and English text in the English fields. Use "" for anything that is not in the text.
3. "paragraphs" has one string per paragraph, in order. Do not split a paragraph into several, and do not include the greeting, the date, the closing or the source in it.
4. ${k === 'letter' ? '"salutation" is the opening line (for example "שלום וברכה!"). "closing" is the closing phrase together with the signature, joined with " — " if they are on different lines.' : '"title" / "titleHe" is the heading of the excerpt if there is one.'}
5. Remove page numbers, line numbers and footnote markers that are not part of the text.
6. Use plain JSON: double quotes, no trailing commas, no comments.

The text is below:
`;
}

// ── validation ───────────────────────────────────────────────────────────────

/** 1-based line of the first place `"key"` appears as a key in the pasted text (or null). */
function lineOfKey(text, key) {
  const m = new RegExp(`"${key}"\\s*:`).exec(text);
  return m ? text.slice(0, m.index).split('\n').length : null;
}
const lineAt = (text, pos) => text.slice(0, pos).split('\n').length;

/** Cut markdown fences and chatter before the first { and after the last }. */
export function extractJson(raw) {
  let t = String(raw ?? '').replace(/^﻿/, '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a > 0 || (b >= 0 && b < t.length - 1)) {
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  return t;
}

/**
 * @returns {{ ok: boolean, errors: {line:number|null, message:string}[], warnings: string[], kind: string|null, fields: object|null }}
 *   fields = { letter: {...} } | { sicha: {...} } in the announcement's own field names (body = paragraphs joined by a blank line).
 */
export function parseLetterJson(raw, expectKind = null) {
  const errors = [];
  const warnings = [];
  const fail = () => ({ ok: false, errors, warnings, kind: null, fields: null });
  const text = extractJson(raw);
  if (!text) { errors.push({ line: null, message: 'Paste the JSON your AI chat gave back.' }); return fail(); }
  let data;
  try { data = JSON.parse(text); } catch (e) {
    const m = /position (\d+)/.exec(e.message);
    const line = m ? lineAt(text, Number(m[1])) : null;
    errors.push({ line, message: `This is not valid JSON${line ? ` (around line ${line})` : ''}: ${String(e.message).replace(/^.*?JSON\s*/i, '').slice(0, 120)}. Check for a missing comma, quote or bracket.` });
    return fail();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push({ line: 1, message: 'The JSON must be one object { ... }.' }); return fail(); }

  const kind = data.kind === 'sicha' || data.kind === 'letter' ? data.kind : expectKind;
  if (data.kind !== undefined && data.kind !== 'letter' && data.kind !== 'sicha') errors.push({ line: lineOfKey(text, 'kind'), message: `"kind" must be "letter" or "sicha" (it says ${JSON.stringify(data.kind)}).` });
  if (!kind) { errors.push({ line: null, message: 'Say whether this is a "letter" or a "sicha" ("kind").' }); return fail(); }
  if (expectKind && data.kind && data.kind !== expectKind) warnings.push(`This JSON says "${data.kind}" but you are making a ${expectKind}: using "${data.kind}".`);

  const spec = JSON_FIELDS[kind];
  const out = {};
  for (const [key0, value] of Object.entries(data)) {
    if (key0 === 'kind') continue;
    const key = ALIASES[key0] && spec[ALIASES[key0]] ? ALIASES[key0] : key0;
    const f = spec[key];
    const line = lineOfKey(text, key0);
    if (!f) { warnings.push(`Ignored "${key0}"${line ? ` (line ${line})` : ''}: not a field of a ${kind}.`); continue; }
    if (f.type === 'paragraphs') {
      let list = value;
      if (typeof list === 'string') list = list.split(/\n\s*\n|\n/);
      if (!Array.isArray(list)) { errors.push({ line, message: `"${key0}"${line ? ` (line ${line})` : ''} must be a list of strings, one per paragraph.` }); continue; }
      const bad = list.findIndex((p) => typeof p !== 'string');
      if (bad >= 0) { errors.push({ line, message: `"${key0}" item ${bad + 1}${line ? ` (near line ${line})` : ''} is not text.` }); continue; }
      const paras = list.map((p) => p.replace(/\r\n?/g, '\n').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
      const total = paras.join('\n\n');
      if (total.length > f.max) { errors.push({ line, message: `The text is too long (${total.length} characters; the most is ${f.max}).` }); continue; }
      out.body = total;
    } else {
      if (value != null && typeof value !== 'string') { errors.push({ line, message: `"${key0}"${line ? ` (line ${line})` : ''} must be text, not ${Array.isArray(value) ? 'a list' : typeof value}.` }); continue; }
      const v = String(value ?? '').replace(/\s+/g, ' ').trim();
      if (v.length > f.max) { errors.push({ line, message: `"${key0}" is too long (${v.length} characters; the most is ${f.max}).` }); continue; }
      out[key === 'closing' ? 'signature' : key] = v;
    }
  }
  for (const req of REQUIRED[kind]) {
    if (!out.body) { errors.push({ line: lineOfKey(text, req) || null, message: 'There is no text: "paragraphs" needs at least one paragraph.' }); break; }
  }
  // text in the wrong language field is a likely mix-up worth a hint, never an error
  const heb = /[֐-׿]/;
  for (const k of kind === 'letter' ? ['date', 'source'] : ['title', 'source']) if (out[k] && heb.test(out[k]) && !/[A-Za-z]/.test(out[k])) warnings.push(`"${k}" is Hebrew: it fits better in "${k}He"${kind === 'sicha' && k === 'source' ? ' (sicha has one source line, it will still show)' : ''}.`);
  if (out.body && /^\s*[{[]/.test(out.body)) warnings.push('The text starts with a bracket: is the JSON nested by mistake?');
  if (errors.length) return fail();
  return { ok: true, errors, warnings, kind, fields: { [kind]: fillDefaults(kind, out) } };
}

/** Every field of the announcement's letter / sicha present (empty string when missing). */
function fillDefaults(kind, out) {
  const keys = kind === 'letter' ? ['date', 'dateHe', 'salutation', 'body', 'signature', 'source', 'sourceHe'] : ['title', 'titleHe', 'body', 'source'];
  return Object.fromEntries(keys.map((k) => [k, out[k] || '']));
}

/** A parseLetter()/parseSicha() result -> { letter } | { sicha } field object (drops `found`). */
export function fieldsFromParsed(kind, parsed) {
  const { found, ...rest } = parsed || {};
  void found;
  return { [kind]: fillDefaults(kind, rest) };
}
