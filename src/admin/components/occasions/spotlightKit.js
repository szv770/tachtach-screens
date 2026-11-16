// Pure helpers for the Spotlight admin (card, wizard, More options). No React, no DOM. Tests: test/spotlightAdmin.test.js.
import { TYPE_IDS, TYPE_LABEL, TYPE_MODE_LABEL, STAGE_IDS, SPOTLIGHT_STAGE_LABEL, SPOTLIGHT_LIMITS, SPOTLIGHT_ACTS } from '../../../shared/spotlight.js';

const DAY = 86400000;

/** Plain words for the 7 story parts and the 7 stages (admin side). */
export const ACT_LABEL = Object.freeze({
  specialty: 'What happened (the one line)', years: 'The years seal (milestone years)', history: 'This day in history', story: 'The story', vort: 'The short teaching (vort)', photo: 'The photo',
});
export const STAGE_NOTE = Object.freeze({
  announce: 'Calm and elegant, the big number of days', month: 'Warmer, the story starts to show', twoWeeks: 'Days and hours, "Two weeks to go"',
  week: 'Sleeps, faster turns', eve: 'Live hours, minutes and seconds', lastHour: 'Minutes and seconds, the slide comes back more', day: '"Today" with the story and the photo, all day',
});
export const DEPTH_LABEL = Object.freeze({ auto: 'Automatic (more when it is close)', short: 'Short: the countdown and one story part', full: 'Full: every story part every time' });
export const MAX_QUEUE = SPOTLIGHT_LIMITS.queue;

/** 'auto' with no days chosen, 'pinned' with one, 'queue' with more. */
export const pickOfQueue = (queue) => (queue.length === 0 ? 'auto' : queue.length === 1 ? 'pinned' : 'queue');

/** Tap a day: add it to the line-up (its date is bound to THIS occurrence) or take it out. */
export function toggleInQueue(queue, row) {
  const i = queue.findIndex((e) => e.id === row.id && (e.startISO === row.startISO || e.startISO === ''));
  if (i >= 0) return queue.filter((_, j) => j !== i);
  if (queue.length >= MAX_QUEUE) return queue;
  return [...queue, { id: row.id, startISO: row.startISO }];
}
export const inQueue = (queue, row) => queue.findIndex((e) => e.id === row.id && (e.startISO === row.startISO || e.startISO === ''));

/** Each on-day once (its next date), big days first, then by date. */
export function chooseList(rows) {
  const seen = new Set(); const out = [];
  for (const r of rows) { if (!r.occasion.on || seen.has(r.id)) continue; seen.add(r.id); out.push(r); }
  const big = (r) => (r.occasion.big !== false ? 0 : 1);
  return out.sort((a, b) => big(a) - big(b) || (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
}

export function kindsSummary(sp) {
  const on = TYPE_IDS.length - sp.types.off.length;
  const mode = sp.typeMode === 'one' ? `always ${TYPE_LABEL[sp.oneType].toLowerCase()}` : `${TYPE_MODE_LABEL[sp.typeMode].toLowerCase()} order`;
  return `${on} of ${TYPE_IDS.length} kinds, ${mode}`;
}
export function stagesSummary(sp) { const on = STAGE_IDS.filter((s) => sp.stages[s] !== false).length; return `${on} of ${STAGE_IDS.length} stages · starts ${sp.leadDays} days before`; }
export function actsSummary(sp) { const on = SPOTLIGHT_ACTS.filter((a) => sp.acts[a] !== false).length; return `${on} of ${SPOTLIGHT_ACTS.length} story parts`; }
export function stripSummary(sp) { return sp.strip.on && sp.strip.count > 0 ? `${sp.strip.count} day${sp.strip.count === 1 ? '' : 's'}, within ${sp.strip.days} days` : 'Off'; }
export const depthSummary = (s, sp) => `${{ calm: 'Calm', lively: 'Lively', max: 'Maximum' }[s.hype || 'lively']} · ${sp.depth === 'auto' ? 'automatic' : sp.depth} story`;

/** When each stage starts for this spotlight model (about; the real boundaries follow the clock): [{ id, label, at: Date|null }]. */
export function stageDates(model) {
  if (!model || model.mode !== 'spotlight') return [];
  const b = model.row.begin.ms; const lead = model.leadDays;
  const from = { announce: b - lead * DAY, month: b - 30 * DAY, twoWeeks: b - 14 * DAY, week: b - 7 * DAY, eve: b - DAY, lastHour: b - 3600000, day: Date.parse(`${model.startISO}T00:00:00`) };
  return STAGE_IDS.map((id) => ({ id, label: SPOTLIGHT_STAGE_LABEL[id], at: id === 'announce' || from[id] >= b - lead * DAY ? new Date(from[id]) : null }));
}

/** A moment (ms) inside each stage, for the preview chips; null when this day's lead time never reaches that stage. */
export function momentFor(model, stage) {
  if (!model || model.mode !== 'spotlight') return null;
  const b = model.row.begin.ms; const lead = model.leadDays;
  const m = { announce: lead > 33 ? b - Math.min(lead, 45) * DAY : null, month: lead >= 22 ? b - 22 * DAY : null, twoWeeks: lead >= 10 ? b - 10 * DAY : null, week: b - 4 * DAY, eve: b - 12 * 3600000, lastHour: b - 20 * 60000, day: Date.parse(`${model.startISO}T12:00:00`) };
  return m[stage] ?? null;
}

// ── Claude prompts + paste-back (never invented: sourced lines only) ───────────

const RULES = `Rules, please follow them strictly:
1. Only write what you can back with a real, checkable source: the sefer or book, with volume and page, or the exact talk, or a web page with its exact link. Chabad.org is an acceptable source.
2. If you are not certain of a fact, a date, a quote or a source, write "I am not sure" and leave it out. Never invent or guess. Never attribute words to the Rebbe or any person unless a real source says so.
3. No names of students. Names of Rebbeim, places and events only.`;
export function vortOnlyPrompt(name, date) {
  return `I run the screen in a Jewish school. For the day "${name}" (${date || 'its Hebrew date'}) I would like ONE short teaching (a vort) to show after the countdown: 2 or 3 simple sentences, 400 characters at most.
${RULES}
Reply in exactly this form, each label at the start of its own line:
Vort English: <the teaching>
Vort Hebrew: <the same in Hebrew, or leave empty>
Vort Source: <the exact source with the link, 140 characters at most>
Not sure about: <anything you left out, or "nothing">
I will check the source myself before it goes on the screen.`;
}
export function historyPrompt(name, date) {
  return `I run the screen in a Jewish school. For the day "${name}" (${date || 'its Hebrew date'}) I would like up to 6 short "this day in history" lines: what happened on this Hebrew date in earlier years, each with the Hebrew year, 140 characters at most.
${RULES}
Reply in exactly this form, one line each, nothing else (use the | sign between the parts):
History: <Hebrew year, like 5747> | <the line in English> | <the same in Hebrew, or leave empty>
Source: <the exact sources, with links>
Not sure about: <anything you left out, or "nothing">
I will check the sources myself before they go on the screen.`;
}
const fieldOf = (text, label) => { const m = String(text || '').match(new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, 'im')); return m ? m[1].trim() : ''; };
/** Reads a Claude reply to either prompt: { vort?: {en,he,source}, history?: [{year,en,he}], source } (empty object when nothing fits). */
export function parseSpotlightReply(text) {
  const out = {};
  const en = fieldOf(text, 'Vort English'); const he = fieldOf(text, 'Vort Hebrew');
  if (en || he) out.vort = { en, he, source: fieldOf(text, 'Vort Source') || fieldOf(text, 'Source') };
  const lines = [];
  for (const l of String(text || '').split(/\r?\n/)) {
    const m = l.match(/^\s*History\s*:\s*(.+)$/i);
    if (!m) continue;
    const [y, e, h] = m[1].split('|').map((x) => x.trim());
    const year = Number(String(y).replace(/\D/g, ''));
    if (!e && !h) continue;
    lines.push({ year: Number.isInteger(year) && year > 0 ? year : '', en: (e || '').slice(0, SPOTLIGHT_LIMITS.historyText), he: (h || '').slice(0, SPOTLIGHT_LIMITS.historyText) });
  }
  if (lines.length) { out.history = lines.slice(0, SPOTLIGHT_LIMITS.history); out.historySource = fieldOf(text, 'Source'); }
  const notSure = fieldOf(text, 'Not sure about');
  if (notSure && !/^nothing\.?$/i.test(notSure)) out.notSure = notSure;
  return out;
}
