/**
 * The Spotlight's countdown KINDS (pure, no DOM; test/spotlight.test.js) and the rule that picks which one a round shows.
 *
 * TYPES: the 8 kinds, each { id, label, stages (where it fits), maxDays (needs: at most this many days left, 0 = no limit),
 *   ticksIn (stages in which it shows live seconds), portrait }.
 * STAGE_IDS: the lead-up ladder in order. The day itself ('day') has no countdown kind (the Day hero).
 *
 * nextType(state, eligible, mode, stage, opts) -> { type, state }   (pure; state is plain JSON the kiosk keeps per screen)
 *   state = { key, stage, bag: [ids], last: id|null, round: n }  (use emptyTypeState())
 *   eligible = ids that are switched on AND fit the stage AND whose `maxDays` holds (eligibleTypes does that)
 *   mode 'auto' | 'order' | 'random' | 'one'; opts = { key, order, oneType, rand }
 *   RULES: never the same kind twice in a row (only exception: one eligible kind, or mode 'one'); 'auto' and 'random' use a
 *   shuffle bag (every eligible kind shows once before any repeats; 'auto' puts the stage's preferred kinds first); 'order'
 *   follows the admin's order; the bag resets when the spotlight (`key`) or the stage changes but `last` is kept.
 */

export const STAGE_IDS = Object.freeze(['announce', 'month', 'twoWeeks', 'week', 'eve', 'lastHour', 'day']);
export const COUNTDOWN_STAGES = Object.freeze(['announce', 'month', 'twoWeeks', 'week', 'eve', 'lastHour']);

export const TYPES = Object.freeze({
  flip:     Object.freeze({ id: 'flip',     label: 'Flip cards',      stages: ['twoWeeks', 'week', 'eve', 'lastHour'],                 maxDays: 0,  ticksIn: ['eve', 'lastHour'], portrait: true }),
  ring:     Object.freeze({ id: 'ring',     label: 'Tick ring',       stages: ['month', 'twoWeeks', 'week', 'eve', 'lastHour'],       maxDays: 0,  ticksIn: ['eve', 'lastHour'], portrait: true }),
  journey:  Object.freeze({ id: 'journey',  label: 'The way there',   stages: ['announce', 'month', 'twoWeeks', 'week', 'eve'],       maxDays: 0,  ticksIn: [], portrait: true }),
  glow:     Object.freeze({ id: 'glow',     label: 'Big glow',        stages: ['announce', 'month', 'twoWeeks', 'week', 'eve'],       maxDays: 0,  ticksIn: ['eve'], portrait: true }),
  calendar: Object.freeze({ id: 'calendar', label: 'Calendar',        stages: ['announce', 'month', 'twoWeeks', 'week'],              maxDays: 60, ticksIn: [], portrait: true }),
  meter:    Object.freeze({ id: 'meter',    label: 'Percent',         stages: ['announce', 'month', 'twoWeeks', 'week'],              maxDays: 0,  ticksIn: [], portrait: true }),
  sleeps:   Object.freeze({ id: 'sleeps',   label: 'Sleeps',          stages: ['twoWeeks', 'week'],                                   maxDays: 14, ticksIn: [], portrait: true }),
  odometer: Object.freeze({ id: 'odometer', label: 'Rolling numbers', stages: ['week', 'eve', 'lastHour'],                            maxDays: 0,  ticksIn: ['eve', 'lastHour'], portrait: true }),
});
export const TYPE_IDS = Object.freeze(Object.keys(TYPES));
export const TYPE_LABEL = Object.freeze(Object.fromEntries(TYPE_IDS.map((k) => [k, TYPES[k].label])));
export const TYPE_MODES = Object.freeze(['auto', 'order', 'random', 'one']);
export const TYPE_MODE_LABEL = Object.freeze({ auto: 'Automatic', order: 'My order', random: 'Random', one: 'Always the same one' });

/** The kinds each stage prefers, best first (a plain order; 'auto' mode puts these first in the bag). */
export const STAGE_PREFER = Object.freeze({
  announce: ['journey', 'calendar', 'meter', 'glow'],
  month: ['journey', 'calendar', 'ring', 'glow'],
  twoWeeks: ['ring', 'flip', 'calendar', 'sleeps'],
  week: ['sleeps', 'flip', 'ring', 'odometer'],
  eve: ['flip', 'ring', 'odometer', 'glow'],
  lastHour: ['flip', 'odometer', 'ring'],
});

export const emptyTypeState = () => ({ key: '', stage: '', bag: [], last: null, round: 0 });

/**
 * Which kinds may show now. `days` = calendar days left. `off` = the global switched-off ids; `only` = the occasion's own
 * list (null = all). Close to the day (eve, lastHour) only seconds-ticking kinds, unless none of them is on.
 */
export function eligibleTypes({ stage, days, off = [], only = null, order = TYPE_IDS }) {
  if (!COUNTDOWN_STAGES.includes(stage)) return [];
  const on = (id) => TYPES[id] && !off.includes(id) && (!only || only.includes(id));
  const fits = (id) => TYPES[id].stages.includes(stage) && (!TYPES[id].maxDays || days <= TYPES[id].maxDays);
  const list = [...new Set([...order, ...TYPE_IDS])].filter((id) => TYPES[id] && on(id) && fits(id));
  if (stage === 'eve' || stage === 'lastHour') {
    const tick = list.filter((id) => TYPES[id].ticksIn.includes(stage));
    if (tick.length) return tick;
  }
  return list;
}

function rng(seedStr) {
  let h = 2166136261;
  for (const ch of String(seedStr)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffled(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** One new bag: 'auto' = preferred kinds first (in the stage's order), the rest shuffled; 'random' = all shuffled. */
function makeBag(eligible, mode, stage, last, rand) {
  let bag;
  if (mode === 'auto') {
    const pref = (STAGE_PREFER[stage] || []).filter((id) => eligible.includes(id));
    bag = [...pref, ...shuffled(eligible.filter((id) => !pref.includes(id)), rand)];
  } else bag = shuffled(eligible, rand);
  // never the same as the one just shown
  if (bag.length > 1 && bag[0] === last) { const x = bag.shift(); bag.push(x); }
  return bag;
}

export function nextType(state, eligible, mode, stage, opts = {}) {
  const st = state && typeof state === 'object' ? state : emptyTypeState();
  const key = opts.key ?? st.key ?? '';
  const round = (st.round || 0) + 1;
  const base = { key, stage, round, last: st.last ?? null };
  const list = (eligible || []).filter((id) => TYPES[id]);
  if (mode === 'one') {
    const t = TYPES[opts.oneType] ? opts.oneType : list[0] || null;
    return { type: t, state: { ...base, bag: [], last: t } };
  }
  if (!list.length) return { type: null, state: { ...base, bag: [], last: null } };
  if (list.length === 1) return { type: list[0], state: { ...base, bag: [], last: list[0] } };
  if (mode === 'order') {
    const order = (opts.order || TYPE_IDS).filter((id) => list.includes(id));
    const seq = order.length ? order : list;
    const at = seq.indexOf(st.last);
    const type = seq[(at + 1) % seq.length];
    return { type, state: { ...base, bag: [], last: type } };
  }
  const rand = opts.rand || rng(`${key}|${stage}|${round}`);
  let bag = (key === st.key && stage === st.stage ? st.bag || [] : []).filter((id) => list.includes(id));
  if (!bag.length) bag = makeBag(list, mode, stage, base.last, rand);
  if (bag[0] === base.last && bag.length > 1) { const x = bag.shift(); bag.push(x); }
  const type = bag.shift();
  return { type, state: { ...base, bag, last: type } };
}
