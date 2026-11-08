#!/usr/bin/env node
/**
 * Programmatic checks of the Countdown page (OccasionSlide.jsx), its takeovers (takeover/OccasionTakeover.jsx) and the live
 * moments (takeover/OccasionMoment.jsx), in every form with the worst content.
 * Run against a THROWAWAY copy of the app (scratch TACHTACH_DATA_DIR), never real data:
 *   npm run build && TACHTACH_DATA_DIR=$(mktemp -d) PORT=3100 node server.js &
 *   node scripts/occasions-audit.mjs http://localhost:3100 [--shots DIR] [--only TAG] [--quick]
 * Needs Playwright (/opt/node-tools) and chromium at /opt/pw-browsers/chromium. Fakes the clock and the zone
 * (America/New_York) and injects the occasions document + slides + location (+ a live moment, + fonts, + theme) through a
 * route on /api/state; serves generated pure-white / pure-black pictures for /uploads/*.png.
 * Checks, at 1600x900, 900x1600 and 3840x2160 (4K): the expected form / view renders; nothing clips, leaves the panel or
 * overlaps another text block; every auto-fitted name / greeting fits its box (no clipped descenders or nikud); text >= 24
 * canvas px; the countdown numerals are big; the explanation only with a source; the zero moment's confetti is gone and
 * nothing runs after it settled; Hebrew-only / English-only; '~' for an approximate time; three very different Hebrew
 * display fonts (Rubik, Frank Ruhl Libre, Suez One); the flip display; a count-up; the advent grid with and without a photo
 * (+ today's step page, + tiles opened today fade once); takeovers (milestone, final minute with tabular seconds, zero);
 * live moments (burst, shout-out, ten); a tap pop; text contrast over a white and a black photo in a dark and a light theme.
 * DATES + WHY (owner 2026-11: 'what the date is, why it is special'): rows that carry `dates` (the day, its Hebrew date, 'Begins
 * Saturday evening', the zman, 'until it begins') and `why` (a short sourced line): the day block, the begins block, the why block
 * (label, fitted text >= 28 px, muted source line) in the order date > begins > why > event, the day count that reads 'DAYS UNTIL IT
 * BEGINS' (never 'days to go' next to an evening start), the day view's hero line, the milestone takeover's quiet line (dropped, not
 * clipped, when crowded), 160-character worst cases in both languages, three Hebrew fonts, light + dark contrast at 4.5:1.
 * The model emits `dates` / `why` / `forms` / `today` itself (src/shared/occasions.js): the fixtures only set the occasion's INPUTS
 * (explainShortEn/He + source + explainChecked). Exception: the milestone TAKEOVER's quiet why line needs takeoverFor() to carry
 * `why` / `dates` (it does not yet); those cases inject them through window.__OCC_FX and only WARN when the build ignores it.
 */
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const sharp = createRequire(import.meta.url)('sharp');
const { THEMES } = await import('../src/shared/themes.js');
const THEME_IDS = THEMES.map((t) => t.id);

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3100';
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const QUICK = args.includes('--quick');
const fails = []; let checks = 0;
const check = (name, ok, info = '') => { checks++; if (!ok) fails.push(`${name} ${info}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${ok ? '' : String(info).replace(/\s+/g, ' ').slice(0, 220)}`); };

const LONG_EN = 'The Annual Yeshiva Dinner and Siyum Celebration of the Year'.slice(0, 60);
const LONG_HE = 'סעודת הסיום השנתית הגדולה של הישיבה הקדושה והתמימים יחד'.slice(0, 60);
const X_EN = Array.from({ length: 12 }, () => 'A long explanation sentence with real words in it.').join(' ').slice(0, 600);
const X_HE = Array.from({ length: 12 }, () => 'משפט ארוך של הסבר עם מילים אמיתיות בתוכו.').join(' ').slice(0, 600);
const SRC = 'Sefer Sample, volume 3, page 120, a long source line written out in full for the test'.slice(0, 140);
const EV_EN = 'Farbrengen at 8:30 PM in the main hall with the whole yeshiva, refreshments served'.slice(0, 120);
const EV_HE = 'התוועדות בשעה 8:30 בערב באולם הגדול עם כל הישיבה, כיבוד קל'.slice(0, 120);
const WHITE = '/uploads/white-photo-0001.png';
const BLACK = '/uploads/black-photo-0001.png';
const GREY = '/uploads/grey-photo-0001.png';
const DARK = '/uploads/dark-photo-0001.png'; // a dark red picture: must stay clearly visible under the admin's light dim

const starter = (o) => ({ on: true, rule: { kind: 'hebrew', month: 9, day: 19 }, ...o });
const RC = { id: 'rc', nameEn: 'Rosh Chodesh Kislev', nameHe: 'ראש חודש כסלו', starter: 'rc-kislev', rule: { kind: 'roshChodesh', month: 9 }, zeroKey: 'chodeshTov', style: 'chassidic' };
const YT = starter({ id: 'yt', nameEn: 'Yud-Tes Kislev', nameHe: 'י״ט כסלו', starter: 'yud-tes-kislev', zeroKey: 'gutYomTov', eventEn: 'Farbrengen 8 PM, main hall', eventHe: 'התוועדות 8 בערב' });
const CH = { id: 'ch', nameEn: 'Chanukah', nameHe: 'חנוכה', rule: { kind: 'hebrew', month: 9, day: 25 }, days: 8, zeroKey: 'chanukah' };
const BIG = { id: 'big', nameEn: LONG_EN, nameHe: LONG_HE, rule: { kind: 'gregorian', month: 11, day: 10 }, beginsAt: 'shkia', explainEn: X_EN, explainHe: X_HE, explainChecked: true, source: SRC, eventEn: EV_EN, eventHe: EV_HE, zeroKey: 'here' };
const BIG_CO = (i) => ({ id: `bc${i}`, nameEn: `Shemini Atzeres & Simchas Torah ${i}`, nameHe: 'שמיני עצרת ושמחת תורה', rule: { kind: 'gregorian', month: 11, day: 12 + i } });
// an exact 6 PM start (no zmanim needed): the evening before 19 Nov 2026 (Wed 18 Nov, 18:00 New York)
const SIX = { id: 'six', nameEn: 'Melava Malka Siyum', nameHe: 'סיום מלווה מלכה', rule: { kind: 'gregorian', month: 11, day: 19 }, beginsAt: 'time', time: '18:00', zeroKey: 'here', eventEn: 'Main hall' };
const RUN = { id: 'run', nameEn: 'Mivtza Chanukah', nameHe: 'מבצע חנוכה', kind: 'countup', from: { kind: 'gregorian', month: 11, day: 1, year: 2026 }, total: 8, beginsAt: 'midnight', eventEn: 'Every day after Mincha',
  // the stored (normalised) shape the server sends: a one-time 8-day occasion from 1 Nov 2026
  rule: { kind: 'gregorian', month: 11, day: 1 }, repeat: 'once', year: 2026, days: 8 };
const ADV = (photo) => ({ ...YT, id: 'adv', advent: { on: true, photo, grid: '4x3', daily: { 7: { en: 'Learn one chapter of Tanya with a friend today.', he: 'ללמוד פרק תניא עם חבר', source: 'Hayom Yom, 19 Kislev', checked: true } } } });
// ── dates + why fixtures: the occasion INPUTS (the model derives `dates`, `why`, `forms`, `today` from them) ──
const WORDS_EN = 'A short line about why this day matters to us and why the whole yeshiva celebrates it together every single year without fail';
const WORDS_HE = 'משפט קצר על כך שהיום הזה חשוב לנו ועל כך שכל הישיבה חוגגת אותו יחד מדי שנה בלי יוצא מן הכלל ובשמחה גדולה מאוד של כולם';
const pad = (t, n) => { let o = t; while ([...o].length < n) o += ` ${t}`; return [...o].slice(0, n).join('').trim(); };
const WHY_S = { en: 'A short line about why this day matters to us.', he: 'משפט קצר על כך שהיום הזה חשוב לנו.', source: 'Sefer Sample, page 120' };
const WHY_L = { en: pad(WORDS_EN, 160), he: pad(WORDS_HE, 160), source: SRC };
const W = (o, w = WHY_S) => ({ ...o, explainShortEn: w.en, explainShortHe: w.he, source: w.source, explainChecked: true });
const RCw = W(RC); const YTw = W(YT); const CHw = W(CH);
const BIGw = W(BIG, WHY_L); const BIG_COw = (i) => W(BIG_CO(i), WHY_L);
// takeover only (the takeover result does not carry why / dates yet): injected on the page, see the header
const FX_TK = { six: { dates: { toGoLabel: { en: 'until it begins', he: 'עד שמתחיל' } }, why: { ...WHY_S } } };
const FX_TK_W = { six: { dates: { toGoLabel: { en: 'until it begins', he: 'עד שמתחיל' } }, why: { ...WHY_L } } };
const warn = (name, ok, info = '') => { if (ok) check(name, true); else { console.log(`WARN ${name} ${String(info).slice(0, 120)}`); } };
const doc = (occasions, settings = {}) => ({ version: 1, settings: { withinDays: 30, ...settings }, occasions });

// New York, 2026: Rosh Chodesh Kislev = 10-11 Nov (eve 9 Nov, shkia ~4:43 PM), Yud-Tes Kislev = 29 Nov (eve 28 Nov), Chanukah 5 Dec
const T = (s) => new Date(`${s}-05:00`);
const FONTS = ['Rubik', 'Frank Ruhl Libre', 'Suez One'];
const cases = [
  { tag: 'far (pinned, 27 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', big: 120, shot: 'land' },
  { tag: 'days (8 days)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), form: 'days', big: 150, fonts: true, tap: true, shot: 'port' },
  { tag: 'hours (last day)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', big: 150 },
  { tag: 'minutes (last hour)', time: T('2026-11-09T16:20:00'), occ: doc([RC, YT, CH]), form: 'minutes', big: 150, tick: true },
  { tag: 'zero (celebration)', time: T('2026-11-09T16:44:00'), occ: doc([RC, YT, CH], { takeover: false }), form: 'zero', zero: true, fonts: true },
  { tag: 'day itself, day 1 of 2', time: T('2026-11-10T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Day 1 of 2/i },
  { tag: 'day with event line', time: T('2026-11-29T12:00:00'), occ: doc([RC, YT, CH]), form: 'day', text: /Farbrengen 8 PM/ },
  { tag: 'worst case text, days', time: T('2026-11-03T11:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)], { comingUpCount: 3 }), form: 'days', explain: true, fonts: true },
  { tag: 'worst case text, day itself', time: T('2026-11-10T12:00:00'), occ: doc([BIG, BIG_CO(1), BIG_CO(2), BIG_CO(3)]), form: 'day', explain: true, fonts: true },
  { tag: 'worst case text, zero', time: T('2026-11-09T16:44:00'), occ: doc([BIG], { takeover: false }), form: 'zero', zero: true, fonts: true },
  { tag: 'explanation without a source stays hidden', time: T('2026-11-03T11:00:00'), occ: doc([{ ...BIG, source: '' }]), form: 'days', explain: false },
  { tag: 'Hebrew only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'hebrew' }), form: 'days', noLatinName: true },
  { tag: 'English only', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { language: 'english' }), form: 'days', noHebrewName: true },
  { tag: 'approximate time (no location, no zmanim)', time: T('2026-11-09T12:00:00'), occ: doc([RC, YT, CH]), form: 'hours', noLoc: true, approx: true },
  { tag: 'cycle (3 take turns)', time: T('2026-11-05T11:00:00'), occ: doc([RC, YT, CH], { pick: 'cycle', cycleCount: 3 }), form: 'days', pager: /1 \/ 3/ },
  { tag: 'nothing inside the window: slide out of the rotation', time: T('2026-11-01T11:00:00'), occ: doc([CH], { withinDays: 10 }), absent: true },
  // display types
  { tag: 'flip, days', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH], { display: 'flip' }), form: 'days', flip: 3, cells: 'dhm', fonts: true, shot: 'land' },
  { tag: 'flip, minutes (seconds cell)', time: T('2026-11-09T16:20:00'), occ: doc([RC, YT, CH], { display: 'flip' }), form: 'minutes', flip: 2 },
  { tag: 'flip, worst case text', time: T('2026-11-03T11:00:00'), occ: doc([BIG], { display: 'flip' }), form: 'days', flip: 2 },
  { tag: 'count-up, day 3 of 8', time: T('2026-11-03T12:00:00'), occ: doc([RUN]), form: 'day', run: true, text: /of 8/i, fonts: true },
  { tag: 'advent with a photo (+ step page, tiles open once)', time: T('2026-11-21T11:30:00'), occ: doc([ADV(WHITE)], { withinDays: 30 }), form: 'days', advent: 'photo', step: true, shot: 'land' },
  { tag: 'advent without a photo', time: T('2026-11-21T11:30:00'), occ: doc([ADV('')], { withinDays: 30 }), form: 'days', advent: 'grid', step: true },
  // photos: the scrim is measured from the picture: >= 4.5:1 for every line over white / black / mid-grey, dark + light theme
  { tag: 'photo white, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: WHITE, dim: 30 } }]), form: 'far', contrast: true },
  { tag: 'photo white, light theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: WHITE, dim: 30 } }]), form: 'far', contrast: true, theme: 'ivory' },
  { tag: 'photo black, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: BLACK, dim: 30 } }]), form: 'far', contrast: true },
  { tag: 'photo black, light theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: BLACK, dim: 30 } }]), form: 'far', contrast: true, theme: 'ivory' },
  { tag: 'photo grey, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: GREY, dim: 30 } }]), form: 'far', contrast: true },
  { tag: 'photo grey, light theme', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: GREY, dim: 30 } }]), form: 'far', contrast: true, theme: 'ivory' },
  { tag: 'photo dark red, dark theme: the photo shows', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YT, look: { photo: DARK, dim: 30 } }]), form: 'far', contrast: true, visible: true },
  { tag: 'all themes: small text reads at 4.5:1', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), form: 'days', themes: true },
  // takeovers (an exact 6 PM start)
  { tag: 'takeover: milestone (7 days)', time: T('2026-11-11T11:00:30'), occ: doc([SIX]), takeover: 'milestone', fonts: true, shot: 'land' },
  { tag: 'takeover: final minute', time: T('2026-11-18T17:59:20'), occ: doc([SIX]), takeover: 'final', tabular: true },
  { tag: 'takeover: zero', time: T('2026-11-18T18:00:20'), occ: doc([SIX]), takeover: 'zero', zero: true, fonts: true },
  { tag: 'takeover: worst case name, milestone', time: T('2026-11-11T11:00:30'), occ: doc([{ ...SIX, nameEn: LONG_EN, nameHe: LONG_HE }]), takeover: 'milestone', fonts: true },
  // live moments (admin fired; real time)
  { tag: 'moment: burst', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'burst', text: { en: '', he: '' }, occasionKey: 'yt', secs: 8 }, zero: true },
  { tag: 'moment: shout-out', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'shoutout', text: { en: 'Mazel tov to the 8th grade on finishing Mishnayos!', he: 'מזל טוב לכיתה ח׳ על סיום משניות!' }, occasionKey: '', secs: 15 } },
  { tag: 'moment: ten', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), moment: { kind: 'ten', text: { en: '', he: '' }, occasionKey: 'yt', secs: 10 }, ten: true },
];

const DW = { dates: true, why: true };
cases.push(
  // the date block, the why block, the label: every form, landscape + portrait (+ 4K on some)
  { tag: 'dates+why, far (pinned, 27 days)', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', big: 120, ...DW, shot: 'land', fonts: true },
  { tag: 'dates+why, days (8 days)', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw]), form: 'days', big: 150, ...DW, shot: 'port', fonts: true },
  { tag: 'dates+why, hours (last day)', time: T('2026-11-09T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'hours', big: 150, ...DW },
  { tag: 'dates+why, minutes (last hour)', time: T('2026-11-09T16:20:00'), occ: doc([RCw, YTw, CHw]), form: 'minutes', big: 150, ...DW },
  { tag: 'dates+why, day itself (hero)', time: T('2026-11-29T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'day', ...DW, hero: true, fonts: true },
  { tag: 'dates+why, flip (until it begins)', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { display: 'flip' }), form: 'days', flip: 3, ...DW },
  { tag: 'dates+why, multi-day range', time: T('2026-11-25T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'ch' }), form: 'days', ...DW, range: true, dayRe: /December 5/ },
  { tag: 'dates+why, no why (dates only)', time: T('2026-11-01T11:00:00'), occ: doc([RC, YT, CH]), form: 'days', dates: true, why: false },
  { tag: 'dates+why, why hidden by layout', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YTw, layout: { show: { why: false } } }, RC, CH], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', dates: true, why: false },
  { tag: 'dates+why, approximate time', time: T('2026-11-09T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'hours', noLoc: true, approx: true, dates: true },
  // languages (the data side filters; the page filters too)
  { tag: 'dates+why, English only', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { language: 'english' }), form: 'days', ...DW, lang: 'en' },
  { tag: 'dates+why, Hebrew only', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { language: 'hebrew' }), form: 'days', ...DW, lang: 'he' },
  // worst cases: 160 + 160 character why, range, 60-character names, long event line, full coming-up strip
  { tag: 'dates+why worst case, days', time: T('2026-11-03T11:00:00'), occ: doc([BIGw, BIG_COw(1), BIG_COw(2), BIG_COw(3)], { comingUpCount: 3 }), form: 'days', ...DW, fonts: true },
  { tag: 'dates+why worst case, far', time: T('2026-10-20T11:00:00'), occ: doc([BIGw, BIG_COw(1), BIG_COw(2), BIG_COw(3)], { comingUpCount: 3 }), form: 'far', ...DW },
  { tag: 'dates+why worst case, hours', time: T('2026-11-09T09:00:00'), occ: doc([BIGw, BIG_COw(1)], { comingUpCount: 3 }), form: 'hours', ...DW },
  { tag: 'dates+why worst case, day itself', time: T('2026-11-10T12:00:00'), occ: doc([BIGw, BIG_COw(1), BIG_COw(2), BIG_COw(3)]), form: 'day', ...DW, fonts: true },
  { tag: 'dates+why worst case, flip', time: T('2026-11-03T11:00:00'), occ: doc([BIGw], { display: 'flip' }), form: 'days', flip: 2, ...DW },
  { tag: 'dates+why worst case, vort page keeps the long text', time: T('2026-11-03T11:00:00'), occ: doc([BIGw]), form: 'days', explain: true, ...DW },
  // contrast of the new text: light + dark (every line at 4.5:1 over the panel), then every theme
  { tag: 'dates+why contrast, dark theme', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw]), form: 'days', ...DW, wcag: true },
  { tag: 'dates+why contrast, light theme', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw]), form: 'days', ...DW, wcag: true, theme: 'ivory' },
  { tag: 'dates+why contrast, day view, light theme', time: T('2026-11-29T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'day', ...DW, wcag: true, theme: 'ivory' },
  { tag: 'dates+why all themes: small text reads at 4.5:1', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw]), form: 'days', ...DW, themes: true },
  // the milestone takeover's quiet line
  { tag: 'takeover: milestone with why', time: T('2026-11-11T11:00:30'), occ: doc([SIX]), takeover: 'milestone', fx: FX_TK, whyTk: true, fonts: true, shot: 'land' },
  { tag: 'takeover: milestone with why, worst case', time: T('2026-11-11T11:00:30'), occ: doc([{ ...SIX, nameEn: LONG_EN, nameHe: LONG_HE }]), takeover: 'milestone', fx: FX_TK_W, whyTk: 'either', fonts: true },
);

cases.push(
  // cycled countdown forms (a tap on the number steps through row.forms; the last day / hour / zero keep their own display)
  { tag: 'forms: tap cycles days > 20¼ > hours > flip', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', formsSeq: ['days', 'daysFraction', 'hours', 'flip'], days: [27, 27.3], hoursRange: [648, 654], fonts: true, shot: 'land' },
  { tag: 'forms: all six (percent, sleeps)', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'yt', tapForms: ['days', 'daysFraction', 'hours', 'flip', 'percent', 'sleeps'] }), form: 'far', formsSeq: ['days', 'daysFraction', 'hours', 'flip', 'percent', 'sleeps'], days: [27, 27.3], hoursRange: [648, 654], sleeps: 27 },
  { tag: 'forms: in the days form (8 days)', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { tapForms: ['days', 'daysFraction', 'hours', 'sleeps'] }), form: 'days', formsSeq: ['days', 'daysFraction', 'hours', 'sleeps'], shot: 'port' },
  { tag: 'forms: auto mode steps by itself', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'yt', autoForms: { on: true, seconds: 8 } }), form: 'far', auto: true },
  { tag: 'forms: approximate time offers only days', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', noLoc: true, noForms: true },
  { tag: 'forms: the last day keeps its own display', time: T('2026-11-09T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'hours', noForms: true },
  { tag: 'forms: the last hour keeps its seconds', time: T('2026-11-09T16:20:00'), occ: doc([RCw, YTw, CHw]), form: 'minutes', noForms: true },
  // the Today strip in the header
  { tag: 'today strip', time: T('2026-11-01T11:00:00'), occ: doc([RCw, YTw, CHw]), form: 'days', todayStrip: true },
  { tag: 'today strip with the occasion that is today', time: T('2026-11-29T12:00:00'), occ: doc([RCw, YTw, CHw]), form: 'day', todayStrip: true, todayName: /Yud-Tes Kislev/ },
  { tag: 'today strip switched off in the layout', time: T('2026-11-01T11:00:00'), occ: doc([{ ...YTw, layout: { show: { today: false } } }, RC, CH], { pick: 'pinned', pinnedId: 'yt' }), form: 'far', todayStrip: false },
);

const PNG = {
  [WHITE]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#ffffff' } }).png().toBuffer(),
  [BLACK]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#000000' } }).png().toBuffer(),
  [GREY]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#808080' } }).png().toBuffer(),
  [DARK]: await sharp({ create: { width: 64, height: 36, channels: 3, background: '#5a1a1a' } }).png().toBuffer(),
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open({ canvas, time, occ, noLoc, font, theme, moment, seedAdvent, fx }) {
  const [W, H] = canvas === 'port' ? [900, 1600] : canvas === '4k' ? [3840, 2160] : [1600, 900];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  page error: ${String(e.message || e).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|stream/.test(m.text())) console.log(`  console error: ${m.text().slice(0, 300)}`); });
  await page.clock.setFixedTime(time);
  if (fx) await page.addInitScript((v) => { window.__OCC_FX = v; }, fx);
  if (seedAdvent) await page.addInitScript((list) => { try { if (!sessionStorage.getItem('aud-seeded')) { for (const s of list) localStorage.setItem(s.k, JSON.stringify(s.v)); sessionStorage.setItem('aud-seeded', '1'); } } catch {} }, seedAdvent);
  await page.route('**/uploads/*.png', (route) => {
    const p = new URL(route.request().url()).pathname;
    return PNG[p] ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG[p] }) : route.continue();
  });
  await page.route('**/api/state', async (route) => {
    const r = await route.fetch(); const j = await r.json();
    j.announcements = []; j.countdown = null; j.freeze = { active: null, emergency: true };
    j.slides = [{ id: 'occasion', type: 'OCCASION', enabled: true, duration: 600 }, { id: 'z', type: 'ZMANIM', enabled: true, duration: 600 }];
    j.occasions = occ;
    j.occasionMoment = moment ? { id: 'mtest', kind: moment.kind, text: moment.text, occasionKey: moment.occasionKey, startedAt: time.getTime(), until: time.getTime() + moment.secs * 1000 } : null;
    j.cache = { ...(j.cache || {}), zmanim: null, weather: null };
    j.settings = {
      ...j.settings, orientation: canvas === 'port' ? 'portrait' : 'landscape', themeAuto: { enabled: false }, theme: theme || 'midnight',
      fontRoles: { ...(j.settings?.fontRoles || {}), ...(font ? { hebrewDisplay: font, hebrewBody: font } : {}) },
      location: noLoc ? { timezone: 'America/New_York' } : { timezone: 'America/New_York', lat: 40.67, lon: -73.94 },
    };
    await route.fulfill({ response: r, json: j });
  });
  await page.route('**/stream', (route) => route.abort());
  await page.goto(BASE + '/screen', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  return { page, close: async () => { await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await ctx.close(); } };
}

const SEL = { slide: 'section.tt-panel[data-occ-form]', takeover: '[data-occ-takeover] section.tt-panel', moment: '[data-occ-moment] section.tt-panel' };

const probe = (page, sel) => page.evaluate((sel) => {
  const panel = document.querySelector(sel);
  const out = { panel: !!panel, form: panel?.getAttribute('data-occ-form') || null, view: panel?.getAttribute('data-occ-view') || null, overflow: [], small: [], big: 0, anims: [], text: panel ? panel.innerText : document.body.innerText.slice(0, 300), confetti: 0, fit: [], overlap: [] };
  out.anims = document.getAnimations().filter((a) => a.playState === 'running' && !a.effect?.target?.closest?.('#tt-splash')).map((a) => { const t = a.effect?.target; return `${a.animationName || a.transitionProperty || 'anim'}:${a.effect?.getComputedTiming?.().iterations}@${t?.tagName}.${String(t?.className || '').slice(0, 40)}`; });
  out.infinite = document.getAnimations().filter((a) => a.effect?.getComputedTiming?.().iterations === Infinity && !a.effect?.target?.closest?.('#tt-splash')).length;
  if (!panel) return out;
  const pb = panel.getBoundingClientRect();
  const scale = pb.width / panel.offsetWidth || 1;
  out.scale = scale;
  for (const el of panel.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[data-bd-confetti]') || el.closest('[aria-hidden]')) continue;
    const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    if (clips && el !== panel && el.clientWidth > 0 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2)) {
      out.overflow.push(`${el.tagName}[${(el.textContent || '').slice(0, 30)}] ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
    }
  }
  // auto-fitted boxes (vcenter Fit: the inner div) must fit their box: otherwise a line, a descender or nikud sticks out
  for (const el of panel.querySelectorAll('[data-occ-name] > div, .tt-bd-hero, .tt-bd-up, [data-occ-why-text]')) {
    const inner = el.firstElementChild;
    if (!inner || el.closest('[aria-hidden]') || !el.clientHeight) continue;
    if (inner.offsetHeight > el.clientHeight + 3 || inner.scrollWidth > el.clientWidth + 2) out.fit.push(`"${el.textContent.slice(0, 24)}" ${inner.scrollWidth}x${inner.offsetHeight}>${el.clientWidth}x${el.clientHeight}`);
  }
  const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  const rects = [];
  while (tw.nextNode()) {
    const t = tw.currentNode; if (!t.textContent.trim()) continue;
    const el = t.parentElement; const cs = getComputedStyle(el);
    if (el.closest('[aria-hidden]') || cs.visibility === 'hidden') continue;
    // big numerals: the element's box (the range box adds the font's whole ascent/descent, far above the digits)
    const range = document.createRange(); range.selectNodeContents(t);
    const b = el.closest('[data-occ-big]') ? el.closest('[data-occ-big]').getBoundingClientRect() : range.getBoundingClientRect(); if (!b.width) continue;
    if (b.right > pb.right + 1 || b.left < pb.left - 1 || b.bottom > pb.bottom + 1 || b.top < pb.top - 1) out.overflow.push(`outside the panel: "${t.textContent.trim().slice(0, 24)}"`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 24) out.small.push(`${fs}px "${t.textContent.trim().slice(0, 20)}"`);
    rects.push({ b, s: t.textContent.trim().slice(0, 18), blk: el.closest('[data-occ-name],[data-occ-date],[data-occ-begins],[data-occ-why],[data-occ-today],[data-occ-event],[data-occ-count],[data-occ-coming],[data-occ-tagline],header,[data-occ-card],[data-occ-step]') });
  }
  // text of different blocks never overlaps (a too-tall line box from a display font would)
  const tol = 3 * scale;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i]; const B = rects[j];
    if (!A.blk || !B.blk || A.blk === B.blk || A.blk.contains(B.blk) || B.blk.contains(A.blk)) continue;
    const ox = Math.min(A.b.right, B.b.right) - Math.max(A.b.left, B.b.left);
    const oy = Math.min(A.b.bottom, B.b.bottom) - Math.max(A.b.top, B.b.top);
    if (ox > tol && oy > tol * 3) out.overlap.push(`"${A.s}" x "${B.s}"`);
  }
  const nums = [...panel.querySelectorAll('[data-occ-count] [data-occ-big]')].map((n) => parseFloat(getComputedStyle(n).fontSize));
  out.big = nums.length ? Math.max(...nums) : 0;
  out.bigW = panel.querySelector('[data-occ-count] [data-occ-big]')?.offsetWidth || 0;
  out.bigText = panel.querySelector('[data-occ-count] [data-occ-big]')?.textContent || '';
  out.confetti = panel.querySelectorAll('.tt-bd-f').length;
  out.explain = !!panel.querySelector('[data-occ-explain]');
  out.source = panel.querySelector('[data-occ-source]')?.textContent || '';
  out.flip = panel.querySelectorAll('[data-occ-cell]').length;
  out.cells = [...panel.querySelectorAll('[data-occ-cell]')].map((c) => c.getAttribute('data-occ-cell')).join('');
  out.advent = panel.querySelector('[data-occ-advent]')?.getAttribute('data-occ-advent') || null;
  out.tilesOpen = panel.querySelectorAll('[data-occ-tile=open]').length;
  out.fading = panel.querySelectorAll('.tt-adv-open').length;
  out.step = !!panel.querySelector('[data-occ-step]');
  out.run = !!panel.querySelector('[data-occ-count=run]');
  const topOf = (q) => { const e = panel.querySelector(q); return e ? e.getBoundingClientRect().top : null; };
  out.tops = { date: topOf('[data-occ-date]'), begins: topOf('[data-occ-begins]'), why: topOf('[data-occ-why]'), event: topOf('[data-occ-event]') };
  out.formId = panel.querySelector('[data-occ-formid]')?.getAttribute('data-occ-formid') || '';
  out.dots = Number(panel.querySelector('[data-occ-dots]')?.getAttribute('data-occ-dots') || 0);
  out.dotOn = [...panel.querySelectorAll('[data-occ-dot]')].findIndex((d) => d.getAttribute('data-occ-dot') === 'on');
  out.suffix = panel.querySelector('[data-occ-suffix]')?.textContent || '';
  out.suffixFont = panel.querySelector('[data-occ-suffix]') ? getComputedStyle(panel.querySelector('[data-occ-suffix]')).fontFamily : '';
  out.bigFont = panel.querySelector('[data-occ-count] [data-occ-big]') ? getComputedStyle(panel.querySelector('[data-occ-count] [data-occ-big]')).fontFamily : '';
  out.progressBar = !!panel.querySelector('[data-occ-count] [data-occ-progress]');
  out.todayEl = !!panel.querySelector('[data-occ-today]');
  out.todayText = panel.querySelector('[data-occ-today]')?.innerText || '';
  out.todayName = panel.querySelector('[data-occ-today-name]')?.innerText || '';
  out.whyEl = !!panel.querySelector('[data-occ-why]');
  out.whyText = panel.querySelector('[data-occ-why-text]')?.textContent || '';
  out.whyFs = panel.querySelector('[data-occ-why-text]') ? parseFloat(getComputedStyle(panel.querySelector('[data-occ-why-text]')).fontSize) : 0;
  out.whySrc = panel.querySelector('[data-occ-why-source]')?.textContent || '';
  out.dateBlock = panel.querySelector('[data-occ-date]')?.innerText || '';
  out.beginsBlock = panel.querySelector('[data-occ-begins]')?.innerText || '';
  out.unit = panel.querySelector('[data-occ-count] [data-occ-unit]')?.innerText || '';
  out.whyBox = (() => { const e = panel.querySelector('[data-occ-why]'); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; })();
  out.display = panel.getAttribute('data-occ-display');
  return out;
}, sel);

/** Mean colour of the panel's pixels with the text hidden (is the photo really there?). */
async function panelMean(page) {
  const box = await page.evaluate(() => {
    const st = document.createElement('style'); st.id = 'aud-hide'; st.textContent = 'section.tt-panel *{color:transparent!important}'; document.head.appendChild(st);
    const b = document.querySelector('section.tt-panel[data-occ-form]').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height };
  });
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ clip: { x: box.x + 20, y: box.y + 20, width: box.w - 40, height: box.h - 40 } });
  await page.evaluate(() => document.getElementById('aud-hide')?.remove());
  const st = await sharp(buf).stats();
  return st.channels.slice(0, 3).map((c) => c.mean);
}

/** WCAG contrast of every text element against what is really painted behind it (text hidden, screenshot sampled). */
async function contrast(page, needAll = 0) {
  const items = await page.evaluate(() => {
    const panel = document.querySelector('section.tt-panel[data-occ-form]');
    const out = [];
    const tw = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode; if (!t.textContent.trim()) continue;
      const el = t.parentElement; if (el.closest('[aria-hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      const r = document.createRange(); r.selectNodeContents(t); const b = r.getBoundingClientRect();
      if (!b.width) continue;
      out.push({ s: t.textContent.trim().slice(0, 16), c: getComputedStyle(el).color, fs: parseFloat(getComputedStyle(el).fontSize), x: b.left, y: b.top, w: b.width, h: b.height });
    }
    const st = document.createElement('style'); st.id = 'aud-hide'; st.textContent = 'section.tt-panel *{color:transparent!important;text-shadow:none!important}'; document.head.appendChild(st);
    return out;
  });
  await page.waitForTimeout(400);
  const buf = await page.screenshot();
  await page.evaluate(() => document.getElementById('aud-hide')?.remove());
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (Math.min(info.height - 1, Math.max(0, Math.round(y))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x)))) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = (c) => {
    let m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
    m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
    if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
    return null;
  };
  let worst = { ratio: 99 };
  for (const it of items) {
    const col = parse(it.c); if (!col) continue;
    // the background behind the line: the median of 7 samples across it (one stray pixel - a tick, an edge - is not 'behind')
    const smp = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map((fx) => px(it.x + it.w * fx, it.y + it.h * 0.5)).sort((p, q) => lum(p) - lum(q));
    for (const bg of [smp[3]]) {
      const fg = [0, 1, 2].map((k) => col[k] * col[3] + bg[k] * (1 - col[3]));
      const L1 = lum(fg); const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const need = needAll || (it.fs >= 32 ? 3 : 4.5);
      if (ratio / need < (worst.ratio / (worst.need || 1))) worst = { ratio, need, s: it.s, fs: it.fs, score: ratio / need, bg: bg.join(','), fg: col.map((v) => Math.round(v * 100) / 100).join(',') };
    }
  }
  return worst;
}

let shots = 0;
const shot = async (page, name) => {
  if (!SHOTS || shots >= 6) return;
  shots++;
  await page.evaluate(() => document.getElementById('tt-splash')?.remove());
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`shot ${SHOTS}/${name}.png`);
};

const HEB = /[\u0590-\u05FF]/;
/** The dates + why checks for one rendered page. */
async function datesChecks(tag, c, r, canvas) {
  const evening = /evening/i;
  if (c.dates) {
    const day = c.form === 'day' || c.form === 'far' || c.form === 'days' || c.form === 'hours' || c.form === 'minutes';
    check(`${tag}: THE DAY is written out ('Sunday, November 29') with its Hebrew date`, !day || (c.lang === 'he' ? /כסלו/.test(r.dateBlock) : (c.dayRe || /Sunday, November 29/).test(r.dateBlock) && (c.dayRe || /19 Kislev 5787/.test(r.dateBlock))), r.dateBlock.slice(0, 120));
    if (c.form !== 'day') {
      check(`${tag}: 'Begins Saturday evening' label + the zman`, c.lang === 'he' || (/begins saturday evening/i.test(r.beginsBlock) && (c.approx || /Shkia 4:30 PM/.test(r.beginsBlock))), r.beginsBlock.slice(0, 120));
    }
    if (c.form === 'far' || c.form === 'days') {
      check(`${tag}: the day count reads 'DAYS UNTIL IT BEGINS' (${r.unit.replace(/\s+/g, ' ')})`, c.lang === 'he' ? HEB.test(r.unit) : /until it begins/i.test(r.unit) && (c.flip || /days?/i.test(r.unit)), r.unit);
      check(`${tag}: the day count never reads 'days to go' next to an evening start`, !/days?\s+to go/i.test(r.unit) && !/days?\s+to go/i.test(r.text), r.unit);
    }
    if (c.flip) check(`${tag}: flip: 'until it begins' under the cells`, /until it begins/i.test(r.unit), r.unit);
    if (c.range) check(`${tag}: the multi-day range shows`, /Dec 5.*Dec 12/.test(r.dateBlock), r.dateBlock.slice(0, 120));
    if (c.approx) check(`${tag}: approximate: the '~' stays`, /~/.test(r.text) && /approximate/i.test(r.text), r.text.slice(0, 160));
    // vertical order: date > begins > why > event
    const t = r.tops; const seq = ['date', 'begins', 'why', 'event'].filter((k) => t[k] != null);
    // the day view puts the why under the name as its hero line: why > date > event there
    const want = c.form === 'day' ? ['why', 'date', 'event'] : ['date', 'begins', 'why', 'event'];
    const sq = want.filter((k) => t[k] != null);
    check(`${tag}: order ${want.join(' > ')} (${sq.join(' > ')})`, sq.every((k, i) => i === 0 || t[sq[i - 1]] <= t[k] + 1) || r.view !== 'main', JSON.stringify(t));
  }
  if (c.why === true) {
    check(`${tag}: the why block shows ('Why we celebrate' + text)`, r.whyEl && /why we celebrate/i.test(r.text) && r.whyText.length > 10, `${r.whyEl} ${r.whyText.slice(0, 40)}`);
    check(`${tag}: why text >= 28 canvas px (${(r.whyFs / (r.scale || 1)).toFixed(1)})`, r.whyFs / (r.scale || 1) >= 27.5, String(r.whyFs));
    if (c.form === 'day') check(`${tag}: day view: the why line is the hero (>= 30 px, ${(r.whyFs / (r.scale || 1)).toFixed(0)})`, r.whyFs / (r.scale || 1) >= 29.5, String(r.whyFs));
    if (c.lang === 'en') check(`${tag}: English only: no Hebrew in the date / why blocks`, !HEB.test(r.dateBlock) && !HEB.test(r.whyText) && !HEB.test(r.beginsBlock), `${r.dateBlock} | ${r.whyText.slice(0, 30)}`);
    if (c.lang === 'he') check(`${tag}: Hebrew only: no English in the date / why text`, !/[A-Za-z]{4}/.test(r.whyText) && !/Sunday|Kislev/.test(r.dateBlock), `${r.dateBlock} | ${r.whyText.slice(0, 30)}`);
    // the source line is the first to go when crowded; when it shows it is the real one; the why text itself never goes
    check(`${tag}: source line is either whole or dropped (never cut) '${r.whySrc.slice(0, 40)}'`, r.whySrc === '' || /^SOURCE: |^Source: /i.test(r.whySrc), r.whySrc);
    if (/worst case/.test(c.tag)) check(`${tag}: worst case: the 160-character why text is whole on the page`, r.whyText.includes('A short line about why') || HEB.test(r.whyText), r.whyText.slice(0, 40));
  }
  if (c.why === false) check(`${tag}: no why block`, !r.whyEl && !/why we celebrate/i.test(r.text), r.whyText.slice(0, 40));
  if (c.explain === true) check(`${tag}: the short why is not the vort text`, !r.text.includes('A long explanation sentence'), '');
}

/** Cycled forms: dots, a tap steps through each form, every form renders clean, 20¼ never promises more than is left, auto mode. */
async function formsChecks(page, tag, c, r) {
  await page.evaluate(() => document.getElementById('tt-splash')?.remove());
  const probeNow = () => probe(page, SEL.slide);
  if (c.noForms) { check(`${tag}: no form dots (nothing to cycle)`, r.dots === 0 && r.formId === '', `${r.dots} ${r.formId}`); return; }
  if (c.auto) {
    check(`${tag}: starts on the first form`, r.formId === 'days' && r.dots >= 2, `${r.formId} ${r.dots}`);
    await page.waitForTimeout(9000);
    const a = await probeNow();
    check(`${tag}: auto mode moved on by itself (${r.formId} > ${a.formId})`, a.formId !== 'days' && a.dotOn === 1, `${a.formId} ${a.dotOn}`);
    await page.waitForTimeout(8300);
    const b = await probeNow();
    check(`${tag}: ...and again (${b.formId})`, b.formId !== a.formId, `${a.formId} ${b.formId}`);
    return;
  }
  const seq = c.formsSeq;
  check(`${tag}: ${seq.length} form dots, the first form is '${seq[0]}'`, r.dots === seq.length && r.formId === seq[0] && r.dotOn === 0, `${r.dots} ${r.formId} ${r.dotOn}`);
  for (let i = 1; i <= seq.length; i++) {
    await page.locator(`${SEL.slide} [data-occ-forms] [data-occ-count]`).first().click();
    await page.waitForTimeout(750);
    const p = await probeNow();
    const want = seq[i % seq.length];
    const t = `${tag} [tap ${i} > ${want}]`;
    check(`${t}: the form is '${want}'`, p.formId === want && p.dotOn === i % seq.length, `${p.formId} ${p.dotOn}`);
    check(`${t}: nothing clips or leaves the panel`, p.overflow.length === 0, p.overflow.slice(0, 3).join(' | '));
    check(`${t}: fitted lines fit, no overlap`, p.fit.length === 0 && p.overlap.length === 0, [...p.fit, ...p.overlap].slice(0, 3).join(' | '));
    check(`${t}: text >= 24 canvas px`, p.small.every((x) => parseFloat(x) / (p.scale || 1) >= 23.5), p.small.slice(0, 3).join(', '));
    check(`${t}: nothing animating once it has settled`, p.anims.length === 0 && p.infinite === 0, p.anims.slice(0, 3).join(','));
    const n = Number(String(p.bigText).replace(/[^\d]/g, ''));
    if (want === 'days') check(`${t}: whole days = the calendar days`, c.days ? n === c.days[0] : true, p.bigText);
    if (want === 'daysFraction') {
      const frac = { '': 0, '\u00BC': 0.25, '\u00BD': 0.5, '\u00BE': 0.75 }[p.suffix];
      check(`${t}: a quarter glyph or none ('${p.bigText}')`, frac !== undefined, p.suffix);
      check(`${t}: the glyph is set in the numerals font`, !p.suffix || p.suffixFont === p.bigFont, `${p.suffixFont} | ${p.bigFont}`);
      if (c.days) check(`${t}: never promises more time than is left (${n + frac} <= ${c.days[1]})`, n + (frac || 0) <= c.days[1] && n + (frac || 0) >= c.days[0] - 0.01, `${n} ${p.suffix}`);
    }
    if (want === 'hours' && c.hoursRange) check(`${t}: total hours (${p.bigText}) inside ${c.hoursRange}`, n >= c.hoursRange[0] && n <= c.hoursRange[1] && /^\d+$/.test(p.bigText), p.bigText);
    if (want === 'hours') check(`${t}: labelled hours`, /hours?/i.test(p.text), p.text.slice(0, 120));
    if (want === 'flip') check(`${t}: flip cells (${p.cells})`, p.flip >= 3, p.cells);
    if (want === 'percent') check(`${t}: a percent (${p.bigText}%) with a hairline bar`, n >= 0 && n <= 99 && p.suffix === '%' && p.progressBar, `${p.bigText} ${p.suffix} ${p.progressBar}`);
    if (want === 'sleeps') check(`${t}: N sleeps (${p.bigText})`, (!c.sleeps || n === c.sleeps) && /sleeps?/i.test(p.text) && /לילות|לילה/.test(p.text), p.text.slice(0, 140));
  }
}

/** The milestone takeover's quiet why line: there, with its source, or (crowded) dropped cleanly: never clipped. */
function takeoverWhyChecks(tag, c, r) {
  if (c.whyTk === true) warn(`${tag}: the quiet 'why we celebrate' line shows (needs takeoverFor() to carry why)`, r.whyEl && /why we celebrate/i.test(r.text), `${r.whyEl}`);
  if (c.whyTk === 'either') check(`${tag}: worst case: the why line is whole or dropped (${r.whyEl ? 'shown' : 'dropped'})`, !r.whyEl || r.whyText.length > 100, r.whyText.slice(0, 30));
  warn(`${tag}: milestone: 'until it begins' under the number (needs takeoverFor() to carry dates)`, /until it begins/i.test(r.text) && !/days? to go/i.test(r.text), r.text.replace(/\s+/g, ' ').slice(0, 100));
  if (r.whyEl) check(`${tag}: the why line is >= 28 px`, r.whyFs / (r.scale || 1) >= 27.5, String(r.whyFs));
}

async function run(canvas, c, font) {
  const tag = `${canvas}${font ? ` [${font}]` : ''} ${c.tag}`;
  const sel = c.takeover ? SEL.takeover : c.moment ? SEL.moment : SEL.slide;
  // advent: pretend yesterday this screen saw every tile still shut, so today's open tiles fade once
  const seedAdvent = c.advent ? ['2026-11-28', '2026-11-29'].map((d) => ({ k: `tt-adv:adv|${d}`, v: { day: 99, prev: null, now: '000000000000' } })) : null;
  const { page, close } = await open({ canvas, time: c.time, occ: c.occ, noLoc: c.noLoc, font, theme: c.theme, moment: c.moment, seedAdvent, fx: c.fx });
  try {
    let r = await probe(page, sel);
    if (c.absent) { check(`${tag}: the Countdown is not shown`, r.form === null, r.text.slice(0, 80)); return; }
    if (c.takeover) check(`${tag}: takeover '${c.takeover}' shows`, r.panel && r.form === c.takeover, `${r.form} ${r.text.slice(0, 80)}`);
    else if (c.moment) check(`${tag}: moment overlay shows`, r.panel, r.text.slice(0, 80));
    else check(`${tag}: page renders in the '${c.form}' form`, r.panel && r.form === c.form, `${r.form} ${r.text.slice(0, 80)}`);
    if (c.advent) {
      check(`${tag}: advent grid (${c.advent})`, r.advent === c.advent && r.tilesOpen > 0 && r.tilesOpen < 12, `${r.advent} open ${r.tilesOpen}`);
      check(`${tag}: tiles opened today fade once`, r.fading > 0, String(r.fading));
    }
    if (c.zero || c.advent || c.ten || c.takeover) {
      if (c.zero) check(`${tag}: confetti falls`, r.confetti > 0 || !r.anims.length, String(r.confetti));
      if (c.ten) {
        const a = r.bigText;
        await page.clock.setFixedTime(new Date(c.time.getTime() + 3000)); await page.waitForTimeout(1300);
        const b = (await probe(page, sel)).bigText;
        check(`${tag}: counts down each second (${a} -> ${b})`, Number(a) - Number(b) === 3, `${a} ${b}`);
        await page.clock.setFixedTime(new Date(c.time.getTime() + 10500)); await page.waitForTimeout(1300);
        const z = await probe(page, sel);
        check(`${tag}: ends in a burst`, z.panel && z.confetti > 0, `${z.panel} ${z.confetti}`);
        await page.clock.setFixedTime(new Date(c.time.getTime() + 14500)); await page.waitForTimeout(1300);
        const gone = await page.evaluate(() => !document.querySelector('[data-occ-moment]'));
        check(`${tag}: gone after its end + the burst`, gone);
        return;
      }
      if (c.tabular) {
        const a = r; await page.clock.setFixedTime(new Date(c.time.getTime() + 1000)); await page.waitForTimeout(1300);
        const b = await probe(page, sel);
        check(`${tag}: M:SS ticks (${a.bigText} -> ${b.bigText})`, /^\d:\d\d$/.test(b.bigText) && a.bigText !== b.bigText, `${a.bigText} ${b.bigText}`);
        check(`${tag}: tabular figures (same width each second)`, Math.abs(a.bigW - b.bigW) <= 1, `${a.bigW} ${b.bigW}`);
      }
      await page.waitForTimeout(c.zero ? 6500 : 2600);
      r = await probe(page, sel);
    }
    check(`${tag}: nothing clips or leaves the panel`, r.overflow.length === 0, r.overflow.slice(0, 3).join(' | '));
    check(`${tag}: fitted lines fit their box`, r.fit.length === 0, r.fit.slice(0, 3).join(' | '));
    check(`${tag}: no text blocks overlap`, r.overlap.length === 0, r.overlap.slice(0, 3).join(' | '));
    check(`${tag}: text >= 24 canvas px`, r.small.every((s) => parseFloat(s) / (r.scale || 1) >= 23.5), r.small.slice(0, 4).join(', '));
    if (c.big) check(`${tag}: countdown numerals >= ${c.big} canvas px`, r.big >= c.big - 1, `${r.big} (scale ${r.scale})`); // computed font-size is layout (canvas) px
    check(`${tag}: nothing animating after the page settled`, r.anims.length === 0 && r.infinite === 0, r.anims.slice(0, 3).join(','));
    if (c.flip) check(`${tag}: flip cells (${r.cells})`, r.display === 'flip' && r.flip >= c.flip, `${r.display} ${r.cells}`);
    if (c.flip && c.form === 'minutes') check(`${tag}: seconds cell while ticking each second`, r.cells.includes('s'), r.cells);
    if (c.run) check(`${tag}: count-up view`, r.run, r.text.slice(0, 80));
    if (c.fx && !c.takeover) await datesChecks(tag, c, r, canvas);
    if (c.fx && c.takeover) takeoverWhyChecks(tag, c, r);
    if (c.formsSeq || c.auto || c.noForms) await formsChecks(page, tag, c, r);
    if (c.todayStrip === true) {
      check(`${tag}: the Today strip shows (TODAY + weekday + Hebrew date)`, r.todayEl && /today/i.test(r.todayText) && /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Shabbos)/i.test(r.todayText) && /\d/.test(r.todayText), r.todayText);
      if (c.todayName) check(`${tag}: the occasion that is today is named in it`, c.todayName.test(r.todayName), r.todayName);
    }
    if (c.todayStrip === false) check(`${tag}: no Today strip`, !r.todayEl);
    if (c.text) check(`${tag}: shows ${c.text}`, c.text.test(r.text), r.text.slice(0, 120));
    if (c.pager) check(`${tag}: pager ${c.pager}`, c.pager.test(r.text), r.text.slice(0, 80));
    if (c.approx) check(`${tag}: approximate time says ~`, /~/.test(r.text) && /approximate/i.test(r.text), r.text.slice(0, 160));
    if (c.noLatinName) check(`${tag}: no English name`, !/Rosh Chodesh Kislev/.test(r.text) && /ראש חודש כסלו/.test(r.text), r.text.slice(0, 80));
    if (c.noHebrewName) check(`${tag}: no Hebrew name`, !/ראש חודש/.test(r.text) && /Rosh Chodesh Kislev/.test(r.text), r.text.slice(0, 80));
    if (c.explain === false) check(`${tag}: explanation hidden without a source`, !r.explain);
    if (c.tick) {
      const a = r.bigText;
      check(`${tag}: shows M:SS`, /^\d{1,2}:\d\d$/.test(a), a);
    }
    if (c.wcag) {
      const w = await contrast(page, 4.5);
      check(`${tag}: every line incl. the new text reads at 4.5:1 (worst ${w.ratio?.toFixed(2)} at ${w.fs}px "${w.s}")`, w.ratio >= 4.5, `${w.bg} ${w.fg}`);
    }
    if (c.contrast) {
      // the scrim is measured from the photo: wait for it, then every line (numerals included) must read at 4.5:1
      await page.waitForFunction(() => document.querySelector('[data-occ-scrim=measured]'), null, { timeout: 5000 }).catch(() => {});
      const sc = await page.evaluate(() => { const e = document.querySelector('[data-occ-scrim]'); return e ? `${e.getAttribute('data-occ-scrim')} ${e.getAttribute('data-occ-alpha')}` : 'none'; });
      check(`${tag}: scrim measured from the photo (${sc})`, /^measured/.test(sc), sc);
      const w = await contrast(page, 4.5);
      check(`${tag}: every line reads at 4.5:1 on the photo (worst ${w.ratio?.toFixed(2)} at ${w.fs}px "${w.s}"; bg ${w.bg} fg ${w.fg})`, w.ratio >= 4.5, '');
      if (c.visible) {
        const a = await panelMean(page);
        const plain = await open({ canvas, time: c.time, occ: { ...c.occ, occasions: c.occ.occasions.map((o) => ({ ...o, look: { ...o.look, photo: '' } })) }, theme: c.theme });
        const b = await panelMean(plain.page); await plain.close();
        const diff = Math.max(...a.map((v, k) => Math.abs(v - b[k])));
        check(`${tag}: the photo is clearly visible (mean ${a.map(Math.round)} vs plain ${b.map(Math.round)}, diff ${diff.toFixed(0)})`, diff >= 15, '');
      }
    }
    if (c.themes && !font) {
      // every registered theme: the page's small text (< 32 px) at 4.5:1, larger at 3:1 (accent text is pulled toward the ink)
      const bad = [];
      for (const th of THEME_IDS) {
        const o = await open({ canvas, time: c.time, occ: c.occ, theme: th, fx: c.fx });
        await o.page.waitForTimeout(500);
        const w = await contrast(o.page); await o.close();
        if (w.score < 1) bad.push(`${th}: ${w.ratio.toFixed(2)} at ${w.fs}px "${w.s}"`);
      }
      check(`${tag}: ${THEME_IDS.length} themes`, bad.length === 0, bad.slice(0, 5).join(' | '));
    }
    if (c.cells) check(`${tag}: flip shows ${c.cells} (every unit at once from the exact begin time)`, r.cells.startsWith(c.cells), r.cells);
    if (c.shot && c.shot === canvas && !font) await shot(page, `occasion-${canvas}-${c.tag.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}`);
    if (c.tap && !font) {
      await page.evaluate(() => document.getElementById('tt-splash')?.remove());
      const box = await page.locator(SEL.slide).boundingBox();
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await page.waitForTimeout(120);
      const p = await page.evaluate(() => document.querySelectorAll('[data-occ-pop] .tt-pop').length);
      check(`${tag}: a tap pops (finite)`, p > 0, String(p));
      await page.waitForTimeout(1300);
      const after = await probe(page, sel);
      check(`${tag}: the pop is gone, nothing running`, after.anims.length === 0 && !(await page.evaluate(() => document.querySelector('[data-occ-pop]'))), after.anims.join(','));
    }
    if (c.explain === true || c.step) {
      // the countdown page first, then the sourced explanation / today's step on its own page
      check(`${tag}: countdown page first`, !r.explain && r.view === 'main', r.view);
      await page.clock.setFixedTime(new Date(c.time.getTime() + 15000));
      await page.waitForTimeout(10600);
      const v = await probe(page, SEL.slide);
      if (c.step) check(`${tag}: today's step page + source`, v.view === 'step' && v.step && /Hayom Yom/.test(v.source), `${v.view} ${v.source.slice(0, 40)}`);
      else check(`${tag}: vort page: explanation + source shown`, v.view === 'vort' && v.explain && /Source: Sefer Sample/i.test(v.source), `${v.view} ${v.source.slice(0, 40)}`);
      check(`${tag}: second page: nothing clips or leaves the panel`, v.overflow.length === 0, v.overflow.slice(0, 3).join(' | '));
      check(`${tag}: second page: no overlap, fits`, v.overlap.length === 0 && v.fit.length === 0, [...v.overlap, ...v.fit].slice(0, 3).join(' | '));
      check(`${tag}: second page: text >= 24 canvas px`, v.small.every((x) => parseFloat(x) / (v.scale || 1) >= 23.5), v.small.slice(0, 4).join(', '));
      check(`${tag}: second page: nothing animating`, v.anims.length === 0, v.anims.slice(0, 3).join(','));
    }
  } finally { await close(); }
}

const FOURK = ['dates+why, days (8 days)', 'dates+why worst case, days', 'takeover: milestone with why', 'days (8 days)', 'minutes (last hour)', 'worst case text, days', 'zero (celebration)', 'flip, days', 'takeover: milestone (7 days)', 'advent with a photo (+ step page, tiles open once)'];
for (const canvas of ['land', 'port', '4k']) {
  for (const c of cases) {
    if (ONLY && !c.tag.includes(ONLY)) continue;
    if (canvas === '4k' && !FOURK.includes(c.tag)) continue;
    if (QUICK && canvas === '4k') continue;
    await run(canvas, c, null);
    if (c.fonts && canvas !== '4k' && !QUICK) for (const f of FONTS.slice(1)) await run(canvas, c, f);
  }
}
await browser.close();
console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log('FAILED:\n' + fails.join('\n')); process.exit(1); }
