import test from 'node:test';
import assert from 'node:assert/strict';
import {
  postStyle, POST_STYLES, kindsFor, findTime, suggestLayout, sanitizePrefs, defaultsFor, recordPost, toggleStar, quickPicks,
  lengthChips, laterChips, expiryFor, buildPostBody, postButtonLabel, historyText, postedSummary, effectNote, parseClock,
} from '../src/shared/postDefaults.js';
import { SETTINGS_KEYS, SETTING_SCOPE } from '../src/shared/settingsMerge.js';
import { validateSettingValues, sanitizeSettingValues } from '../src/shared/settingsRules.js';
import { announcementName } from '../src/shared/undo.js';
import { zonedParts } from '../src/shared/announcements.js';

const TZ = 'America/New_York';
// Thursday 2026-10-22 14:04 New York (EDT = UTC-4)
const THU = new Date('2026-10-22T18:04:00Z');
const FRI = new Date('2026-10-23T15:00:00Z'); // Fri 11:00

test('post button style: default is the sheet, bad values fall back, classic is honoured', () => {
  assert.equal(postStyle(undefined), 'sheet');
  assert.equal(postStyle({}), 'sheet');
  assert.equal(postStyle({ post: {} }), 'sheet');
  assert.equal(postStyle({ post: { style: 'classic' } }), 'classic');
  assert.equal(postStyle({ post: { style: 'sheet' } }), 'sheet');
  assert.equal(postStyle({ post: { style: 'weird' } }), 'sheet');
  assert.deepEqual([...POST_STYLES], ['sheet', 'classic']);
});

test('post setting: org scope, whitelisted, server rule, bad stored value is cleaned', () => {
  assert.ok(SETTINGS_KEYS.includes('post'));
  assert.equal(SETTING_SCOPE.post, 'org');
  assert.deepEqual(validateSettingValues({ post: { style: 'classic' } }), []);
  assert.equal(validateSettingValues({ post: { style: 'tiles' } }).length, 1);
  const { settings, changed } = sanitizeSettingValues({ post: { style: 'tiles' }, siteName: 'x' });
  assert.equal(changed, true);
  assert.equal(postStyle(settings), 'sheet');
});

test('takeover chip only with the capability', () => {
  assert.deepEqual(kindsFor(false).map((k) => k.display), ['slide', 'banner', 'note']);
  assert.deepEqual(kindsFor(true).map((k) => k.display), ['slide', 'banner', 'note', 'takeover']);
  assert.match(effectNote('takeover', { minutes: 15 }), /15 min/);
  assert.match(effectNote('banner'), /Never stops/);
});

test('findTime / suggestLayout', () => {
  assert.equal(findTime('Mincha moved to 2:15'), '14:15');
  assert.equal(findTime('Shiur at 8 pm'), '20:00');
  assert.equal(findTime('Breakfast 7:30'), '07:30');
  assert.equal(findTime('Room 12'), null);
  assert.equal(suggestLayout(''), 'bigwords');
  assert.equal(suggestLayout('Mincha moved to 2:15'), 'quicktime');
  assert.equal(suggestLayout('Bus leaves soon'), 'bigwords');
  assert.equal(suggestLayout('Bring:\n- hat\n- coat\n- lunch'), 'list');
  assert.equal(suggestLayout('A long sentence with many many words that goes on and on and on and on and on and on 2:15'), 'bigwords');
});

test('defaults: nothing stored, last used, never a takeover, needs the capability', () => {
  assert.deepEqual(defaultsFor(null), { display: 'slide', lengthKey: 'eod' });
  assert.deepEqual(defaultsFor({ last: { display: 'banner', lengthKey: '60' } }), { display: 'banner', lengthKey: '60' });
  assert.equal(defaultsFor({ last: { display: 'takeover', lengthKey: '15' } }, { canTakeover: true }).display, 'slide');
  assert.equal(defaultsFor({ last: { display: 'banner', lengthKey: 'shabbos' } }, { lengthKeys: ['15', '60', 'eod'] }).lengthKey, 'eod');
  assert.deepEqual(defaultsFor({ last: { display: 'nope', lengthKey: 'nope' } }), { display: 'slide', lengthKey: 'eod' });
});

test('prefs: sanitised, recent templates newest first and capped, stars toggle and cap; no text is ever stored', () => {
  assert.deepEqual(sanitizePrefs('x'), { starred: [], recentTemplates: [], last: { display: null, lengthKey: null } });
  const dirty = sanitizePrefs({ starred: ['a', 'a', 'bad id!', 7], recentTemplates: Array.from({ length: 20 }, (_, i) => `t${i}`), last: { display: 'banner', lengthKey: 'x' }, text: 'Dovid is sick' });
  assert.deepEqual(dirty.starred, ['a']);
  assert.equal(dirty.recentTemplates.length, 8);
  assert.equal(dirty.last.lengthKey, null);
  assert.equal('text' in dirty, false);
  let p = recordPost(null, { templateId: 't1', display: 'banner', lengthKey: 'eod' });
  p = recordPost(p, { templateId: 't2', display: 'slide', lengthKey: 'pick' });
  p = recordPost(p, { templateId: 't1', display: 'slide', lengthKey: '60' });
  assert.deepEqual(p.recentTemplates, ['t1', 't2']);
  assert.deepEqual(p.last, { display: 'slide', lengthKey: '60' });
  assert.equal(recordPost({ last: { display: 'slide', lengthKey: '15' } }, { display: 'banner', lengthKey: 'pick' }).last.lengthKey, '15');
  let s = toggleStar(null, 'x'); assert.deepEqual(s.starred, ['x']);
  s = toggleStar(s, 'x'); assert.deepEqual(s.starred, []);
  for (let i = 0; i < 20; i++) s = toggleStar(s, `s${i}`);
  assert.equal(s.starred.length, 12);
  const tpls = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const picks = quickPicks(tpls, { starred: ['c', 'gone'], recentTemplates: ['b', 'c'] });
  assert.deepEqual(picks.map((x) => [x.template.id, x.starred]), [['c', true], ['b', false]]);
});

test('length chips: Shabbos only when it is near; ends from the start time; end of day in the org zone', () => {
  assert.deepEqual(lengthChips(THU).map((c) => c.key), ['15', '60', 'eod', 'forever']);
  const sat = '2026-10-24T23:40:00.000Z'; // within 72h of Thursday afternoon
  assert.deepEqual(lengthChips(THU, { shabbosEndIso: sat }).map((c) => c.key), ['15', '60', 'eod', 'shabbos', 'forever']);
  assert.ok(!lengthChips(new Date('2026-10-19T12:00:00Z'), { shabbosEndIso: sat }).some((c) => c.key === 'shabbos'));
  assert.ok(!lengthChips(new Date('2026-10-25T12:00:00Z'), { shabbosEndIso: sat }).some((c) => c.key === 'shabbos'));
  const chips = Object.fromEntries(lengthChips(THU, { shabbosEndIso: sat }).map((c) => [c.key, c]));
  assert.equal(expiryFor(chips['60'], THU.getTime(), TZ), '2026-10-22T19:04:00.000Z');
  assert.equal(expiryFor(chips.eod, THU.getTime(), TZ), '2026-10-23T03:59:00.000Z'); // 23:59 EDT
  assert.equal(expiryFor(chips.shabbos, THU.getTime(), TZ), sat);
  assert.equal(expiryFor(chips.forever, THU.getTime(), TZ), null);
  assert.equal(expiryFor({ key: 'pick', expiresAt: '2026-11-01T00:00:00.000Z' }, 0, TZ), '2026-11-01T00:00:00.000Z');
  // Later + 1 hour counts from the start
  const start = Date.parse('2026-10-23T11:00:00Z');
  assert.equal(expiryFor(chips['60'], start, TZ), '2026-10-23T12:00:00.000Z');
  // DST fall-back day (2026-11-01): end of day is still 23:59 local (EST)
  const dst = Date.parse('2026-11-01T12:00:00Z');
  assert.equal(expiryFor(chips.eod, dst, TZ), '2026-11-02T04:59:00.000Z');
});

test('later chips: Tonight only before 6, candles only Friday, tomorrow always, after Shabbos when known', () => {
  const keys = (now, o) => laterChips(now, { tz: TZ, ...o }).map((c) => c.key);
  assert.deepEqual(keys(THU), ['tonight', 'tomorrow']);
  assert.deepEqual(keys(new Date('2026-10-22T23:00:00Z')), ['tomorrow']); // 7 PM
  assert.ok(!keys(THU, { candleLighting: '5:58 PM' }).includes('candles')); // Thursday: never
  const fri = laterChips(FRI, { tz: TZ, candleLighting: '5:58 PM', shabbosEndIso: '2026-10-24T22:40:00Z' });
  assert.deepEqual(fri.map((c) => c.key), ['tonight', 'candles', 'tomorrow', 'after-shabbos']);
  assert.equal(fri[1].label, 'Before candle lighting 5:28 PM');
  assert.equal(fri[1].startsAtIso, '2026-10-23T21:28:00.000Z');
  assert.equal(laterChips(THU, { tz: TZ })[0].startsAtIso, '2026-10-22T22:00:00.000Z');
  assert.equal(laterChips(THU, { tz: TZ })[1].startsAtIso, '2026-10-23T11:00:00.000Z');
  // already past candle time -> not offered
  assert.ok(!keys(new Date('2026-10-23T21:50:00Z'), { candleLighting: '5:58 PM' }).includes('candles'));
  // a bad zone never throws
  assert.ok(laterChips(THU, { tz: 'Not/AZone' }).length >= 1);
  assert.equal(parseClock('17:58'), '17:58'); assert.equal(parseClock('x'), null);
});

test('buildPostBody: slide / banner / note / takeover, Hebrew, later, forever, errors', () => {
  const chips = Object.fromEntries(lengthChips(THU).map((c) => [c.key, c]));
  const slide = buildPostBody({ text: 'Assembly in the Zal', display: 'slide', chip: chips.eod, now: THU, tz: TZ });
  assert.equal(slide.error, null);
  assert.equal(slide.body.display, 'slide');
  assert.equal(slide.body.look.layout, 'bigwords');
  assert.equal(slide.body.content.headlineEn, 'Assembly in the Zal');
  assert.equal(slide.body.when.expiresAt, '2026-10-23T03:59:00.000Z');
  assert.equal(slide.body.when.startsAt, null);
  assert.equal(slide.body.status, 'published');

  const qt = buildPostBody({ text: 'Mincha moved to 2:15', display: 'slide', chip: chips['60'], now: THU, tz: TZ }).body;
  assert.equal(qt.look.layout, 'quicktime');
  assert.deepEqual([qt.content.quicktime.time, qt.content.quicktime.name], ['14:15', 'Mincha moved to']);

  const banner = buildPostBody({ text: 'Mincha moved to 2:15', display: 'banner', chip: chips['15'], now: THU, tz: TZ }).body;
  assert.equal(banner.look.layout, 'bigwords'); // banners and notes ignore layouts
  assert.equal(banner.content.quicktime, undefined);
  assert.equal(banner.when.expiresAt, '2026-10-22T18:19:00.000Z');

  const forced = buildPostBody({ text: 'Mincha moved to 2:15', display: 'slide', layout: 'bigwords', chip: chips.forever, now: THU, tz: TZ }).body;
  assert.equal(forced.look.layout, 'bigwords');
  assert.equal(forced.when.expiresAt, null);

  const list = buildPostBody({ text: 'Bring:\n- hat\n- coat', display: 'slide', chip: chips.eod, now: THU, tz: TZ }).body;
  assert.equal(list.look.layout, 'list');
  assert.deepEqual(list.content.list.items.map((x) => x.text), ['hat', 'coat']);

  const he = buildPostBody({ text: 'שיעור הערב', display: 'banner', chip: chips.eod, now: THU, tz: TZ }).body;
  assert.equal(he.content.headlineHe, 'שיעור הערב'); assert.equal(he.content.headlineEn, '');
  const both = buildPostBody({ text: 'Shiur tonight', textHe: 'שיעור', display: 'banner', chip: chips.eod, now: THU, tz: TZ }).body;
  assert.deepEqual([both.content.headlineEn, both.content.headlineHe], ['Shiur tonight', 'שיעור']);

  const later = buildPostBody({ text: 'Good morning', display: 'banner', chip: chips['60'], startsAtIso: '2026-10-23T11:00:00.000Z', now: THU, tz: TZ }).body;
  assert.equal(later.when.startsAt, '2026-10-23T11:00:00.000Z');
  assert.equal(later.when.expiresAt, '2026-10-23T12:00:00.000Z');

  assert.equal(buildPostBody({ text: '   ' }).body, null);
  assert.match(buildPostBody({ text: '' }).error, /What should the screen say/);
  assert.match(buildPostBody({ text: 'x'.repeat(281) }).error, /280/);
});

test('button and toast words never contain the message; History line is at most 40 characters', () => {
  const chips = Object.fromEntries(lengthChips(THU).map((c) => [c.key, c]));
  assert.equal(postButtonLabel({ display: 'slide' }), 'Post to screen');
  assert.equal(postButtonLabel({ display: 'banner', chip: chips.eod }), 'Post as banner for today');
  assert.equal(postButtonLabel({ display: 'takeover', chip: chips['15'] }), 'Post as takeover');
  assert.match(postButtonLabel({ display: 'banner', startsAtIso: '2026-10-23T11:00:00Z', now: THU, tz: TZ }), /^Schedule for tomorrow 7:00 AM$/);
  assert.equal(postedSummary({ display: 'banner', expiresAt: '2026-10-22T22:00:00Z', now: THU, tz: TZ }), 'On the screen: banner until 6:00 PM');
  assert.equal(postedSummary({ display: 'slide', now: THU, tz: TZ }), 'On the screen: slide until you remove it');
  assert.match(postedSummary({ display: 'note', startsAt: '2026-10-23T11:00:00Z', now: THU, tz: TZ }), /^Scheduled side note for tomorrow 7:00 AM$/);
  const long = 'Dovid Cohen please come to the office right now thank you';
  assert.equal(historyText(long).length, 40);
  assert.equal(historyText('Short one'), 'Short one');
  assert.equal(historyText('  a   b  '), 'a b');
  // the server's History/Undo line uses the same limit
  const name = announcementName({ content: { headlineEn: long } });
  assert.ok(name.length <= 40, name);
  assert.equal(name, historyText(long));
  assert.ok(zonedParts(THU, TZ).dow === 4);
});
