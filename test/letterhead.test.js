import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeLetterLook, modelLetterhead, isLetterhead, planTimeline, packPages, HEAD_PRESETS, DEFAULT_LETTER_LOOK, NEW_LETTER_LOOK, letterheadSlideSeconds, TYPING,
} from '../src/shared/letterhead.js';
import { sanitizeInput, createItem } from '../src/server/announcements-model.js';
import { sanitizeSavedLetter, toAnnouncement } from '../src/shared/savedLetters.js';

const item = (letter = {}, look = {}) => ({
  content: { letter: { date: 'Cheshvan, 5738', salutation: 'Greeting and Blessing:', body: 'One.\n\nTwo.', signature: 'With esteem', to: 'To the Students\nThe Yeshiva', ...letter } },
  look: { layout: 'letter', letter: { paper: 'letterhead', ...look } },
});

test('look.letter: unknown values fall back, always complete, old letters stay plain', () => {
  assert.deepEqual(sanitizeLetterLook(undefined), DEFAULT_LETTER_LOOK);
  assert.equal(DEFAULT_LETTER_LOOK.paper, 'plain');
  assert.equal(NEW_LETTER_LOOK.paper, 'letterhead');
  const s = sanitizeLetterLook({ paper: 'x', head: 'nope', body: 'comic', grace: 0, signature: false, mailed: 1, stamp: true });
  assert.deepEqual(s, { paper: 'plain', head: 'rebbe', body: 'typed', grace: true, signature: false, mailed: false, stamp: true, speed: 'screen' });
  assert.equal(isLetterhead({ look: { layout: 'letter' } }), false);
  assert.equal(isLetterhead(item()), true);
  assert.equal(isLetterhead({ look: { layout: 'sicha', letter: { paper: 'letterhead' } } }), false);
});

test('model: letterhead preset, grace, addressee, mailed + postmark only when asked', () => {
  const m = modelLetterhead(item());
  assert.equal(m.head.en[0], 'RABBI MENACHEM M. SCHNEERSON');
  assert.equal(m.head.he[1], 'ליובאוויטש');
  assert.equal(m.grace, 'By the Grace of G-d');
  assert.deepEqual(m.to, ['To the Students', 'The Yeshiva']);
  assert.deepEqual(m.body, ['One.', 'Two.']);
  assert.equal(m.sigImg, 'rebbe');
  assert.deepEqual(m.mailed, []);
  assert.equal(m.stamp, null);
  const m2 = modelLetterhead(item({ mailed: 'A\nB', postmark: 'BROOKLYN, N.Y.|1 NOV 1977' }, { mailed: true, stamp: true, signature: false, grace: false }));
  assert.deepEqual(m2.mailed, ['A', 'B']);
  assert.deepEqual(m2.stamp, { top: 'BROOKLYN, N.Y.', bottom: '1 NOV 1977' });
  assert.equal(m2.sigImg, null);
  assert.equal(m2.grace, '');
  // a postmark with no text uses the sender's city
  assert.equal(modelLetterhead(item({}, { stamp: true })).stamp.top, 'BROOKLYN, N.Y.');
});

test('model: other senders, custom lines, Hebrew letters read right to left with the Torah serif', () => {
  assert.match(HEAD_PRESETS.rayatz.en[0], /SCHNEERSOHN/);
  assert.equal(modelLetterhead(item({}, { head: 'rayatz' })).sigImg, null);
  const c = modelLetterhead(item({ headEn: 'A SCHOOL\nA street', headHe: 'בית ספר' }, { head: 'custom' }));
  assert.deepEqual(c.head.en, ['A SCHOOL', 'A street']);
  assert.deepEqual(modelLetterhead(item({}, { head: 'none' })).head, { en: [], he: [] });
  const he = modelLetterhead(item({ body: 'שלום וברכה', date: '', dateHe: 'ב׳ מרחשון', salutation: '' }));
  assert.equal(he.rtl, true); assert.equal(he.serif, true); assert.equal(he.grace, 'ב״ה');
  assert.equal(modelLetterhead(item({}, { body: 'serif' })).serif, true);
});

test('server whitelist keeps the new letter fields and look.letter, and rejects junk', () => {
  const out = sanitizeInput({ content: { letter: { body: 'x', to: 'A\nB', mailed: 'M', postmark: 'P', headEn: 'E', headHe: 'H', grace: 'G', evil: 'no' } }, look: { layout: 'letter', letter: { paper: 'letterhead', head: 'rayatz', stamp: true, junk: 1 } } });
  assert.equal(out.content.letter.to, 'A\nB');
  assert.equal(out.content.letter.evil, undefined);
  assert.deepEqual(out.look.letter, { paper: 'letterhead', head: 'rayatz', body: 'typed', grace: true, signature: true, mailed: false, stamp: true, speed: 'screen' });
  const made = createItem(out, { id: 'a1' });
  assert.equal(made.look.letter.paper, 'letterhead');
  assert.equal(made.content.letter.mailed, 'M');
  // an old letter has no look.letter and keeps drawing the plain page
  assert.equal(createItem(sanitizeInput({ content: { letter: { body: 'x' } }, look: { layout: 'letter' } }), { id: 'a2' }).look.letter, undefined);
});

test('saved letters carry the paper options and post again with them', () => {
  const rec = sanitizeSavedLetter({ kind: 'letter', letter: { body: 'Hello', to: 'Students' }, paper: { paper: 'letterhead', stamp: true } });
  assert.equal(rec.letter.to, 'Students');
  assert.equal(rec.paper.paper, 'letterhead');
  const a = toAnnouncement(rec);
  assert.equal(a.look.letter.stamp, true);
  assert.equal(toAnnouncement(sanitizeSavedLetter({ kind: 'letter', letter: { body: 'Hello' } })).look.letter, undefined);
});

test('timeline: ordered, finite, the longest of typing and reading, signature before stamp', () => {
  const t = planTimeline({ headLines: [19, 40, 20], pages: [{ lines: [60, 70, 20], words: 95 }], wpm: 120, hasClose: true, closeChars: 11, hasSig: true, hasStamp: true, hasMailed: true });
  let last = 0;
  for (const h of t.headT) { assert.ok(h.s >= last && h.e > h.s); last = h.e; }
  assert.ok(t.pages[0].start >= last);
  for (const l of t.pages[0].lineT) assert.ok(l.e > l.s);
  assert.ok(t.pages[0].end - t.pages[0].start >= (95 * 60) / 120, 'holds for the reading time');
  assert.ok(t.closeT.s > t.pages[0].typedEnd && t.sigT.s >= t.closeT.e && t.stampT.s > t.sigT.s);
  assert.ok(t.total >= t.stampT.e + TYPING.endHold - 1e-9);
  const loop = planTimeline({ pages: [{ lines: [10], words: 3 }], loop: true });
  assert.ok(Math.abs(loop.total - (loop.end + TYPING.loopFade)) < 1e-9);
  assert.equal(letterheadSlideSeconds(31.2, 12), 33);
  assert.equal(letterheadSlideSeconds(3, 40), 40);
  // pages never overlap: the next page starts after the previous one cleared
  const two = planTimeline({ pages: [{ lines: [50, 50], words: 40 }, { lines: [30], words: 20 }] });
  assert.ok(two.pages[1].start >= two.pages[0].end - 1e-9);
  assert.ok(two.pages[1].start > two.pages[0].typedEnd);
});

test('paging: next lines, never a scroll; no lone stranded line; always at least one page', () => {
  assert.deepEqual(packPages([['a', 'b'], ['c']], 10).map((p) => p.paras.map((q) => q.length)), [[2, 1]]);
  const pages = packPages([['a', 'b', 'c', 'd', 'e', 'f', 'g']], 4);
  assert.deepEqual(pages.map((p) => p.paras[0].length), [4, 3]);
  // a paragraph that would leave ONE line at the foot of a page starts the next page with it instead
  const p2 = packPages([['a', 'b'], ['c', 'd', 'e', 'f']], 3.5);
  assert.ok(p2.every((p) => !(p.paras.length > 1 && p.paras[p.paras.length - 1].length === 1 && p.cont)));
  assert.equal(packPages([], 5).length, 1);
  assert.ok(packPages([['x']], 0.1).length >= 1);
});

test('paste: the addressee, the Grace line and a Jewish-month date are recognised', async () => {
  const { parseLetter } = await import('../src/shared/letterParse.js');
  const r = parseLetter('By the Grace of G-d\nIn the Beginning of Cheshvan, 5738. Brooklyn, N.Y.\n\nTo the Students of\nThe Landau Yeshiva\nMiami Beach, Fla.\n\nGreeting and Blessing:\n\nI appreciate very much your thoughtful expression of concern and your good wishes for a speedy and complete recovery.\n\nWith esteem');
  assert.equal(r.to, 'To the Students of\nThe Landau Yeshiva\nMiami Beach, Fla.');
  assert.match(r.date, /Cheshvan, 5738/);
  assert.equal(r.salutation, 'Greeting and Blessing:');
  assert.equal(r.signature, 'With esteem');
  assert.match(r.body, /^I appreciate/);
});

test('daily letter: a Daily Story entry of kind letter keeps the whole letter, its paper and style', async () => {
  const { normalizeStory, normalizeDailyStoriesFile, pickDailyStory, snapshotOf, readingSeconds } = await import('../src/shared/dailyStories.js');
  const { letterEntryItem, isLetterhead, effectiveSpeed, SPEED_MUL } = await import('../src/shared/letterhead.js');
  assert.ok(normalizeStory({ kind: 'letter', letter: { body: '' } }).error, 'a letter needs text');
  const r = normalizeStory({ kind: 'letter', title: '', letter: { body: 'Dear boys, keep learning.', salutation: 'Dear boys:', to: 'The boys', evil: 'x' }, paper: { stamp: true, speed: 'fast' }, style: 'torah' });
  const st = r.story;
  assert.equal(st.kind, 'letter'); assert.equal(st.letter.evil, undefined); assert.equal(st.title, 'Dear boys:');
  assert.equal(st.enabled, true, 'no source rule for a letter');
  assert.equal(st.paper.speed, 'fast'); assert.equal(st.paper.paper, 'letterhead'); assert.equal(st.style, 'torah');
  assert.equal(snapshotOf(st).letter.to, 'The boys');
  assert.equal(readingSeconds(st), 0);
  const file = normalizeDailyStoriesFile({ stories: [st] });
  const today = pickDailyStory(file, '2026-11-12');
  assert.equal(today.kind, 'letter');
  const item = letterEntryItem(today, 30);
  assert.equal(isLetterhead(item), true);
  assert.equal(item.slide.duration, 30);
  assert.equal(item.content.letter.body, 'Dear boys, keep learning.');
  // a story still needs its source; a letter in the same list does not change that
  assert.equal(normalizeStory({ kind: 'story', text: 'Once', source: '' }).story.enabled, false);
  // speed: the letter's own beats the screen's; unknown falls back to normal
  assert.equal(effectiveSpeed('slow', 'fast'), 'slow');
  assert.equal(effectiveSpeed('screen', 'fast'), 'fast');
  assert.equal(effectiveSpeed(undefined, 'weird'), 'normal');
  assert.ok(SPEED_MUL.slow < SPEED_MUL.normal && SPEED_MUL.normal < SPEED_MUL.fast);
  const slow = planTimeline({ pages: [{ lines: [80, 80], words: 4 }], typeMul: SPEED_MUL.slow });
  const fast = planTimeline({ pages: [{ lines: [80, 80], words: 4 }], typeMul: SPEED_MUL.fast });
  assert.ok(slow.pages[0].typedEnd - slow.pages[0].start > fast.pages[0].typedEnd - fast.pages[0].start);
});
