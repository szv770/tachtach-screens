// Footnote markers in Chabad.org text: removed cleanly, real numerals kept (fixtures in test/fixtures/chabad).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripFootnoteMarkers, stripFootnoteHtml, looksLikeMarker } from '../src/shared/footnotes.js';
import { parseHayomYom, parseDailyStudyRSS, parseDailyStudyHebrewRSS } from '../src/fetchers/chabad.js';

const fx = (n) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'chabad', n), 'utf8');

test('Hayom Yom: <sup>, a.footnote, co:footnoteref, bracketed and the table are gone; numerals stay', () => {
  const r = parseHayomYom(fx('hayomyom-footnotes.html'));
  assert.equal(r.hayomEn,
    'Today is the 10th of Cheshvan. The Alter Rebbe said that one should study Psalm 119 daily, as in Genesis 1:1 and in the year 5787. The sum was 1,000. Rashi agrees.');
  assert.ok(!/\d\s*$/.test(r.hayomHe.replace(/קי"ט.*$/, '')), 'no trailing digits');
  assert.ok(!/[0-9]/.test(r.hayomHe), `Hebrew has no digits: ${r.hayomHe}`);
  assert.ok(r.hayomHe.includes('אמר רבינו הזקן שהאדם'), r.hayomHe);
  assert.ok(r.hayomHe.includes('תורה, ולהתפלל') || r.hayomHe.includes('תורה ,'), r.hayomHe);
  assert.ok(!r.hayomHe.includes('הערה'), 'footnote table not in the text');
  assert.ok(!r.hayomEn.includes('Likkutei Torah'));
  // kept apart, never displayed
  assert.deepEqual(r.notes.he, ['הערה ראשונה', 'הערה שניה']);
  assert.ok(r.notes.en.some((n) => n.includes('Likkutei Torah')));
});

test('Hayom Yom: markers glued as plain digits (no markup left) are removed, real numbers kept', () => {
  const r = parseHayomYom(fx('hayomyom-glued.html'));
  assert.equal(r.hayomEn, 'The Rebbe said. God gave the Torah, in chapter 5, verse 3:7 (about 5787). See ch.4 and p.12 as well; 1.5 million.');
  assert.ok(r.hayomHe.includes('הקב"ה נתן תורה. לישראל'), r.hayomHe);
  assert.ok(!/[0-9]/.test(r.hayomHe));
});

test('text rules: tricky numerals are NOT markers', () => {
  const keep = [
    'Psalm 119', 'Genesis 1:1', 'in 5787', '1,000 men', '3.14', 'the 10th of Tishrei', 'Elul 29.5', 'Chapter 4.', 'verses 7:12-14',
    '2 Kings 5:1', 'ch.4', 'v.3', 'page 12.', 'Tehillim 119, 5', 'He turned 70.', 'at 8:15 PM', 'on 25 Kislev.', 'פרק 5', 'תהלים קי"ט', 'שנת 5787', 'י"ב תמוז',
  ];
  for (const k of keep) assert.equal(stripFootnoteMarkers(k), k, k);
  const strip = [
    ['said.12 Then', 'said. Then'], ['God1 said', 'God said'], ['end,3 and', 'end, and'], ['He said,"3 and', 'He said," and'],
    ['text [12] more', 'text more'], ['sup²³ x', 'sup x'], ['Rashi (fn 4) says', 'Rashi says'], ['הקב"ה12 אמר', 'הקב"ה אמר'], ['אמר.4 לו', 'אמר. לו'],
    ['word ,', 'word,'], ['done!7', 'done!'], ['(see it)5 now', '(see it) now'],
  ];
  for (const [a, b] of strip) assert.equal(stripFootnoteMarkers(a), b, a);
  assert.equal(stripFootnoteMarkers('x.12', { glued: false }), 'x.12', 'references mode keeps glued digits');
});

test('sup rules: ordinals are kept, footnote-like sups dropped', () => {
  assert.ok(looksLikeMarker('12') && looksLikeMarker('*') && looksLikeMarker('[3]') && looksLikeMarker('') && looksLikeMarker('א'));
  assert.ok(!looksLikeMarker('th') && !looksLikeMarker('st'));
  assert.equal(stripFootnoteHtml('<p>On the 1<sup>st</sup> day<sup>2</sup>, <b>x</b>.</p>'), 'On the 1st day, x.');
});

test('feeds: daily study lines, Rambam/Tanya and quote/tidbits lose the markers; references stay exact', () => {
  const r = parseDailyStudyRSS(fx('dailystudy.xml'));
  assert.equal(r.tanya, 'Likkutei Amarim, Chapter 5');
  assert.equal(r.rambam1.displayEn, 'Issurei Biah - Chapter 6');
  assert.deepEqual(r.rambam1.chaptersArabic, [6]);
  assert.deepEqual(r.rambam3.chaptersArabic, [7, 8, 9]);
  assert.equal(r.seferHamitzvot.displayEn, 'Positive Commandment 6');
  assert.match(r.chumash, /Vayeira/);
  assert.equal(parseDailyStudyHebrewRSS(fx('dailystudy.xml')).tehillimHe, '');
});
