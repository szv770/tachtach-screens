import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STYLE_GROUPS, STYLE_IDS, STYLE_INFO, normalizeStyleId, renderStyleId,
  ANIMATIONS, DEFAULT_ANIMATION, normalizeAnimation, effectiveAnimation, SOFT_LIMITS,
} from '../src/shared/takeoverStyles.js';
import {
  sanitizeInput, mergeItem, createItem, defaultItem, messageToItem, slideToItem, ValidationError,
} from '../src/server/announcements-model.js';
import { hasText, primaryText, layoutOf, LAYOUTS, INSPIRATION_LAYOUTS } from '../src/shared/announcements.js';
import {
  splitTime, listRow, modelBigWords, modelEvent, modelList, modelQuick, modelQuote, modelSicha, modelLetter, stageLayout, modelFor,
} from '../src/shared/takeoverModel.js';
import { STYLES, styleOf } from '../src/screen/design/announceStyles.js';
import { ART_IDS } from '../src/screen/takeover/art.js';
import { TAKEOVER_CSS } from '../src/screen/takeover/css.js';
import { LAYOUT_HTML } from '../src/screen/takeover/layouts.js';

const OLD_STYLES = ['classic', 'grand', 'emergency', 'sleek', 'celebration', 'urgent', 'torah', 'trip', 'phone', 'memorial', 'hype'];
const NEW_STYLES = ['shabbos', 'yomtov', 'siyum', 'farbrengen', 'mivtzoim', 'welcome', 'simcha', 'schedule', 'quiet', 'chanukah', 'purim', 'pesach', 'roshchodesh', 'lagbaomer', 'chassidic'];

// ── style ids ───────────────────────────────────────────────────────────────

test('26 styles, each in exactly one picker group, each with a label', () => {
  assert.equal(STYLE_IDS.length, 26);
  assert.equal(new Set(STYLE_IDS).size, 26);
  assert.deepEqual([...STYLE_IDS].sort(), [...OLD_STYLES, ...NEW_STYLES].sort());
  assert.deepEqual(STYLE_GROUPS.map((g) => g.label), ['Everyday', 'Alerts', 'Moments', 'Shabbos & Yom Tov', 'Seasonal']);
  assert.deepEqual(STYLE_GROUPS.find((g) => g.id === 'seasonal').ids, ['chanukah', 'purim', 'pesach', 'roshchodesh', 'lagbaomer', 'chassidic']);
  assert.deepEqual(STYLE_GROUPS.find((g) => g.id === 'alerts').ids, ['emergency', 'urgent', 'schedule', 'phone']);
  for (const id of STYLE_IDS) assert.ok(STYLE_INFO[id] && STYLE_INFO[id][0], id);
});

test('style id mapping: old ids keep their name, aliases map, unknown -> classic, none stays none', () => {
  for (const id of OLD_STYLES) assert.equal(normalizeStyleId(id), id, id);
  assert.equal(normalizeStyleId('notice'), 'urgent');
  assert.equal(normalizeStyleId('no-such-style'), 'classic');
  assert.equal(normalizeStyleId(''), null);
  assert.equal(normalizeStyleId(null), null);
  assert.equal(normalizeStyleId(undefined), null);
  assert.equal(renderStyleId(null), 'classic');
  assert.equal(renderStyleId('purim'), 'purim');
  assert.equal(renderStyleId('bogus'), 'classic');
});

test('style ids through the model: sanitizeInput and the legacy migrations', () => {
  assert.equal(sanitizeInput({ look: { style: 'chanukah' } }).look.style, 'chanukah');
  assert.equal(sanitizeInput({ look: { style: 'notice' } }).look.style, 'urgent');
  assert.equal(sanitizeInput({ look: { style: 'nope' } }).look.style, 'classic');
  assert.equal(sanitizeInput({ look: { style: '' } }).look.style, null);
  // old messages.json takeover styles map to the same-named new style
  for (const id of OLD_STYLES) assert.equal(messageToItem({ id: 'm', type: 'takeover', textEn: 'x', style: id }).look.style, id);
  assert.equal(messageToItem({ id: 'm', type: 'takeover', textEn: 'x', style: 'weird' }).look.style, 'classic');
  assert.equal(slideToItem({ id: 's', type: 'custom', titleEn: 'x', style: 'purim' }).look.style, 'purim');
  assert.equal(slideToItem({ id: 's', type: 'custom', titleEn: 'x' }).look.style, null);
});

test('every style has a layout registry entry, art, palette CSS and renders', () => {
  assert.deepEqual(Object.keys(STYLES).sort(), [...STYLE_IDS].sort());
  assert.deepEqual([...ART_IDS].sort(), [...STYLE_IDS].sort());
  for (const id of STYLE_IDS) {
    const S = STYLES[id];
    assert.equal(S.box.length, 4, id);
    assert.ok(['start', 'center'].includes(S.align), id);
    assert.ok(['calm', 'rise', 'lively', 'snap', 'drop', 'slide'].includes(S.ent), id);
    assert.ok(TAKEOVER_CSS.includes(`.st-${id} `) || TAKEOVER_CSS.includes(`.st-${id}{`), `css for ${id}`);
  }
  assert.equal(styleOf('nope'), STYLES.classic);
  assert.equal(styleOf(null), STYLES.classic);
  assert.equal(styleOf('notice'), STYLES.urgent);
});

// ── animation ───────────────────────────────────────────────────────────────

test('look.animation whitelist and default', () => {
  assert.deepEqual(ANIMATIONS, ['full', 'entrance', 'off']);
  assert.equal(DEFAULT_ANIMATION, 'full');
  assert.equal(normalizeAnimation('entrance'), 'entrance');
  assert.equal(normalizeAnimation('off'), 'off');
  assert.equal(normalizeAnimation('wild'), 'full');
  assert.equal(normalizeAnimation(undefined), 'full');
  assert.equal(defaultItem().look.animation, 'full');
  assert.equal(sanitizeInput({ look: { animation: 'entrance' } }).look.animation, 'entrance');
  assert.equal(sanitizeInput({ look: { animation: 'zoom' } }).look.animation, 'full');
  assert.equal('animation' in sanitizeInput({ look: { style: 'grand' } }).look, false, 'untouched when not sent');
  // partial merge keeps the stored value
  const it = createItem(sanitizeInput({ look: { animation: 'off' }, content: { headlineEn: 'x' } }), { id: 'a' });
  assert.equal(mergeItem(it, sanitizeInput({ look: { style: 'grand' } })).look.animation, 'off');
  assert.equal(createItem(sanitizeInput({ content: { headlineEn: 'x' } }), { id: 'b' }).look.animation, 'full');
});

test('settings.motion maps onto the per-announcement Animation (smooth=full, minimal=entrance, lively=full+extras)', () => {
  assert.deepEqual(effectiveAnimation('full', 'smooth'), { anim: 'full', lively: false });
  assert.deepEqual(effectiveAnimation(undefined, 'smooth'), { anim: 'full', lively: false });
  assert.deepEqual(effectiveAnimation('full', 'minimal'), { anim: 'entrance', lively: false });
  assert.deepEqual(effectiveAnimation('full', 'lively'), { anim: 'full', lively: true });
  assert.deepEqual(effectiveAnimation('entrance', 'lively'), { anim: 'entrance', lively: true });
  assert.deepEqual(effectiveAnimation('entrance', 'smooth'), { anim: 'entrance', lively: false });
  assert.deepEqual(effectiveAnimation('off', 'lively'), { anim: 'off', lively: false });
  assert.deepEqual(effectiveAnimation('off', 'smooth'), { anim: 'off', lively: false });
  assert.deepEqual(effectiveAnimation('full', 'nonsense'), { anim: 'full', lively: false });
});

// ── inspiration layouts (Phase 2b) ──────────────────────────────────────────

test('quote / sicha / letter are layouts and their fields are whitelisted', () => {
  for (const l of INSPIRATION_LAYOUTS) assert.ok(LAYOUTS.includes(l), l);
  assert.equal(sanitizeInput({ look: { layout: 'sicha' } }).look.layout, 'sicha');
  assert.equal(sanitizeInput({ look: { layout: 'nope' } }).look.layout, 'bigwords');
  const out = sanitizeInput({
    content: {
      quote: { text: 'A little light', textHe: 'מעט מן האור', source: 'Tanya 12', sourceHe: 'תניא', hax: 'no' },
      sicha: { title: 'From a Sicha', titleHe: 'מתוך שיחה', body: 'p1\n\np2', source: 'LS 5', junk: 1 },
      letter: { date: '15 Cheshvan', dateHe: 'ט״ו מרחשון', salutation: 'שלום', body: 'x'.repeat(20000), signature: 'בברכה', source: 'Igros', sourceHe: 'אגרות', other: 2 },
    },
  });
  assert.deepEqual(out.content.quote, { text: 'A little light', textHe: 'מעט מן האור', source: 'Tanya 12', sourceHe: 'תניא' });
  assert.deepEqual(out.content.sicha, { title: 'From a Sicha', titleHe: 'מתוך שיחה', body: 'p1\n\np2', source: 'LS 5' });
  assert.deepEqual(Object.keys(out.content.letter).sort(), ['body', 'date', 'dateHe', 'salutation', 'signature', 'source', 'sourceHe']);
  assert.equal(out.content.letter.body.length, 12000, 'long body is capped, not rejected');
  const d = defaultItem();
  assert.deepEqual(Object.keys(d.content.quote), ['text', 'textHe', 'source', 'sourceHe']);
  assert.deepEqual(Object.keys(d.content.sicha), ['title', 'titleHe', 'body', 'source']);
  assert.ok('salutation' in d.content.letter && 'signature' in d.content.letter);
});

test('inspiration layouts: text rules, summaries and partial merge', () => {
  const mk = (layout, content) => createItem(sanitizeInput({ display: 'slide', look: { layout }, content }), { id: layout });
  assert.throws(() => mk('quote', { quote: { source: 'only a source' } }), ValidationError);
  assert.throws(() => mk('sicha', { sicha: { title: 'only a title' } }), ValidationError);
  assert.throws(() => mk('letter', { letter: { salutation: 'only a greeting' } }), ValidationError);
  const q = mk('quote', { quote: { text: 'Be happy', source: 'Tanya' } });
  const q2 = mk('quote', { quote: { textHe: 'שמח' } });
  const s = mk('sicha', { sicha: { title: 'Noach', body: 'Come into the teivah.' } });
  const l = mk('letter', { letter: { body: 'במענה על מכתבו' } });
  for (const it of [q, q2, s, l]) assert.ok(hasText(it));
  assert.equal(layoutOf(q), 'quote');
  assert.equal(primaryText(q), 'Be happy — Tanya');
  assert.equal(primaryText(s), 'Noach');
  // a takeover with the quote layout works the same
  assert.ok(hasText({ display: 'takeover', look: { layout: 'quote' }, content: { quote: { text: 'x' } } }));
  // merging one field keeps the sibling fields; other layouts' content is untouched
  const merged = mergeItem(q, sanitizeInput({ content: { quote: { source: 'Tanya 36' } } }));
  assert.equal(merged.content.quote.text, 'Be happy');
  assert.equal(merged.content.quote.source, 'Tanya 36');
  assert.equal(merged.content.sicha.body, '');
});

test('richer event / list / quicktime fields round-trip; old string list items still work', () => {
  const out = sanitizeInput({
    content: {
      target: 'Important', targetHe: 'חשוב',
      event: { title: 'Dismissal', dayHe: 'היום', place2: 'Leave seforim', time: '14:00' },
      list: { heading: 'Week', items: ['plain string', { text: 'Farbrengen', textHe: 'התוועדות', day: 'Tonight', time: '21:30' }] },
      quicktime: { name: 'Gut Shabbos', time: '18:28', time2: '19:21', label: 'Candle lighting', label2: 'Havdalah', was: '17:45', big: '3', bigLabel: 'days to go', pre: 'by' },
    },
  });
  assert.equal(out.content.targetHe, 'חשוב');
  assert.equal(out.content.event.dayHe, 'היום');
  assert.equal(out.content.event.place2, 'Leave seforim');
  assert.equal(out.content.list.items[0], 'plain string');
  assert.deepEqual(out.content.list.items[1], { text: 'Farbrengen', textHe: 'התוועדות', day: 'Tonight', time: '21:30' });
  assert.equal(out.content.quicktime.time2, '19:21');
  assert.equal(out.content.quicktime.big, '3');
  assert.throws(() => sanitizeInput({ content: { list: { items: [{ text: 'x', time: '99:99' }] } } }), ValidationError);
  assert.throws(() => sanitizeInput({ content: { quicktime: { time2: 'noon' } } }), ValidationError);
  assert.throws(() => sanitizeInput({ content: { list: { items: Array(9).fill({ text: 'x' }) } } }), ValidationError);
  // a countdown number counts as the "time" of a quick-time announcement
  assert.ok(hasText({ display: 'takeover', look: { layout: 'quicktime' }, content: { quicktime: { name: 'Shabbaton', big: '3' } } }));
});

// ── content models the stage draws ──────────────────────────────────────────

test('takeoverModel: times, list rows, layouts', () => {
  assert.deepEqual(splitTime('21:30'), ['9:30', 'PM']);
  assert.deepEqual(splitTime('00:05'), ['12:05', 'AM']);
  assert.deepEqual(splitTime('1:45 PM'), ['1:45', 'PM']);
  assert.equal(splitTime(''), null);
  assert.deepEqual(listRow('Siddur'), { d: '', en: 'Siddur', he: '', t: null });
  assert.deepEqual(listRow('סידור'), { d: '', en: '', he: 'סידור', t: null });
  assert.deepEqual(listRow('Mincha\nמנחה'), { d: '', en: 'Mincha', he: 'מנחה', t: null });
  assert.deepEqual(listRow({ text: 'A', textHe: 'א', day: 'Mon', time: '08:00' }), { d: 'Mon', en: 'A', he: 'א', t: ['8:00', 'AM'] });
  assert.equal(stageLayout('quicktime'), 'quick');
  assert.equal(stageLayout('quick'), 'quick');
  assert.equal(stageLayout('classic'), 'bigwords');
  assert.equal(stageLayout('weird'), 'bigwords');

  const bw = modelBigWords({ content: { headlineHe: 'מזל טוב', headlineEn: 'Mazel Tov', bodyEn: 'to the Cohens', subtitle: 'Thursday', attribution: 'The Office', target: 'Shiur Beis' } });
  assert.deepEqual(bw.kick, ['Shiur Beis', '']);
  assert.equal(bw.sub[0], 'to the Cohens · Thursday · — The Office');
  assert.equal(modelBigWords({ content: { bodyEn: 'only a body' } }).en, 'only a body');
  assert.equal(modelBigWords({ content: { headlineEn: 'x' } }).sub, null);

  const ev = modelEvent({ content: { event: { title: 'Farbrengen', day: 'הערב', time: '21:30', place: 'Zal' } } });
  assert.deepEqual(ev.when, ['', 'הערב'], 'a Hebrew day moves to the Hebrew line');
  assert.deepEqual(ev.time, ['9:30', 'PM']);
  assert.equal(ev.place.en, 'Zal');
  assert.equal(modelEvent({ content: { event: { title: 'x' } } }).place, null);

  const ls = modelList({ content: { list: { heading: 'H', items: ['A', { text: 'B', day: 'Tue', time: '09:00' }, ''] } } });
  assert.equal(ls.items.length, 2);
  assert.equal(ls.nod, false);
  assert.equal(ls.items[1].soon, true, 'first row with a day/time is the "soon" row');
  assert.equal(modelList({ content: { list: { items: ['A', 'B'] } } }).nod, true);

  const qk = modelQuick({ content: { quicktime: { name: 'Gut Shabbos', time: '18:28', time2: '19:21', label: 'Candle lighting', labelHe: 'הדלקת נרות', label2: 'Havdalah', place: 'Zal' } } });
  assert.equal(qk.times.length, 2);
  assert.deepEqual(qk.times[0], ['6:28', 'PM', 'Candle lighting', 'הדלקת נרות']);
  assert.deepEqual(modelQuick({ content: { quicktime: { name: 'S', big: '3', bigLabel: 'days', time: '10:00' } } }).big, ['3', 'days']);
  assert.equal(modelQuick({ content: { quicktime: { name: 'M', time: '13:00', was: '12:30' } } }).was, '12:30 PM');

  const qu = modelQuote({ content: { quote: { text: 'Be happy', textHe: 'שמח', source: 'Tanya' } } });
  assert.deepEqual([qu.en, qu.he, qu.attr], ['Be happy', 'שמח', ['Tanya', '']]);
  assert.deepEqual(modelSicha({ content: { sicha: { title: 'T', body: 'one\n\ntwo\nthree', source: 'S' } } }).body, ['one', 'two', 'three']);
  const lt = modelLetter({ content: { letter: { dateHe: 'ט״ו מרחשון', date: 'Brooklyn', salutation: 'שלום', body: 'במענה', signature: 'בברכה' } } });
  assert.equal(lt.rtl, true);
  assert.deepEqual(lt.top, ['ב״ה', 'ט״ו מרחשון · Brooklyn']);
  assert.equal(modelLetter({ content: { letter: { body: 'Dear friend' } } }).rtl, false);
  assert.deepEqual(modelFor({ content: { quote: { text: 'x' } } }, 'quote').en, 'x');
});

test('layout HTML escapes admin text and keeps newlines as line breaks', () => {
  const html = LAYOUT_HTML.bigwords({ he: '', en: '<b>Hi</b> & "bye"\nsecond', sub: null, kick: null });
  assert.ok(!html.includes('<b>'), 'tags are escaped');
  assert.ok(html.includes('&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;bye&quot;<br>second'));
  assert.ok(html.includes('only-en'));
  const ls = LAYOUT_HTML.list({ hd: ['H', ''], nod: true, items: [{ d: '', en: 'x<y', he: '', t: null, soon: false }] });
  assert.ok(ls.includes('x&lt;y'));
  for (const layout of ['bigwords', 'event', 'list', 'quick', 'quote', 'sicha', 'letter']) assert.equal(typeof LAYOUT_HTML[layout], 'function', layout);
});

test('soft composer limits are the README numbers', () => {
  assert.equal(SOFT_LIMITS.titleHe, 45);
  assert.equal(SOFT_LIMITS.titleEn, 100);
  assert.equal(SOFT_LIMITS.listItems, 6);
  assert.equal(SOFT_LIMITS.quickName, 30);
});
