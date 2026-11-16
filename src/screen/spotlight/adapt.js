/**
 * From the RULES' model (src/shared/spotlight.js spotlightModel) to the graphics' view model (model.js SpotModel), and
 * from a planned act id to a view. The slide wiring calls these; the components never read the rules' shape directly.
 *
 *   const m = spotlightModel(now, null, occasionsDoc, { ctx, typeState });
 *   const sp = toSpot(m, { lang, look });            // null when m.mode !== 'spotlight'
 *   m.acts.map((a) => viewOf(a.id, m))               // the round: hero kind, then the story acts
 */
import { DAY } from './model.js';

const bi = (x) => (x && (x.en || x.he) ? { en: x.en || '', he: x.he || '' } : null);
const join = (a, b) => ({ en: [a?.en, b?.en].filter(Boolean).join(' · '), he: [a?.he, b?.he].filter(Boolean).join(' · ') });

export function toSpot(m, { lang = 'both', look = {} } = {}) {
  if (!m || m.mode !== 'spotlight') return null;
  const startMs = m.row?.begin?.ms ?? (Date.now() + ((((m.parts?.d || 0) * 24 + (m.parts?.h || 0)) * 60 + (m.parts?.m || 0)) * 60 + (m.parts?.s || 0)) * 1000);
  const b = m.begins || {};
  const daysLeft = Number(m.days) || 0;
  const advent = m.occasion?.advent?.daily?.[String(daysLeft)];
  const w = m.years?.words;
  return {
    key: m.key,
    name: { en: m.nameEn || '', he: m.nameHe || '' },
    lang,
    stage: m.stage,
    heat: m.heat,
    startMs,
    endMs: m.row?.end?.ms,
    leadStartMs: startMs - (Number(m.leadDays) || 60) * DAY,
    days: daysLeft,
    ticks: !!m.ticksSeconds,
    approx: !!m.approx,
    kicker: bi(m.words?.kicker) || undefined,
    begins: m.stage === 'day' ? bi(b.dayRange || b.day) || undefined : join(b.beginsLine, b.beginsAt),
    facts: [
      b.hebrew && { label: { en: 'Hebrew date', he: 'תאריך עברי' }, value: bi(b.hebrew) },
      (b.dayRange || b.day) && { label: { en: 'The day', he: 'היום' }, value: bi(b.dayRange || b.day) },
      b.beginsAt && { label: { en: 'Begins', he: 'מתחיל' }, value: bi(b.beginsAt) },
    ].filter((x) => x && x.value),
    years: m.years ? {
      tier: m.years.tier, n: m.years.n, letters: w?.letters || '', completed: m.years.completed, entering: m.years.entering, focus: m.years.focus,
      what: { en: m.nameEn || '', he: m.nameHe || '' }, vort: m.years.vort || null,
    } : null,
    happened: m.story?.specialty || null,
    story: m.story?.story || null,
    vort: m.story?.vort || null,
    history: m.story?.history || [],
    photo: m.story?.photo?.url ? { src: m.story.photo.url, dim: m.story.photo.dim } : null,
    advent: bi(advent),
    strip: (m.strip || []).map((r) => ({ key: `${r.id}|${r.startISO}`, name: { en: r.nameEn || '', he: r.nameHe || '' }, days: r.days })),
    accent: look.accent || '',
    numeralsFont: look.numeralsFont || '',
  };
}

/** A planned act id (spotlight.js acts[].id) -> a <Spotlight view>. */
export function viewOf(actId, m) {
  if (actId === 'hero') return { kind: 'count', type: m?.type?.id || 'flip' };
  if (actId === 'dayHero') return { kind: 'day' };
  if (actId === 'years') return { kind: 'seal' };
  if (actId === 'specialty') return { kind: 'act', act: 'happened' };
  return { kind: 'act', act: actId };
}
