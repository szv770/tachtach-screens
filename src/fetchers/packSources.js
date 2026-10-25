/**
 * Per-date readers for the data pack builder (src/server/packBuilder.js): one function per section that gets a
 * single civil day's value out of the same Chabad.org pages / feeds the live fetchers already use, and returns it in the
 * pack's shape. Nothing here writes anything.
 *
 * Contract of every reader: `(iso, ctx) => value | null`
 *   value  the section's pack value;  null  the page loaded but has nothing for that day (stored as "no data", not retried);
 *   throws the page could not be loaded (the builder retries with a back-off, then records the failure and moves on).
 * `ctx.getPage(url, opts)` is injectable (tests feed saved HTML); the default is `fetchPage` (plain request, headless browser
 * when Cloudflare challenges it). The Hebrew side reads the he.chabad.org twin of the same page and is optional (empty string).
 *
 * UNVERIFIED FROM THE SANDBOX (chabad.org is Cloudflare-blocked there): the page URLs below follow the ones the live fetchers
 * and the admin date-preview already use; run `node scripts/build-data-pack.js --probe` on the Pi first (one day, every
 * section, prints what each reader found).
 */
import {
  fetchPage, fetchHayomYomDetailed, fetchDailyQuote, fetchParshaTidbits, parseHeading, formatChumashLine, rambamChapters, parseTanyaExcerpt,
} from './chabad.js';
import { fetchTorahCalc } from './torahcalc.js';
import { PACK_LICENCE_NOTE } from '../shared/dataPack.js';

const tdateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}/${y}`; };
export const pageUrl = (host, page, iso) => `https://${host}.chabad.org/dailystudy/${page}.asp?tdate=${tdateOf(iso)}`;

async function heading(url, ctx, { required }) {
  const page = await ctx.getPage(url);
  if (!page) { if (required) throw new Error('page could not be loaded'); return { text: '', html: '' }; }
  return { text: parseHeading(page.html), html: page.html };
}

export const READERS = {
  /** Hayom Yom is per HEBREW day; the builder passes a civil date that falls on it. 'empty' = the day has no entry. */
  async hayomYom(iso, ctx) {
    const r = await (ctx.hayomYom || fetchHayomYomDetailed)(iso, { getPage: ctx.getPage });
    if (r.status === 'error') throw new Error(r.error);
    if (r.status === 'empty') return null;
    return { en: r.hayomEn || '', he: r.hayomHe || '' };
  },

  async chumash(iso, ctx) {
    const en = (await heading(pageUrl('www', 'torahreading', iso), ctx, { required: true })).text;
    if (!en) return null;
    const he = (await heading(pageUrl('he', 'torahreading', iso), ctx, { required: false })).text;
    return { en: formatChumashLine(en), he };
  },

  /** Only asked for on Psalm 119 days (the calculator covers the rest). */
  async tehillim(iso, ctx) {
    const en = (await heading(pageUrl('www', 'tehillim', iso), ctx, { required: true })).text;
    if (!en) return null;
    const he = (await heading(pageUrl('he', 'tehillim', iso), ctx, { required: false })).text;
    return { en: en.replace(/^Today's (Psalms|Tehillim):\s*/i, ''), he };
  },

  /** The day's Tanya lesson line + the first/last words from the same page. */
  async tanya(iso, ctx) {
    const { text: en, html } = await heading(pageUrl('www', 'tanya', iso), ctx, { required: true });
    if (!en) return null;
    const he = (await heading(pageUrl('he', 'tanya', iso), ctx, { required: false })).text;
    const ex = parseTanyaExcerpt(html) || {};
    return { en: en.replace(/^Today's Lessons?:\s*/i, ''), he, ...(ex.tanyaFirstWords ? { firstWords: ex.tanyaFirstWords } : {}), ...(ex.tanyaLastWords ? { lastWords: ex.tanyaLastWords } : {}) };
  },

  /** Rambam (1 and 3 chapters) and Sefer HaMitzvos for a day: one TorahCalc call (the admin date-preview already uses it). */
  async rambam(iso, ctx) {
    const tc = await (ctx.torahCalc || fetchTorahCalc)(new Date(`${iso}T12:00:00`));
    if (!tc) throw new Error('TorahCalc did not answer');
    const one = (x, chapters) => (x && (x.displayEn || x.displayHe) ? { en: x.displayEn || '', he: x.displayHe || '', ...(chapters ? { chaptersArabic: rambamChapters(x.displayEn) } : {}) } : null);
    return { rambam1: one(tc.rambam1, true), rambam3: one(tc.rambam3, true), seferHamitzvot: one(tc.seferHamitzvot, false) };
  },

  /** The feeds only show TODAY: the builder calls these once per run and files the result under today's date / this week. */
  async dailyQuote(_iso, ctx) {
    const q = await (ctx.dailyQuote || fetchDailyQuote)();
    if (!q) throw new Error('quote feed did not answer');
    return q.text ? { text: q.text, source: q.source || '' } : null;
  },
  async tidbits(_iso, ctx) {
    const items = await (ctx.tidbits || fetchParshaTidbits)();
    if (!items) throw new Error('parsha feed did not answer');
    const clean = items.filter((i) => i.description).map(({ title, description, link }) => ({ title, description, link }));
    return clean.length ? { items: clean } : null;
  },
};

const CH = 'Chabad.org';
/** source + licence note recorded per section in the manifest (the builder refuses a section without them). */
export const SECTION_NOTES = {
  hayomYom: { source: `${CH} Hayom Yom (dailystudy/hayomyom.asp)`, licence: PACK_LICENCE_NOTE },
  chumash: { source: `${CH} Daily Chumash (dailystudy/torahreading.asp)`, licence: PACK_LICENCE_NOTE },
  tehillim: { source: `${CH} Daily Tehillim (dailystudy/tehillim.asp), Psalm 119 days only`, licence: PACK_LICENCE_NOTE },
  tanya: { source: `${CH} Daily Tanya (dailystudy/tanya.asp)`, licence: PACK_LICENCE_NOTE },
  rambam1: { source: 'TorahCalc daily learning, Chabad Rambam cycle (chapter references)', licence: `Chapter references only (facts); cycle courtesy of ${CH}` },
  rambam3: { source: 'TorahCalc daily learning, Chabad Rambam cycle (chapter references)', licence: `Chapter references only (facts); cycle courtesy of ${CH}` },
  seferHamitzvot: { source: 'TorahCalc daily learning, Sefer HaMitzvos (reference lines)', licence: `Reference lines only (facts); cycle courtesy of ${CH}` },
  dailyQuote: { source: `${CH} Daily Quote RSS (collected as it is published)`, licence: PACK_LICENCE_NOTE },
  tidbits: { source: `${CH} Parsha RSS (collected as it is published)`, licence: PACK_LICENCE_NOTE },
};

export { fetchPage };
