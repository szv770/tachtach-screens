import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLetter, parseSicha, guessKind, toParagraphs } from '../src/shared/letterParse.js';
import { parseLetterJson, buildLetterJsonPrompt, LETTER_EXAMPLE, SICHA_EXAMPLE, extractJson, fieldsFromParsed } from '../src/shared/letterJson.js';
import { sanitizeSavedLetter, LetterError, matchesLetter, toAnnouncement, defaultTitle } from '../src/shared/savedLetters.js';
import { sanitizeInput, createItem } from '../src/server/announcements-model.js';
import { modelFor } from '../src/shared/takeoverModel.js';

const HE_LETTER = `ב"ה
ט"ו מרחשון, ה'תשט"ז
ברוקלין, נ.י.

שלום וברכה!

במענה על מכתבו מיום ג' העבר, בו כותב אודות העניין שהתחיל ללמוד חסידות. וכמובן שיש להמשיך בזה בהתמדה, שהרי "גדול תלמוד שמביא לידי מעשה".

ובודאי ימשיך בלימוד וקיום המצוות בהידור, ויבשר טוב בכל האמור.

בברכה להצלחה
מנחם שניאורסאהן

(אגרות קודש כרך ג', עמ' ק)`;

const EN_LETTER = `Brooklyn, N.Y.
October 19, 2026

Dear Friend,

I was pleased to receive your letter. It is "good" to learn Torah and to keep the Mitzvos with joy.

Second paragraph, long enough to stand as its own paragraph in the letter body.

With blessings for success,

M. Schneerson

Source: Igros Kodesh vol. 12`;

test('letter: Hebrew letter splits into date / greeting / body / closing / source', () => {
  const r = parseLetter(HE_LETTER);
  assert.equal(r.salutation, 'שלום וברכה!');
  assert.equal(r.dateHe, `ברוקלין, נ.י. · ט"ו מרחשון, ה'תשט"ז`);
  assert.equal(r.signature, 'בברכה להצלחה — מנחם שניאורסאהן');
  assert.equal(r.sourceHe, "אגרות קודש כרך ג', עמ' ק");
  assert.equal(r.body.split('\n\n').length, 2);
  assert.ok(!r.body.includes('ב"ה'), 'the ב״ה kicker is dropped (the layout draws its own)');
  assert.ok(r.body.includes('"גדול תלמוד שמביא לידי מעשה"'), 'quotes are kept');
  assert.deepEqual(r.found, { date: true, salutation: true, signature: true, source: true });
});

test('letter: English letter', () => {
  const r = parseLetter(EN_LETTER);
  assert.equal(r.date, 'Brooklyn, N.Y. · October 19, 2026');
  assert.equal(r.salutation, 'Dear Friend,');
  assert.equal(r.signature, 'With blessings for success — M. Schneerson');
  assert.equal(r.source, 'Igros Kodesh vol. 12');
  assert.equal(r.body.split('\n\n').length, 2);
});

test('letter: nikud and mixed Hebrew/English survive untouched', () => {
  const nikud = 'שָׁלוֹם וּבְרָכָה!\n\nבְּמֵעֲנֶה עַל מִכְתָּבוֹ. And a line of English with a “curly quote” and an ’apostrophe’ in it, long enough for a paragraph.\n\nבִּבְרָכָה';
  const r = parseLetter(nikud);
  assert.equal(r.salutation, 'שָׁלוֹם וּבְרָכָה!');
  assert.ok(r.body.includes('בְּמֵעֲנֶה עַל מִכְתָּבוֹ. And a line of English with a “curly quote” and an ’apostrophe’'));
  assert.equal(r.signature, 'בִּבְרָכָה');
  // invisible direction marks are removed, letters never
  assert.equal(parseLetter('שלום וברכה!‏\n\nטקסט‎').salutation, 'שלום וברכה!');
});

test('letter: no greeting or closing = everything stays in the body, nothing lost', () => {
  const t = 'Just a paragraph of plain text that is long enough to be a paragraph and ends with a period.';
  const r = parseLetter(t);
  assert.equal(r.body, t);
  assert.equal(r.salutation, ''); assert.equal(r.signature, '');
  assert.equal(parseLetter('').body, '');
  assert.equal(parseLetter('  \n \n').body, '');
});

test('letter: a lone short last line after a blank line is the signature; hard-wrapped text is re-joined', () => {
  const wrapped = ['Dear Rabbi,', '', 'This is a hard wrapped letter that', 'keeps going over several short lines', 'without any blank lines between them', 'until it finally ends here.', '', 'Moshe'].join('\n');
  const r = parseLetter(wrapped);
  assert.equal(r.signature, 'Moshe');
  assert.equal(r.body, 'This is a hard wrapped letter that keeps going over several short lines without any blank lines between them until it finally ends here.');
  assert.deepEqual(toParagraphs(['one', 'two']), ['one', 'two'], 'two short lines with no blank line stay separate');
});

test('letter: every input line ends up in exactly one field (no text lost)', () => {
  for (const t of [HE_LETTER, EN_LETTER]) {
    const r = parseLetter(t);
    const strip = (x) => x.replace(/[,()]/g, '');
    const all = strip([r.date, r.dateHe, r.salutation, r.body, r.signature, r.source, r.sourceHe].join(' '));
    for (const w of t.split(/\s+/).filter((x) => x.length > 3 && !/^(ב"ה|Source:)/.test(x))) assert.ok(all.includes(strip(w)), `lost "${w}"`);
  }
});

test('sicha: title, paragraphs and source', () => {
  const r = parseSicha('שיחה לפרשת בראשית\n\nהמאמר פותח בענין "בראשית ברא" ועוד. פסקה ראשונה ארוכה מספיק כדי שתהיה פסקה.\n\nפסקה שנייה.\n\nלקוטי שיחות ח"ה עמ\' 23');
  assert.equal(r.titleHe, 'שיחה לפרשת בראשית');
  assert.equal(r.body.split('\n\n').length, 2);
  assert.equal(r.source, 'לקוטי שיחות ח"ה עמ\' 23');
  const en = parseSicha('Title: On Creation\n\nThe discourse opens with a long first paragraph about creation and its purpose in the world.\n\n(Likkutei Sichos vol. 5)');
  assert.equal(en.title, 'On Creation'); assert.equal(en.source, 'Likkutei Sichos vol. 5');
  const none = parseSicha('A sentence that is only the body and ends here.');
  assert.equal(none.title, ''); assert.equal(none.body, 'A sentence that is only the body and ends here.');
  assert.equal(guessKind(HE_LETTER), 'letter'); assert.equal(guessKind('plain text'), 'sicha');
});

// ── AI JSON ──────────────────────────────────────────────────────────────────
test('AI JSON: the example in the prompt validates, with fences and chatter stripped', () => {
  for (const [kind, ex] of [['letter', LETTER_EXAMPLE], ['sicha', SICHA_EXAMPLE]]) {
    const prompt = buildLetterJsonPrompt(kind);
    assert.ok(prompt.includes(JSON.stringify(ex, null, 2)), 'prompt carries the exact JSON');
    const r = parseLetterJson('Here you go:\n```json\n' + JSON.stringify(ex, null, 2) + '\n```\nHope it helps!', kind);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.kind, kind);
  }
  const r = parseLetterJson(JSON.stringify(LETTER_EXAMPLE));
  assert.equal(r.fields.letter.body, 'First paragraph, exactly as written.\n\nSecond paragraph.');
  assert.equal(r.fields.letter.signature, 'בברכה');
  assert.equal(r.fields.letter.dateHe, LETTER_EXAMPLE.dateHe);
  assert.equal(extractJson('  {"a":1}  '), '{"a":1}');
});

test('AI JSON: clear line-level errors', () => {
  let r = parseLetterJson('{\n  "kind": "letter",\n  "paragraphs": ["a",\n  "b" "c"]\n}', 'letter');
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /not valid JSON.*line 4/);
  r = parseLetterJson('{\n  "kind": "letter",\n  "salutation": 5,\n  "paragraphs": []\n}');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].line, 3); assert.match(r.errors[0].message, /"salutation".*line 3.*must be text/);
  assert.ok(r.errors.some((e) => /no text/.test(e.message)));
  r = parseLetterJson('{"kind":"letter","paragraphs":"not\\nlist ok"}');
  assert.equal(r.ok, true, 'a string with newlines is accepted as paragraphs');
  r = parseLetterJson('{"kind":"letter","paragraphs":[1,2]}');
  assert.match(r.errors[0].message, /item 1.*not text/);
  r = parseLetterJson('{"kind":"poem","paragraphs":["x"]}', 'letter');
  assert.ok(r.errors.some((e) => /"kind" must be/.test(e.message)));
  r = parseLetterJson('["x"]'); assert.match(r.errors[0].message, /one object/);
  r = parseLetterJson(''); assert.match(r.errors[0].message, /Paste the JSON/);
  r = parseLetterJson('{"paragraphs":["x"]}'); assert.match(r.errors[0].message, /letter" or a "sicha/);
  r = parseLetterJson(JSON.stringify({ kind: 'sicha', paragraphs: ['x'.repeat(13000)] }));
  assert.match(r.errors[0].message, /too long/);
});

test('AI JSON: aliases, unknown keys and language hints are warnings, not errors', () => {
  const r = parseLetterJson('{"kind":"letter","body":["Hi"],"signature":"Bye","mood":"x","date":"בר\'"}');
  assert.equal(r.ok, true);
  assert.equal(r.fields.letter.body, 'Hi'); assert.equal(r.fields.letter.signature, 'Bye');
  assert.ok(r.warnings.some((w) => /mood/.test(w)));
  assert.ok(r.warnings.some((w) => /"date" is Hebrew/.test(w)));
});

test('both flows end as a valid announcement that the stage draws', () => {
  for (const parsed of [fieldsFromParsed('letter', parseLetter(HE_LETTER)), parseLetterJson(JSON.stringify(LETTER_EXAMPLE)).fields]) {
    const body = { display: 'slide', look: { layout: 'letter' }, content: parsed };
    const item = createItem(sanitizeInput(body), { id: 'l' });
    const m = modelFor(item, 'letter');
    assert.ok(m.body.length >= 2); assert.ok(m.sal);
  }
});

// ── saved letters ────────────────────────────────────────────────────────────
test('saved letters: sanitize, title, search, re-post body', () => {
  const rec = sanitizeSavedLetter({ id: 'x', ownerId: 'evil', kind: 'letter', letter: { ...parseLetter(EN_LETTER), found: undefined }, style: 'nope' });
  assert.equal(rec.id, undefined); assert.equal(rec.ownerId, undefined);
  assert.equal(rec.style, 'classic');
  assert.equal(rec.title, 'Dear Friend, · Igros Kodesh vol. 12');
  assert.throws(() => sanitizeSavedLetter({ kind: 'letter', letter: { body: '  ' } }), LetterError);
  assert.throws(() => sanitizeSavedLetter({ kind: 'poem', poem: {} }), LetterError);
  assert.throws(() => sanitizeSavedLetter(null), LetterError);
  assert.equal(sanitizeSavedLetter({ kind: 'sicha', sicha: { body: 'abc', evil: 'x' } }).sicha.evil, undefined);
  assert.ok(matchesLetter(rec, 'mitzvos')); assert.ok(matchesLetter(rec, 'DEAR')); assert.ok(!matchesLetter(rec, 'zebra')); assert.ok(matchesLetter(rec, ''));
  assert.equal(defaultTitle('sicha', { body: 'x'.repeat(200) }).length, 80);
  const a = toAnnouncement(rec, { expiresAt: '2026-10-20T00:00:00.000Z' });
  const item = createItem(sanitizeInput(a), { id: 'r' });
  assert.equal(item.content.letter.salutation, 'Dear Friend,');
  assert.equal(item.when.expiresAt, '2026-10-20T00:00:00.000Z');
});
