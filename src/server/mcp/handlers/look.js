/**
 * update_look_and_settings: the short typed list in src/shared/mcpTools/lookSettings.js becomes ONE settings patch, previewed as
 * "name: before -> after" lines, checked against the person's access and the server's own settings rules, then saved with
 * PATCH /api/settings (which keeps its own validation, the History line, Undo and the live update).
 */
import { apiOk, ToolError, result } from './common.js';
import { LOOK_FIELDS, patchFromChanges } from '../../../shared/mcpTools/lookSettings.js';
import { validateSettingsPatch } from '../../../shared/settingsMerge.js';
import { canDo } from '../../../shared/permissions.js';

const show = (v) => (v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(', ') : String(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function plan(ctx, { changes }) {
  const out = { ok: false, sentence: '', warnings: [], errors: [], changes: [] };
  const keys = Object.keys(changes || {});
  if (!keys.length) { out.errors.push('Nothing to change: "changes" was empty.'); return out; }
  const settings = await apiOk(ctx, 'GET', '/api/settings');
  for (const key of keys) {
    const f = LOOK_FIELDS[key];
    if (!f) { out.errors.push(`${key} is not a setting an AI connection can change.`); continue; }
    const before = f.read(settings);
    let after = changes[key];
    if (f.schema.type === 'object') after = { ...before, ...changes[key] };
    if (same(before, after)) { out.warnings.push(`${f.label} is already ${show(before)}: no change.`); continue; }
    out.changes.push({ setting: f.label, from: show(before), to: show(after) });
    if (f.warn) out.warnings.push(`${f.label}: ${f.warn}`);
  }
  if (out.errors.length) return out;
  if (!out.changes.length) { out.errors.push('Everything you asked for is already set that way, so nothing would change.'); return out; }
  const patch = patchFromChanges(Object.fromEntries(keys.filter((k) => out.changes.some((c) => c.setting === LOOK_FIELDS[k].label)).map((k) => [k, changes[k]])));
  const v = validateSettingsPatch(patch);
  if (!v.ok) { out.errors.push(v.error); return out; }
  if (ctx.user && !canDo(ctx.user, 'PATCH', '/api/settings', patch)) {
    out.errors.push('The person who made this connection does not have access to change these settings.');
    return out;
  }
  out.ok = true;
  out.patch = patch;
  out.sentence = `Change ${out.changes.length === 1 ? 'one setting' : `${out.changes.length} settings`}: ${out.changes.map((c) => `${c.setting}: ${c.from} → ${c.to}`).join('; ')}. It shows on the TV straight away.`;
  return out;
}

export const updateLook = {
  plan,
  async apply(ctx, args) {
    const p = await plan(ctx, args);
    if (!p.ok) throw new ToolError(p.errors.join(' '));
    await apiOk(ctx, 'PATCH', '/api/settings', p.patch);
    return result({ done: true, changed: p.changes, undo: 'To go back: read_history, then undo_change.' });
  },
};
