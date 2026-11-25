/**
 * One place that runs a tool call, in this order (so nothing can skip a step):
 *   1. the tool must exist AND be visible to this connection (look-only keys never see change tools)
 *   2. the arguments are checked against the tool's schema (plain sentences)
 *   3. read tool -> run it. preview_change -> plan the change with the app's own rules, return the sentence + previewId.
 *      change tool -> the previewId must match these exact arguments for this connection, then apply through the screen's own API.
 * A problem is returned as an error result with a plain sentence for the AI to relay, never a stack trace.
 */
import { toolByName, toolsFor } from '../../shared/mcpTools/catalogue.js';
import { validateArgs } from '../../shared/mcpTools/validate.js';
import { previewSigner, REFUSAL } from './previewToken.js';
import { ToolError, failure, result } from './handlers/common.js';
import * as read from './handlers/read.js';
import { postMessage, editPost, setPostState, deletePost } from './handlers/posts.js';
import { scheduleReplaceWeek, scheduleSetDays, scheduleClearDay, scheduleChangeDay, scheduleChangeWeek } from './handlers/schedule.js';
import { screenControl, freezeScreen, resumeScreen } from './handlers/screen.js';
import { setSlideEnabled, reorderSlides, setSlideDuration, undoChange } from './handlers/slides.js';
import { listDaily, addDaily, removeDaily, setDailyToday } from './handlers/daily.js';
import { updateLook } from './handlers/look.js';

const READS = {
  get_capabilities: read.getCapabilities,
  describe_options: read.describe,
  get_overview: read.getOverview,
  list_slides: read.listSlides,
  get_schedule: read.getSchedule,
  list_posts: read.listPosts,
  get_settings: read.getSettings,
  read_history: read.readHistory,
  get_format_guide: read.getFormatGuide,
  list_daily_content: listDaily,
};

export const CHANGES = {
  schedule_replace_week: scheduleReplaceWeek,
  schedule_set_days: scheduleSetDays,
  schedule_clear_day: scheduleClearDay,
  schedule_change_day: scheduleChangeDay,
  schedule_change_week: scheduleChangeWeek,
  screen_control: screenControl,
  freeze_screen: freezeScreen,
  resume_screen: resumeScreen,
  post_message: postMessage,
  edit_post: editPost,
  set_post_state: setPostState,
  delete_post: deletePost,
  set_slide_enabled: setSlideEnabled,
  reorder_slides: reorderSlides,
  set_slide_duration: setSlideDuration,
  add_daily_content: addDaily,
  remove_daily_content: removeDaily,
  set_daily_today: setDailyToday,
  update_look_and_settings: updateLook,
  undo_change: undoChange,
};

const withoutPreviewId = (schema) => ({
  ...schema,
  properties: Object.fromEntries(Object.entries(schema.properties || {}).filter(([k]) => k !== 'previewId')),
  required: (schema.required || []).filter((k) => k !== 'previewId'),
});

async function previewChange(ctx, args, signer, visible) {
  const target = toolByName(args.tool);
  if (!target || target.risk === 'read' || !CHANGES[args.tool]) throw new ToolError(`"${args.tool}" is not a tool that changes anything.`);
  if (!visible.has(args.tool)) throw new ToolError(`This connection cannot use ${args.tool}. Call get_capabilities to see what it can do.`);
  const targetArgs = { ...(args.args || {}) };
  delete targetArgs.previewId;
  const v = validateArgs(withoutPreviewId(target.inputSchema), targetArgs);
  if (!v.ok) return result({ ok: false, problems: v.errors, nextStep: 'Fix these and call preview_change again.' });
  const plan = await CHANGES[args.tool].plan(ctx, targetArgs);
  if (!plan.ok) return result({ ok: false, problems: plan.errors, warnings: plan.warnings || [], nextStep: 'Nothing was saved. Fix these with the person and preview again.' });
  const previewId = signer.make({ connectionId: ctx.connectionId, tool: args.tool, args: targetArgs });
  return result({
    ok: true,
    tool: args.tool,
    previewId,
    validForMinutes: 10,
    whatWillHappen: plan.sentence,
    warnings: plan.warnings || [],
    ...(plan.newWeek ? { newWeek: plan.newWeek } : {}),
    ...(plan.days ? { days: plan.days } : {}),
    nextStep: `Nothing has been changed yet. Read "whatWillHappen" (and any warnings) to the person. If they agree, call ${args.tool} with exactly these arguments plus previewId.`,
  });
}

export function createDispatcher({ signer = previewSigner } = {}) {
  return async function callTool(ctx, name, rawArgs) {
    const visible = new Set(toolsFor({ caps: ctx.caps, mode: ctx.mode }).map((t) => t.name));
    const tool = toolByName(name);
    if (!tool || !visible.has(name)) return failure(`This connection cannot use "${name}". Call get_capabilities to see what it can do.`);
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const v = validateArgs(tool.inputSchema, args);
    if (!v.ok) return failure(`There are problems with the arguments: ${v.errors.join(' ')}`);
    try {
      if (name === 'preview_change') return await previewChange(ctx, args, signer, visible);
      if (READS[name]) return await READS[name](ctx, args);
      const chk = signer.check(args.previewId, { connectionId: ctx.connectionId, tool: name, args });
      if (!chk.ok) return failure(REFUSAL[chk.reason] || REFUSAL.invalid);
      return await CHANGES[name].apply(ctx, args);
    } catch (e) {
      if (e instanceof ToolError) return failure(e.message);
      console.error(`[mcp] ${name}:`, e?.message || e);
      return failure('Something went wrong on the screen\'s side. Nothing was changed. Try again, or use the admin.');
    }
  };
}
