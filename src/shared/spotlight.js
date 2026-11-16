/**
 * THE SPOTLIGHT (the Countdown slide's one star day): pure rules shared by the kiosk, the admin and the tests
 * (test/spotlight.test.js). Plan: docs/design/2026-11-16-spotlight/PLAN.md. Nothing here draws, fetches or stores.
 *
 * ── API (what the kiosk codes against) ───────────────────────────────────────────────────────────────────────────────
 *
 * spotlightModel(now: Date, settings, occasions, opts?) -> model
 *   settings   the occasions settings ({ ..., spotlight }) or null to use occasions.settings
 *   occasions  the occasions document { version, settings, occasions: [...] } (best: the object from /api/state, it is
 *              memoised per object), or just the array of occasion rows
 *   opts       { ctx: { tz, today?, zmanim?, loc?, fresh? }   the same context OccasionSlide gives pickFor
 *                typeState: the kiosk's rotation memory (emptyTypeState()/advanceType result), default none
 *                pickLang: (x) => x }                          language filter for { en, he } words
 *
 * model (mode 'none' = nothing to spotlight: { mode: 'none', strip, today }):
 *   mode      'spotlight'
 *   key       `${id}|${startISO}`: one OCCURRENCE (a queue entry is bound to it, never to "the occasion")
 *   source    'queue' | 'auto'
 *   id, startISO, nameEn, nameHe, plan {en,he} (the school's own line, may be empty), occasion (the row), row
 *   stage     'announce'|'month'|'twoWeeks'|'week'|'eve'|'lastHour'|'day'
 *             (a switched-off stage falls back to the one before it; 'day' lasts the WHOLE occasion, every day of a
 *             2-day one, until it is over, then the next spotlight takes over at once. There is no "after" stage.
 *             A switched-off 'day' only drops the story acts; the day still shows "Today".)
 *   rawStage  the stage by the clock, before any fallback
 *   heat      0..1 (the --heat CSS variable); intensity 0.5 calm | 1 | 1.5 max; hype 'calm'|'lively'|'max' (major milestone: 'max')
 *   final     true in the last 60 s (the existing final-minute takeover); zero true while the zero celebration runs
 *   countdown the countdownOf() result ({ form: 'far'|'days'|'hours'|'minutes'|'zero'|'day', approx, ... })
 *   days      CALENDAR days to the day itself (the headline number; owner rule 2026-11-13); nights = days (sleeps)
 *   hours, mins, secs   the exact remainder to the moment it BEGINS (hours 0-23); secs is null when the time is approximate
 *   parts     { d, h, m, s } the same remainder with d = whole 24 h blocks (for D:H:M:S cards)
 *   totalHours, totalMins, approx, ticksSeconds (secs are shown live: exact + settings.seconds + stage eve/lastHour)
 *   fraction  0..1 of the way from the start of the lead time to the moment it begins, percent = round(fraction*100)
 *   leadDays  the lead time used
 *   begins    datesOf() words { day, dayRange, hebrew, beginsLine, beginsAt, toGoLabel }; when = whenShort() { en, he }
 *   words     { kicker {en,he}, tagline {en,he}|null (the admin's stage text), dayNow {en,he} }
 *   type      { id, eligible [ids], mode, order, oneType }: id = the kind for this round (null in 'day'); `id` comes from
 *             opts.typeState (or the first preferred eligible one); advance it ONCE PER ROUND with advanceType()
 *   years     null | { tier 'major'|'notable', n, focus 'completed'|'entering', completed, entering, words (yearWords),
 *             vort {en,he,source,own}|null }          feeds the seal act + the badge; `major` true for the full treatment
 *   story     { specialty {en,he,source}|null, story {en,he,source}|null, vort, history [{year,en,he}], photo {url,dim}|null }
 *   acts      [{ id, seconds }] this round, in order. Countdown stages: 'hero' then 0..N story acts; 'day': 'dayHero' then
 *             every available act. Story act ids: 'years','specialty','photo','history','story','vort'
 *   totalSeconds, repeat (2 on eve/lastHour: the slide comes up twice per round, owner decision 3, else 1)
 *   strip     [{ id, startISO, nameEn, nameHe, days, big, when }] the side strip (other days only, never a full act)
 *   today
 *
 * advanceType(model, typeState) -> { type, state }   call when a new round of the slide starts; keep `state`
 * pickSpotlight(file, now, ctx) -> { row, source, index, rows, today }   the choice alone (auto / pinned / queue)
 * stageOf(row, now, ctx?) -> { stage, days, msLeft }  the lead-up ladder alone
 * heatOf(stage, hype, final) -> number; STAGE_HEAT; STAGE_WORDS; HEBREW_REVIEW (every new Hebrew string, for the owner)
 * actPlan({ stage, depth, acts (available ids), major, round }) -> [ids]
 * eligibleTypes / nextType / TYPES: spotlightTypes.js (re-exported). Settings: spotlightSettings.js (re-exported).
 */
import {
  normalizeFile, normalizeSettings, upcoming, visibleRows, daysUntil, windowDays, countdownOf, resolveLook, datesOf, whenShort, stageTextFor,
} from './occasions.js';
import { zonedParts, DEFAULT_TZ } from './announcements.js';
import { milestoneOf, yearWords, vortFor } from './occasionYears.js';
import { hypeOf } from './occasionHype.js';
import { STAGE_IDS, TYPES, eligibleTypes, nextType, emptyTypeState, STAGE_PREFER } from './spotlightTypes.js';
import { SPOTLIGHT_ACTS } from './spotlightSettings.js';

export * from './spotlightTypes.js';
export * from './spotlightSettings.js';

const DAY_MS = 86400000;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ── the ladder ──────────────────────────────────────────────────────────────

export const STAGE_HEAT = Object.freeze({ announce: 0, month: 0.2, twoWeeks: 0.35, week: 0.5, eve: 0.75, lastHour: 0.9, day: 0.8 });
export const STAGE_REPEAT = Object.freeze({ eve: 2, lastHour: 2 });
/** The old stage names the admin's own stage words are filed under (stageTextFor). */
const LEGACY_STAGE = Object.freeze({ announce: 'far', month: 'far', twoWeeks: 'days', week: 'days', eve: 'hours', lastHour: 'minutes', day: 'day' });

/** Words per stage (the kicker). Hebrew: native speaker to confirm; every Hebrew string is also in HEBREW_REVIEW. */
export const STAGE_WORDS = Object.freeze({
  announce: { en: 'Coming', he: 'בקרוב' },
  month: { en: 'A month to go', he: 'עוד חודש' },
  twoWeeks: { en: 'Two weeks to go', he: 'עוד שבועיים' },
  week: { en: 'This week', he: 'השבוע' },
  eveTonight: { en: 'Tonight', he: 'הלילה' },
  eveTomorrow: { en: 'Tomorrow', he: 'מחר' },
  lastHour: { en: 'Almost here', he: 'עוד מעט' },
  day: { en: 'Today', he: 'היום' },
  dayNow: { en: 'Happening now', he: 'קורה עכשיו' },
});
export const HEBREW_REVIEW = Object.freeze(Object.values(STAGE_WORDS).map((w) => w.he));

/** The stage by the clock. `days` = calendar days to the day itself, `msLeft` = ms to the moment it begins (negative once begun). */
export function stageOf(row, now, ctx = {}) {
  const t = now.getTime();
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const msLeft = row.begin.ms - t;
  const days = daysUntil(row, today);
  let stage;
  if (msLeft <= 0) stage = 'day';
  else if (msLeft <= 3600000) stage = 'lastHour';
  else if (msLeft < DAY_MS) stage = 'eve';
  else if (days <= 7) stage = 'week';
  else if (days <= 14) stage = 'twoWeeks';
  else if (days <= 30) stage = 'month';
  else stage = 'announce';
  return { stage, days, msLeft };
}

/** A switched-off stage falls back to the one before it (the first one after it when nothing is before). 'day' never vanishes. */
export function resolveStage(stage, stages) {
  if (stage === 'day' || !stages || stages[stage] !== false) return stage;
  const i = STAGE_IDS.indexOf(stage);
  for (let k = i - 1; k >= 0; k--) if (stages[STAGE_IDS[k]] !== false) return STAGE_IDS[k];
  for (let k = i + 1; k < STAGE_IDS.indexOf('day'); k++) if (stages[STAGE_IDS[k]] !== false) return STAGE_IDS[k];
  return stage;
}

/** 0..1: the stage's heat under the Hype choice (calm caps at 0.35, max x1.3, never above 1); the final minute is 1. */
export function heatOf(stage, hype = 'lively', final = false) {
  const base = final ? 1 : (STAGE_HEAT[stage] ?? 0);
  const h = hype === 'calm' ? Math.min(base, 0.35) : hype === 'max' ? base * 1.3 : base;
  return Math.round(Math.max(0, Math.min(1, h)) * 1000) / 1000;
}

// ── which day is the spotlight ──────────────────────────────────────────────

const isCountup = (r) => r.occasion && r.occasion.kind === 'countup';

/**
 * The choice. 'queue' / 'pinned' (a queue of one): the first line-up entry, in order, whose OCCURRENCE is running or inside
 * its lead time. An entry with a date (startISO) matches that occurrence only; one without matches the next date and is used
 * only while inside leadDays (so a day that passed never jumps to next year). Spent entries (their occurrence is over) are
 * skipped, and with nothing usable the automatic choice takes over. Automatic: a running big day first (the latest to begin),
 * else the soonest big day inside its window, else the nearest small one.
 */
export function pickSpotlight(file, now, ctx = {}) {
  const f = file && Array.isArray(file.occasions) && file.settings?.spotlight ? file : normalizeFile(file);
  const s = f.settings;
  const sp = s.spotlight;
  const today = ctx.today || zonedParts(now, ctx.tz || DEFAULT_TZ).date;
  const rows = visibleRows(upcoming(f, now, { ...ctx, today }), s).filter((r) => !isCountup(r));
  const lead = (r) => r.occasion.spotlight?.leadDays || sp.leadDays;
  if (sp.pick === 'queue' || sp.pick === 'pinned') {
    const entries = sp.pick === 'pinned' ? sp.queue.slice(0, 1) : sp.queue;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const r = rows.find((x) => x.id === e.id && (!e.startISO || x.startISO === e.startISO));
      if (r && (r.running || daysUntil(r, today) <= lead(r))) return { row: r, source: 'queue', index: i, rows, today };
    }
  }
  const near = (r) => daysUntil(r, today) <= (r.occasion.spotlight?.leadDays || windowDays(r, s));
  const running = rows.filter((r) => r.running).sort((a, b) => b.begin.ms - a.begin.ms);
  const inWindow = rows.filter((r) => !r.running && r.occasion.big !== false && near(r));
  const row = running[0] || inWindow[0] || rows.find((r) => !r.running && near(r)) || null;
  return { row, source: 'auto', index: -1, rows, today };
}

// ── story acts ──────────────────────────────────────────────────────────────

export const ACT_ORDER = Object.freeze(['years', 'specialty', 'photo', 'history', 'story', 'vort']);
const ACT_SECONDS = Object.freeze({ hero: 12, dayHero: 12, specialty: 6, photo: 6, history: 8, story: 10, vort: 7 });
const HERO_SECONDS = Object.freeze({ announce: 12, month: 12, twoWeeks: 11, week: 11, eve: 10, lastHour: 10 });
const yearsSeconds = (tier) => (tier === 'major' ? 10 : 7);

/** How many story acts follow the countdown in a round (Infinity = all). */
export function actsPerRound(stage, depth) {
  if (depth === 'full') return Infinity;
  if (depth === 'short') return 1;
  return { announce: 1, month: 1, twoWeeks: 2, week: 2, eve: 3, lastHour: 1, day: Infinity }[stage] ?? 1;
}

/**
 * The story acts of one round. `acts` = the available ids (ACT_ORDER order), `round` 0-based. Acts take turns across rounds
 * (N consecutive ones, starting where the last round stopped) so every round shows something new. A MAJOR milestone's years
 * seal is in every round. Returns ids only.
 */
export function actPlan({ stage, depth = 'auto', acts = [], major = false, round = 0 }) {
  const list = ACT_ORDER.filter((a) => acts.includes(a));
  const n = actsPerRound(stage, depth);
  if (n >= list.length) return list;
  const pinned = major && list.includes('years') ? ['years'] : [];
  const rest = list.filter((a) => !pinned.includes(a));
  if (!rest.length) return pinned;
  const take = Math.min(n, rest.length);
  const out = [];
  const start = ((round % rest.length) * take) % rest.length;
  for (let i = 0; i < take; i++) out.push(rest[(start + i) % rest.length]);
  return ACT_ORDER.filter((a) => pinned.includes(a) || out.includes(a));
}

// ── the model ───────────────────────────────────────────────────────────────

const text = (en, he) => ({ en: en || '', he: he || '' });
const hasText = (x) => !!(x && (x.en || x.he));

function fileOf(settings, occasions) {
  if (isObj(occasions) && Array.isArray(occasions.occasions)) {
    if (!settings || settings === occasions.settings) return occasions.settings?.spotlight?.v ? occasions : normalizeFile(occasions);
    return normalizeFile({ ...occasions, settings });
  }
  return normalizeFile({ version: 1, settings: settings || {}, occasions: Array.isArray(occasions) ? occasions : [] });
}

export function spotlightModel(now, settings, occasions, opts = {}) {
  const f = fileOf(settings, occasions);
  const s = f.settings;
  const sp = s.spotlight;
  const ctx = opts.ctx || {};
  const pickLang = opts.pickLang || ((x) => x);
  const tz = ctx.tz || DEFAULT_TZ;
  const pick = pickSpotlight(f, now, ctx);
  const today = pick.today;
  const { row } = pick;
  const strip = stripOf(pick, sp, s, today, now);
  if (!row) return { mode: 'none', strip, today };

  const o = row.occasion;
  const t = now.getTime();
  const st = stageOf(row, now, { ...ctx, today });
  const stage = st.stage === 'day' ? 'day' : resolveStage(st.stage, sp.stages);
  const dayExtras = !(st.stage === 'day' && sp.stages.day === false);
  const cd = countdownOf(row, now, s, today);
  const approx = !row.begin.exact;
  const msLeft = Math.max(0, st.msLeft);
  const secsLeft = Math.floor(msLeft / 1000);
  const parts = { d: Math.floor(secsLeft / 86400), h: Math.floor((secsLeft % 86400) / 3600), m: Math.floor((secsLeft % 3600) / 60), s: secsLeft % 60 };
  const final = st.msLeft > 0 && st.msLeft <= 60000 && !approx;
  const lead = o.spotlight?.leadDays || (pick.source === 'queue' ? sp.leadDays : windowDays(row, s));
  const leadMs = lead * DAY_MS;
  const fraction = st.msLeft <= 0 ? 1 : Math.max(0, Math.min(1, (leadMs - st.msLeft) / leadMs));

  // milestone years feed the seal; a MAJOR one forces hype to maximum
  const m = milestoneOf(o.since, row.startISO);
  const years = m && m.tier ? { tier: m.tier, n: m.n, focus: m.focus, completed: m.completed, entering: m.entering, words: yearWords(m), vort: vortFor(m, o.yearVorts) } : null;
  const major = !!years && years.tier === 'major';
  const hypeSetting = major ? 'max' : (o.hype || s.hype);
  const hy = hypeOf({ form: cd.form, beginMs: row.begin.ms, countdown: { days: st.days } }, now, hypeSetting);
  const heatStage = st.stage === 'day' && !dayExtras ? 'eve' : stage;
  const heat = heatOf(heatStage, hy.setting, final);

  // the kind of countdown (none on the day itself)
  const only = o.spotlight?.types || null;
  let eligible = eligibleTypes({ stage, days: st.days, off: sp.types.off, only, order: sp.types.order });
  let mode = sp.typeMode;
  if (stage !== 'day' && mode === 'one') {
    const one = TYPES[sp.oneType] && (!only || only.includes(sp.oneType)) ? sp.oneType : (only ? only[0] : sp.oneType);
    eligible = [one];
  }
  if (mode === 'one' && eligible.length <= 1) mode = 'auto';
  const ts = opts.typeState || null;
  const pref = (STAGE_PREFER[stage] || []).filter((id) => eligible.includes(id));
  const typeId = stage === 'day' ? null : (ts && ts.last && eligible.includes(ts.last) ? ts.last : (pref[0] || eligible[0] || null));
  const round = ts ? Math.max(0, (ts.round || 1) - 1) : 0;

  // the story
  const showExplain = s.explain !== false;
  const credit = s.credit === false ? '' : o.source;
  const look = resolveLook(s, o);
  const short = text(o.explainShortEn, o.explainShortHe);
  const long = text(o.explainEn, o.explainHe);
  const story = {
    specialty: showExplain && hasText(short) ? { ...short, source: credit } : null,
    story: showExplain && hasText(long) ? { ...long, source: credit } : null,
    vort: o.vort && hasText(o.vort) ? { en: o.vort.en, he: o.vort.he, source: o.vort.source } : null,
    history: o.history || [],
    photo: look.photo ? { url: look.photo, dim: look.dim } : null,
  };
  const avail = SPOTLIGHT_ACTS.filter((a) => sp.acts[a] !== false && (a === 'years' ? !!years : a === 'history' ? story.history.length > 0 : !!story[a === 'photo' ? 'photo' : a])).filter((a) => dayExtras || stage !== 'day');
  const ids = actPlan({ stage, depth: sp.depth, acts: avail, major, round });
  const acts = [{ id: stage === 'day' ? 'dayHero' : 'hero', seconds: stage === 'day' ? ACT_SECONDS.dayHero : HERO_SECONDS[stage] || ACT_SECONDS.hero },
    ...ids.map((id) => ({ id, seconds: id === 'years' ? yearsSeconds(years.tier) : ACT_SECONDS[id] }))];

  const kicker = stage === 'eve' ? (row.begin.dateISO === today ? STAGE_WORDS.eveTonight : STAGE_WORDS.eveTomorrow) : STAGE_WORDS[stage];
  return {
    mode: 'spotlight', key: `${row.id}|${row.startISO}`, source: pick.source,
    id: row.id, startISO: row.startISO, nameEn: row.nameEn, nameHe: row.nameHe, plan: text(o.eventEn, o.eventHe), occasion: o, row,
    stage, rawStage: st.stage, heat, intensity: hy.intensity, hype: hy.setting, final, zero: cd.form === 'zero', countdown: cd,
    days: st.days, nights: st.days, hours: parts.h, mins: parts.m, secs: approx ? null : parts.s, parts,
    totalHours: Math.floor(secsLeft / 3600), totalMins: Math.floor(secsLeft / 60), approx,
    ticksSeconds: !approx && s.seconds !== false && (stage === 'eve' || stage === 'lastHour'),
    fraction, percent: Math.round(fraction * 100), leadDays: lead,
    begins: datesOf(row, today, tz, pickLang), when: pickLang(whenShort(row, today, now)),
    words: {
      kicker: pickLang(kicker), dayNow: pickLang(STAGE_WORDS.dayNow),
      tagline: (() => { const x = stageTextFor(o, s, LEGACY_STAGE[stage], t >= row.begin.ms ? 0 : st.days); return x ? pickLang(x) : null; })(),
    },
    type: { id: typeId, eligible, mode, order: sp.types.order, oneType: sp.oneType },
    years, major, story, acts, totalSeconds: acts.reduce((a, x) => a + x.seconds, 0), repeat: STAGE_REPEAT[stage] || 1,
    strip, today,
  };
}

function stripOf(pick, sp, s, today, now) {
  if (!sp.strip.on || sp.strip.count <= 0) return [];
  const hero = pick.row;
  return pick.rows
    .filter((r) => (!hero || !(r.id === hero.id && r.startISO === hero.startISO)) && !r.running && (sp.strip.small || r.occasion.big !== false) && daysUntil(r, today) <= sp.strip.days)
    .slice(0, sp.strip.count)
    .map((r) => ({ id: r.id, startISO: r.startISO, nameEn: r.nameEn, nameHe: r.nameHe, days: daysUntil(r, today), big: r.occasion.big !== false, when: whenShort(r, today, now) }));
}

/** Call once when a new round of the slide starts: the next countdown kind (never the same twice in a row). Keep `state`. */
export function advanceType(model, typeState) {
  if (!model || model.mode !== 'spotlight' || !model.type) return { type: null, state: typeState || emptyTypeState() };
  const T = model.type;
  return nextType(typeState || emptyTypeState(), T.eligible, T.mode, model.stage, { key: model.key, order: T.order, oneType: T.oneType });
}
