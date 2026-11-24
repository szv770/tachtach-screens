/**
 * Post tools (messages, banners, side notes, takeovers). Every change is PLANNED first with the app's own pure rules
 * (sanitizeInput / createItem / mergeItem / describeTiming), so the preview says exactly what the save would do, and APPLIED through
 * the screen's own routes (POST / PUT / DELETE /api/announcements), which re-check the person's access and write the History line.
 */
import { apiOk, tzOf, localToIso, ToolError, clip, result } from './common.js';
import { sanitizeInput, createItem, mergeItem, validateForSave, ValidationError } from '../../announcements-model.js';
import { describeTiming, primaryText, findTakeoverConflicts, status as postState } from '../../../shared/announcements.js';
import { postStatus, kindOf, KIND_LABEL, postingDefaults } from '../../../shared/postList.js';

const can = (ctx, cap) => ctx.caps.includes(cap);
const q = (s) => `“${clip(s, 100)}”`;

/** The request body the screen's API expects, from the tool's friendlier arguments (times in the school's zone). */
function buildBody(ctx, settings, { post, endsInHours, endsAtLocal, startsAtLocal }, { forNew }) {
  const tz = tzOf(settings);
  const body = JSON.parse(JSON.stringify(post || {}));
  if (endsInHours !== undefined && endsAtLocal !== undefined) throw new ToolError('Give either endsInHours or endsAtLocal, not both.');
  const when = { ...(body.when || {}) };
  if (startsAtLocal !== undefined) when.startsAt = localToIso(startsAtLocal, tz, 'startsAtLocal');
  if (endsAtLocal !== undefined) when.expiresAt = localToIso(endsAtLocal, tz, 'endsAtLocal');
  else if (endsInHours !== undefined) when.expiresAt = endsInHours === 0 ? null : new Date(ctx.now().getTime() + endsInHours * 3600_000).toISOString();
  if (Object.keys(when).length) body.when = when;
  if (forNew && body.status === undefined) body.status = postingDefaults(settings).startAs === 'draft' ? 'draft' : 'published';
  return body;
}

const problem = (e) => (e instanceof ValidationError || e instanceof ToolError ? e.message : null);

function describeItem(item, now, tz) {
  const st = postStatus(item, now, { tz });
  return `${KIND_LABEL[kindOf(item)] || 'Message'} ${q(primaryText(item))}. ${describeTiming(item, now, { tz })}. ${st.key === 'draft' ? 'Saved as a DRAFT: it will not show until it is published.' : `Status: ${st.label}.`}`;
}

function takeoverAllowed(ctx, ...items) {
  return !items.some((i) => i?.display === 'takeover') || can(ctx, 'announcements.takeover');
}

async function loadAll(ctx) {
  const [settings, items] = await Promise.all([apiOk(ctx, 'GET', '/api/settings'), apiOk(ctx, 'GET', '/api/announcements')]);
  return { settings, tz: tzOf(settings), items: Array.isArray(items) ? items : [] };
}
const findPost = (items, id) => {
  const p = items.find((i) => i.id === id);
  if (!p) throw new ToolError('No post with that id. Use list_posts to see the ids.');
  return p;
};

// ── post_message ────────────────────────────────────────────────────────────

async function planPost(ctx, args) {
  const { settings, tz, items } = await loadAll(ctx);
  const now = ctx.now();
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  let body; let item;
  try {
    body = buildBody(ctx, settings, args, { forNew: true });
    item = createItem(sanitizeInput(body), { id: 'preview' });
  } catch (e) {
    const m = problem(e); if (!m) throw e;
    out.errors.push(m); return out;
  }
  if (!takeoverAllowed(ctx, item)) { out.errors.push('Full-screen takeovers are not allowed for the person who made this connection.'); return out; }
  out.ok = true;
  out.body = body;
  out.sentence = `Post: ${describeItem(item, now, tz)}`;
  if (item.display === 'takeover') out.warnings.push('A takeover fills the WHOLE screen and pauses the slides until it ends. Make sure the person really wants that.');
  if (!item.when?.expiresAt && !item.when?.recurrence && item.status !== 'draft') out.warnings.push('It has no end time, so it stays until someone removes it.');
  const conflicts = findTakeoverConflicts({ ...item, id: 'preview' }, items, now, { tz });
  if (conflicts.length) out.warnings.push(`Another takeover is already live or scheduled at the same time: ${conflicts.map((c) => q(primaryText(c))).join(', ')}. Ask the person whether to pause it first (set_post_state).`);
  return out;
}

export const postMessage = {
  plan: planPost,
  async apply(ctx, args) {
    const plan = await planPost(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const created = await apiOk(ctx, 'POST', '/api/announcements', plan.body);
    return result({ done: true, id: created.id, status: created.status, what: plan.sentence, undo: 'If this was a mistake: read_history, then undo_change with its undoId.' });
  },
};

// ── edit_post ───────────────────────────────────────────────────────────────

async function planEdit(ctx, args) {
  const { settings, tz, items } = await loadAll(ctx);
  const now = ctx.now();
  const existing = findPost(items, args.id);
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  let body; let merged; let patch;
  try {
    body = buildBody(ctx, settings, { post: args.changes, endsInHours: args.endsInHours, endsAtLocal: args.endsAtLocal, startsAtLocal: args.startsAtLocal }, { forNew: false });
    patch = sanitizeInput(body);
    merged = validateForSave(mergeItem(existing, patch));
  } catch (e) {
    const m = problem(e); if (!m) throw e;
    out.errors.push(m); return out;
  }
  if (!Object.keys(patch).length) { out.errors.push('Nothing to change: "changes" was empty.'); return out; }
  if (!takeoverAllowed(ctx, existing, merged)) { out.errors.push('Changing a takeover is not allowed for the person who made this connection.'); return out; }
  out.ok = true;
  out.body = body;
  out.sentence = `Change ${q(primaryText(existing))} (${Object.keys(patch).join(', ')}). After the change: ${describeItem(merged, now, tz)}`;
  if (merged.display === 'takeover' && existing.display !== 'takeover') out.warnings.push('This turns the post into a full-screen takeover, which pauses the slides.');
  return out;
}

export const editPost = {
  plan: planEdit,
  async apply(ctx, args) {
    const plan = await planEdit(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const updated = await apiOk(ctx, 'PUT', `/api/announcements/${encodeURIComponent(args.id)}`, plan.body);
    return result({ done: true, id: updated.id, what: plan.sentence });
  },
};

// ── set_post_state ──────────────────────────────────────────────────────────

const STATE_WORDS = { pause: 'Pause', resume: 'Show again (switch on)', publish: 'Publish the draft', end_now: 'End now', show_again: 'Put back on the screen from now' };

async function planState(ctx, args) {
  const { tz, items } = await loadAll(ctx);
  const now = ctx.now();
  const post = findPost(items, args.id);
  const out = { ok: false, sentence: '', warnings: [], errors: [] };
  const st = postState(post, now, { tz });
  if (!takeoverAllowed(ctx, post) && ['resume', 'publish', 'show_again'].includes(args.state)) { out.errors.push('Putting a takeover on the screen is not allowed for the person who made this connection.'); return out; }
  let request;
  if (args.state === 'pause') request = { method: 'PUT', body: { enabled: false } };
  else if (args.state === 'resume') request = { method: 'PUT', body: { enabled: true } };
  else if (args.state === 'publish') {
    if (post.status !== 'draft') { out.errors.push('That post is not a draft.'); return out; }
    request = { method: 'PUT', body: { status: 'published' } };
  } else if (args.state === 'end_now') {
    if (st === 'scheduled' && post.when?.startsAt && Date.parse(post.when.startsAt) > now.getTime()) { out.errors.push('It has not started yet. Use pause, or delete_post.'); return out; }
    if (st === 'archived') { out.errors.push('It has already ended.'); return out; }
    request = { method: 'PUT', body: { when: { expiresAt: now.toISOString() } } };
  } else {
    request = { method: 'POST', path: '/reactivate', body: args.showAgainForHours ? { durationMin: args.showAgainForHours * 60 } : {} };
  }
  out.ok = true;
  out.request = request;
  out.sentence = `${STATE_WORDS[args.state]}: ${q(primaryText(post))} (${kindOf(post)}, currently ${postStatus(post, now, { tz }).key}).${args.state === 'show_again' ? (args.showAgainForHours ? ` For ${args.showAgainForHours} hours.` : ' Until removed.') : ''}`;
  if (post.display === 'takeover' && ['resume', 'publish', 'show_again'].includes(args.state)) out.warnings.push('This is a full-screen takeover: it will cover everything and pause the slides.');
  return out;
}

export const setPostState = {
  plan: planState,
  async apply(ctx, args) {
    const plan = await planState(ctx, args);
    if (!plan.ok) throw new ToolError(plan.errors.join(' '));
    const path = `/api/announcements/${encodeURIComponent(args.id)}${plan.request.path || ''}`;
    await apiOk(ctx, plan.request.method, path, plan.request.body);
    return result({ done: true, what: plan.sentence });
  },
};

// ── delete_post ─────────────────────────────────────────────────────────────

async function planDelete(ctx, args) {
  const { tz, items } = await loadAll(ctx);
  const post = findPost(items, args.id);
  return {
    ok: true,
    warnings: ['Deleting removes it from the lists. It can be undone for a while with undo_change. If the person only wants it off the screen, pausing or ending it is gentler.'],
    errors: [],
    sentence: `Delete ${q(primaryText(post))} (${kindOf(post)}, ${postStatus(post, ctx.now(), { tz }).key}).`,
  };
}

export const deletePost = {
  plan: planDelete,
  async apply(ctx, args) {
    const plan = await planDelete(ctx, args);
    await apiOk(ctx, 'DELETE', `/api/announcements/${encodeURIComponent(args.id)}`);
    return result({ done: true, what: plan.sentence, undo: 'To bring it back: read_history, then undo_change with its undoId.' });
  },
};
