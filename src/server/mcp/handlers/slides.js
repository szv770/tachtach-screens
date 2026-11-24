/**
 * Slide and history tools. The rotation is saved as the whole list (that is how the admin saves it too), so each tool reads the
 * list, changes one row and writes it back through PUT /api/slides, which keeps its own rules (posts need "edit announcements").
 */
import { apiOk, ToolError, result } from './common.js';
import { SECONDS_MIN, SECONDS_MAX } from '../../../shared/postList.js';

const nameOf = (s) => `“${s.label || s.titleEn || s.type}”`;

async function load(ctx, id) {
  const rows = await apiOk(ctx, 'GET', '/api/slides');
  const list = Array.isArray(rows) ? rows : [];
  const slide = list.find((s) => s.id === id);
  if (!slide) throw new ToolError('No slide with that id. Use list_slides to see the ids.');
  return { list, slide };
}

async function planEnabled(ctx, { id, enabled }) {
  const { slide } = await load(ctx, id);
  const out = { ok: true, warnings: [], errors: [], sentence: '' };
  if (slide.type === 'ANNOUNCEMENT' && !ctx.caps.includes('announcements.edit')) {
    return { ok: false, warnings: [], sentence: '', errors: ['Switching a posted message on or off needs the "Edit existing announcements" access, which the person who made this connection does not have.'] };
  }
  const now = slide.enabled !== false;
  if (now === enabled) { out.warnings.push(`It is already ${enabled ? 'on' : 'off'}; nothing will change.`); }
  out.sentence = `Switch ${nameOf(slide)} ${enabled ? 'ON: it joins the rotation' : 'OFF: it disappears from the TV until it is switched on again'}.`;
  return out;
}
export const setSlideEnabled = {
  plan: planEnabled,
  async apply(ctx, args) {
    const plan = await planEnabled(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const { list } = await load(ctx, args.id);
    await apiOk(ctx, 'PUT', '/api/slides', list.map((s) => (s.id === args.id ? { ...s, enabled: args.enabled } : s)));
    return result({ done: true, what: plan.sentence, undo: 'To go back: read_history, then undo_change.' });
  },
};

async function planMove(ctx, { id, toPosition }) {
  const { list, slide } = await load(ctx, id);
  const from = list.findIndex((s) => s.id === id) + 1;
  const to = Math.min(Math.max(1, toPosition), list.length);
  return { ok: true, warnings: from === to ? ['It is already there; nothing will change.'] : [], errors: [], sentence: `Move ${nameOf(slide)} from position ${from} to ${to} of ${list.length}.` };
}
export const reorderSlides = {
  plan: planMove,
  async apply(ctx, args) {
    const plan = await planMove(ctx, args);
    const { list } = await load(ctx, args.id);
    const next = list.filter((s) => s.id !== args.id);
    next.splice(Math.min(Math.max(1, args.toPosition), list.length) - 1, 0, list.find((s) => s.id === args.id));
    await apiOk(ctx, 'PUT', '/api/slides', next);
    return result({ done: true, what: plan.sentence, undo: 'To go back: read_history, then undo_change.' });
  },
};

async function planSeconds(ctx, { id, seconds }) {
  const { slide } = await load(ctx, id);
  if (slide.type === 'ANNOUNCEMENT') return { ok: false, warnings: [], sentence: '', errors: ['That slide is a posted message. Change its seconds with edit_post (changes.slide.duration).'] };
  if (seconds !== 0 && seconds < SECONDS_MIN) return { ok: false, warnings: [], sentence: '', errors: [`Seconds must be ${SECONDS_MIN}-${SECONDS_MAX}, or 0 for automatic.`] };
  return { ok: true, errors: [], warnings: seconds === 0 ? ['0 means automatic, and only some slides use it.'] : [], sentence: `Set ${nameOf(slide)} to stay ${seconds === 0 ? 'as long as it needs (automatic)' : `${seconds} seconds`} (now ${slide.duration ?? 'the default'}).` };
}
export const setSlideDuration = {
  plan: planSeconds,
  async apply(ctx, args) {
    const plan = await planSeconds(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const { list } = await load(ctx, args.id);
    await apiOk(ctx, 'PUT', '/api/slides', list.map((s) => (s.id === args.id ? { ...s, duration: args.seconds } : s)));
    return result({ done: true, what: plan.sentence });
  },
};

// ── undo ────────────────────────────────────────────────────────────────────

async function rowFor(ctx, undoId) {
  const r = await apiOk(ctx, 'GET', '/api/history?limit=200');
  return (r.entries || []).find((e) => e.undo && e.undo.id === undoId) || null;
}
async function planUndo(ctx, { undoId }) {
  const row = await rowFor(ctx, undoId);
  if (!row) return { ok: false, warnings: [], sentence: '', errors: ['No undoable change has that undoId (it may be too old). Use read_history.'] };
  if (row.undo.state !== 'available') return { ok: false, warnings: [], sentence: '', errors: [row.undo.state === 'used' ? 'That change was already undone.' : `That change cannot be undone right now (${row.undo.reason || row.undo.state}).`] };
  return { ok: true, errors: [], warnings: ['If the thing was changed again since, the undo is refused and nothing is lost.'], sentence: `Undo: ${row.action}${row.detail ? ` (${row.detail})` : ''}, done by ${row.name} at ${row.at}.` };
}
export const undoChange = {
  plan: planUndo,
  async apply(ctx, args) {
    const plan = await planUndo(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const r = await apiOk(ctx, 'POST', `/api/history/${encodeURIComponent(args.undoId)}/undo`);
    return result({ done: true, undone: r.label || plan.sentence });
  },
};
