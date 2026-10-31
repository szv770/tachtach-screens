/**
 * Shiurim slide fit model (pure, so it can be tested at the extremes without a browser; same idea as menuPages.js).
 *
 * Today list: text starts at the first tier and shrinks (all rows together) to the floor, the photo column drops at the last
 * tier, and if the rows still do not fit, fewer rows go on a page (the rest follow on the next page). Nothing is ever cut.
 * Week cards: text tier, then fewer lines per card (a long card continues on the next one), then fewer cards across.
 */

/** Row text sizes in canvas px (time / title / rebbe name / place / photo). Floors: time 40, title 32, name 28, place 26 (spec 4.1). */
export const ROW_TIERS = Object.freeze([
  { time: 48, title: 40, name: 34, place: 30, photo: 72 },
  { time: 44, title: 36, name: 31, place: 28, photo: 64 },
  { time: 40, title: 32, name: 28, place: 26, photo: 0 },
]);
export const PAGE_SECONDS = 9;
export const WEEK_SECONDS = 9;
export const MIN_SECONDS = 12;

export const startRowFit = (n) => ({ tier: 0, per: Math.max(1, n) });
/** The step after 'this does not fit'; null = nothing left (one row a page at the floor always fits). */
export function nextRowFit(s) {
  if (s.tier < ROW_TIERS.length - 1) return { ...s, tier: s.tier + 1 };
  if (s.per > 1) return { tier: 0, per: Math.max(1, s.per - Math.max(1, Math.floor(s.per / 4))) };
  return null;
}
/** Balanced pages: 7 rows at 4 a page = 4 + 3, not 4 + 3 + ... */
export function planRows(rows, per) {
  const list = rows || [];
  if (!list.length) return [];
  const n = Math.ceil(list.length / Math.max(1, per));
  const size = Math.ceil(list.length / n);
  const pages = [];
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size));
  return pages;
}

/** Week cards. */
export const CARD_TIERS = Object.freeze([
  { line: 30, name: 44, photo: 140 },
  { line: 28, name: 38, photo: 100 },
  { line: 26, name: 34, photo: 0 },
]);
export const MAX_LINES = Object.freeze([5, 4, 3, 2, 1]);
export const COLS = Object.freeze({ landscape: 3, portrait: 2 });
export const startCardFit = (portrait) => ({ tier: 0, lines: 0, cols: portrait ? COLS.portrait : COLS.landscape });
export function nextCardFit(s) {
  if (s.tier < CARD_TIERS.length - 1) return { ...s, tier: s.tier + 1 };
  if (s.lines < MAX_LINES.length - 1) return { tier: 0, lines: s.lines + 1, cols: s.cols };
  if (s.cols > 1) return { tier: 0, lines: 0, cols: s.cols - 1 };
  return null;
}
/** Split cards with more lines than allowed into continuation cards, then page them `cols` at a time. */
export function planCards(cards, fit) {
  const max = MAX_LINES[fit.lines];
  const flat = [];
  for (const c of cards || []) {
    const n = Math.max(1, Math.ceil(c.lines.length / max));
    const per = Math.ceil(c.lines.length / n);
    for (let i = 0; i < n; i++) flat.push({ ...c, lines: c.lines.slice(i * per, (i + 1) * per), part: i + 1, parts: n });
  }
  return planRows(flat, fit.cols);
}

/** Guest cards: one or two on a page. */
export const GUEST_PER_PAGE = 2;
export const GUEST_SECONDS = 12;
export const guestPages = (list) => planRows(list, GUEST_PER_PAGE);

// ── card models for the week pages (pure: the slide only draws them) ───────────

import { pickLang, fmt12, personName, dayRangeLabel } from './shiurim.js';
import { DAY_EN_SHORT, DAY_HE_SHORT, DAY_EN, DAY_HE } from './shiurimCopy.js';

/** By rebbe: one card per person, one line per set of days with the same time. */
export function cardsFromRebbe(list, lang = 'both') {
  return (list || []).map((g, gi) => ({
    key: `p${g.person?.id || gi}`, person: g.person || null, head: null, today: false,
    lines: g.lines.map((l, i) => {
      const [t1, t2] = pickLang(l.title, l.titleHe, lang);
      const [m1, m2] = pickLang(l.place, l.placeHe, lang);
      return {
        key: `l${i}`, lead: dayRangeLabel(l.days, lang === 'he' ? DAY_HE_SHORT : DAY_EN_SHORT), time: `${fmt12(l.start)}${l.end ? ` - ${fmt12(l.end)}` : ''}`,
        t1, t2, meta: m1, meta2: m2, note: l.note || '', groupLabel: l.groupLabel || '',
      };
    }),
  }));
}

/** By day: one card per day that has a shiur, a line per shiur with the rebbe and the place. */
export function cardsFromDays(list, lang = 'both') {
  return (list || []).map((d) => ({
    key: `d${d.date}`, person: null, today: !!d.today, head: { en: DAY_EN[d.code], he: DAY_HE[d.code] },
    lines: d.lines.map((r, i) => {
      const [t1, t2] = pickLang(r.shiur.title, r.shiur.titleHe, lang);
      const [m1] = pickLang(personName(r.person, 'en'), personName(r.person, 'he'), lang === 'both' ? 'en' : lang);
      const [pl] = pickLang(r.place, r.placeHe, lang === 'both' ? 'en' : lang);
      return { key: `l${i}`, lead: '', time: `${fmt12(r.start)}${r.end ? ` - ${fmt12(r.end)}` : ''}`, t1, t2, meta: [m1, pl].filter(Boolean).join(' · '), meta2: '', note: r.note || '', groupLabel: r.groupLabel || '' };
    }),
  }));
}
