/**
 * The tools an AI connection offers (pure data, shared by the box, the hub and the tests).
 *
 * A tool is a plain object:
 *   name, title, description   what the AI reads. The description says what to ASK the person before using it.
 *   area                        a key of areas.js (one admin section)
 *   risk                        'read' | 'change' | 'delete'. Drives the MCP annotations, so the AI app asks the person to tap Allow.
 *   needs                       capabilities (any one of them). [] = no extra capability (the API still decides)
 *   privacy                     'none' | 'names'. Tools that return names are not in this wave (names are blocked).
 *   inputSchema                 JSON Schema (validated by validate.js, then again by the real server rules)
 *
 * Every CHANGE tool needs a `previewId` from preview_change for the same arguments (src/server/mcp/previewToken.js).
 * Built from the real constants of the app (layouts, styles, limits), so a new one shows up here without hand-copying.
 */
import { DISPLAYS, LAYOUTS, STATUSES, TAKEOVER_TURNS_GROUP } from '../announcements.js';
import { SCREEN_COMMANDS } from '../screenCommands.js';
import { MODES as FREEZE_MODES, STYLES as FREEZE_STYLES, MAX_MESSAGE as FREEZE_MESSAGE_MAX, MAX_MINUTES as FREEZE_MAX_MINUTES } from '../freeze.js';
import { STYLE_IDS, ANIMATIONS } from '../takeoverStyles.js';
import { SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX } from '../postList.js';
import { LOOK_CHANGES_SCHEMA } from './lookSettings.js';

/** Layouts a post can use through the connector. sicha / letter need long structured text: that is Daily Letter, a later wave. */
export const NOT_YET_LAYOUTS = Object.freeze({ sicha: 'long excerpt layouts come with the Daily Story / Letter tools', letter: 'letters come with the Daily Letter tools' });
export const CONNECTOR_LAYOUTS = Object.freeze(LAYOUTS.filter((l) => !(l in NOT_YET_LAYOUTS)));

const S = (description, max = 300) => ({ type: 'string', description, maxLength: max });
const obj = (properties, required = [], description) => ({ type: 'object', properties, required, additionalProperties: false, ...(description ? { description } : {}) });

const PREVIEW_ID = { type: 'string', description: 'The previewId that preview_change returned for exactly these arguments. A change is refused without it.', maxLength: 400 };
const ISO_DATE = { type: 'string', description: 'A date like 2026-11-24.', pattern: '^\\d{4}-\\d{2}-\\d{2}$', maxLength: 10 };
const LOCAL_TIME = { type: 'string', description: 'A date and time in the SCHOOL\'s time zone like 2026-11-24T15:00 (not UTC).', maxLength: 16 };

/** Post fields, one-to-one with the announcement model (src/server/announcements-model.js sanitizeInput). */
const CONTENT = obj({
  headlineEn: S('The main line in English.', 4000),
  headlineHe: S('The main line in Hebrew.', 4000),
  bodyEn: S('More text in English.', 4000),
  bodyHe: S('More text in Hebrew.', 4000),
  subtitle: S('A small line under the headline.'),
  attribution: S('Who said it, for quotes.'),
  target: S('Who it is for (a small line), English.'),
  targetHe: S('Who it is for, Hebrew.'),
  event: obj({ title: S('Event name'), titleHe: S('Event name in Hebrew'), day: S('Day, for example Thursday'), dayHe: S('Day in Hebrew'), time: S('Time as HH:MM, 24 hour'), place: S('Place'), place2: S('Second line of the place'), placeHe: S('Place in Hebrew') }, [], 'For the "event" layout.'),
  list: obj({ heading: S('List heading'), headingHe: S('List heading in Hebrew'), items: { type: 'array', maxItems: 8, items: S('One line', 600), description: 'At most 8 lines.' } }, [], 'For the "list" layout.'),
  quote: obj({ text: S('The quote'), textHe: S('The quote in Hebrew'), source: S('Where it is from'), sourceHe: S('Source in Hebrew') }, [], 'For the "quote" layout.'),
  notice: obj({ pre: S('Text before the highlighted words'), focus: S('The highlighted words'), post: S('Text after'), preHe: S('Hebrew before'), focusHe: S('Hebrew highlighted'), postHe: S('Hebrew after') }, [], 'For the "notice" layout.'),
  quicktime: obj({ time: S('Time as HH:MM'), time2: S('Second time as HH:MM'), was: S('Old time as HH:MM'), name: S('Name'), nameHe: S('Name in Hebrew'), place: S('Place'), placeHe: S('Place in Hebrew'), big: S('Big text'), bigLabel: S('Label under the big text'), label: S('Label'), labelHe: S('Label in Hebrew'), pre: S('Text before') }, [], 'For the "quicktime" layout (a time change).'),
});

const POST = obj({
  display: { type: 'string', enum: DISPLAYS, description: 'slide = a message in the rotation; banner = a strip along the screen that never pauses the slides; note = a small side note; takeover = fills the WHOLE screen and pauses everything.' },
  status: { type: 'string', enum: ['published', 'draft'], description: 'published = goes live; draft = saved but never shown.' },
  hold: { type: 'boolean', description: 'A slide that holds the screen (pauses the rotation while it is live).' },
  content: CONTENT,
  look: obj({
    layout: { type: 'string', enum: CONNECTOR_LAYOUTS, description: 'How the text is laid out. See describe_options("announcements").' },
    style: { type: 'string', enum: STYLE_IDS, description: 'The look of a takeover (26 styles).' },
    animation: { type: 'string', enum: ANIMATIONS, description: 'Takeover motion: full, entrance only, or off.' },
    fit: { type: 'string', enum: ['auto', 'fixed'], description: 'auto = the text is sized to fit the screen (default); fixed = use maxFontPx as is.' },
    maxFontPx: { type: 'integer', minimum: 12, maximum: 400, description: 'The biggest the text may be (pixels).' },
    fullscreen: { type: 'boolean', description: 'Hide the side column and use the whole screen (notes and plain takeovers).' },
  }),
  note: obj({ icon: S('A small icon name for a side note.', 40) }),
  slide: obj({ duration: { type: 'integer', minimum: 0, maximum: SECONDS_MAX, description: `Seconds a slide stays on screen (${SECONDS_MIN}-${SECONDS_MAX}); 0 = automatic.` } }),
  banner: obj({ mode: { type: 'string', enum: ['still', 'scroll'] }, speed: { type: 'string', enum: ['slow', 'normal', 'fast'] } }),
  takeover: obj({
    rotateSec: { type: 'integer', minimum: 3, maximum: 300, description: 'Seconds each takeover stays when several share the screen.' },
    group: { type: 'string', enum: [TAKEOVER_TURNS_GROUP, ''], description: `"${TAKEOVER_TURNS_GROUP}" = this takeover takes turns full screen with other takeovers that have it; an empty string = not.` },
  }),
  when: obj({
    startsAt: { type: 'string', description: 'Start, as an exact UTC time like 2026-11-24T20:00:00Z. Easier: use startsAtLocal.', maxLength: 40 },
    expiresAt: { type: 'string', description: 'End, as an exact UTC time. Easier: use endsInHours or endsAtLocal.', maxLength: 40 },
    recurrence: obj({
      days: { type: 'array', maxItems: 7, items: S('Sun, Mon, Tue, Wed, Thu, Fri or Sat', 12) },
      monthDays: { type: 'array', maxItems: 31, items: { type: 'integer', minimum: 1, maximum: 31 } },
      windows: { type: 'array', maxItems: 8, items: obj({ start: S('HH:MM', 5), end: S('HH:MM', 5) }) },
      from: ISO_DATE,
      until: ISO_DATE,
    }, [], 'Repeat on certain days and between certain times.'),
  }),
}, [], 'The post, in the same shape the admin saves.');

const TIMING = {
  endsInHours: { type: 'integer', minimum: 0, maximum: END_HOURS_MAX, description: 'Take it down after this many hours from now. 0 = until someone removes it.' },
  endsAtLocal: LOCAL_TIME,
  startsAtLocal: LOCAL_TIME,
  until: { type: 'string', enum: ['end_of_today', 'end_of_shabbos'], description: 'A quick end: the end of today (11:59 PM, school time) or the end of Shabbos (nightfall). Instead of endsInHours / endsAtLocal.' },
};

const BLOCK_MATCH = obj({
  id: S('The block id from get_schedule.', 80),
  name: S('Its name (English or Hebrew), for example Seder or Mincha.', 120),
  time: S('Its start time, to tell apart blocks that share a name, for example 10:30 AM.', 20),
  days: { type: 'array', maxItems: 7, items: S('Sun, Mon, Tue, Wed, Thu, Fri or Shabbos', 12), description: 'Only for the regular weekly timetable: which days.' },
}, [], 'Which block. Give its id, or its name (plus its time or days if the name is used more than once). If it is not exactly one block you are told the candidates.');
const BLOCK_SET = obj({
  time: S('New start time, for example 1:45 PM or 13:45. A range such as 10:30-11:45 AM sets the end too.', 40),
  endTime: S('New end time, or an empty string to remove the end time.', 20),
  name: S('New English name.', 200), nameHe: S('New Hebrew name.', 200), category: S('One of the school\'s categories (see get_schedule).', 60),
  alertBefore: { type: 'integer', minimum: 0, maximum: 120, description: 'Minutes before the block to show the alert (0 = none).' },
  enabled: { type: 'boolean', description: 'false switches the block off (cancelled), true switches it back on.' },
});
const NEW_BLOCK = obj({
  time: S('Start time, for example 4:00 PM, or a range like 4:00-4:30 PM.', 40), endTime: S('End time (optional).', 20), name: S('English name.', 200), nameHe: S('Hebrew name.', 200),
  category: S('One of the school\'s categories.', 60), alertBefore: { type: 'integer', minimum: 0, maximum: 120 },
  days: { type: 'array', maxItems: 7, items: S('Sun, Mon, Tue, Wed, Thu, Fri or Shabbos', 12), description: 'Only for the weekly timetable (empty = every day).' },
}, ['time']);
const BLOCK_OPS = {
  type: 'array', minItems: 1, maxItems: 30, description: 'What to do, in order. Several can be given at once.',
  items: { type: 'object', additionalProperties: false, required: ['op'], properties: {
    op: { type: 'string', enum: ['cancel', 'remove', 'change', 'add'], description: 'cancel = switch the block off (for one day: that day only); remove = take it out; change = new time / name / category; add = a new block.' },
    match: BLOCK_MATCH, set: BLOCK_SET, entry: NEW_BLOCK,
  } },
};

const CHANGE_TOOLS = ['schedule_replace_week', 'schedule_set_days', 'schedule_clear_day', 'schedule_change_day', 'schedule_change_week', 'screen_control', 'freeze_screen', 'resume_screen', 'post_message', 'edit_post', 'set_post_state', 'delete_post', 'set_slide_enabled', 'reorder_slides', 'set_slide_duration', 'add_daily_content', 'remove_daily_content', 'set_daily_today', 'update_look_and_settings', 'undo_change'];

/** The areas describe_options can explain (describe.js builds one for each; a test keeps them equal). */
export const DESCRIBE_AREAS = Object.freeze(['announcements', 'schedule', 'slides', 'history', 'home', 'daily-story', 'daily-word', 'daily-letter', 'themes', 'style', 'layout', 'motion', 'shows', 'this-screen']);
export const DAILY_KINDS = Object.freeze(['story', 'word', 'letter']);
const KIND = { type: 'string', enum: DAILY_KINDS, description: 'story = Daily Story (stories and thoughts), word = Daily Word, letter = Daily Letter.' };

export const TOOLS = Object.freeze([
  // ── Read ────────────────────────────────────────────────────────────────────
  { name: 'get_capabilities', title: 'What can I do here?', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'START HERE. Lists every part of the admin, what this connection can do in each (and which tools), what is not possible and why, and what is not available yet. Call it first, and again if the person asks "can you do X?". Do not guess.',
    inputSchema: obj({}) },
  { name: 'describe_options', title: 'What are the choices?', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'The real choices for one area, with plain descriptions, this school\'s own defaults, the limits and the questions to ASK the person before you change anything there. Call it before every change in that area and ask the person about each choice that matters (for example: banner or full slide? how long should it stay up? Hebrew too?).',
    inputSchema: obj({ area: { type: 'string', enum: DESCRIBE_AREAS, description: 'Which part of the admin.' } }, ['area']) },
  { name: 'get_overview', title: 'What is on the screen now?', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'The school\'s current time, whether the TV is online and what slide it is showing, the posts that are live now, today\'s next schedule items and the slides in the rotation.',
    inputSchema: obj({}) },
  { name: 'list_slides', title: 'List the slides', area: 'slides', risk: 'read', needs: [], privacy: 'none',
    description: 'The rotation in order: id, type, name, on or off and how many seconds. Use the ids with the slide tools.',
    inputSchema: obj({}) },
  { name: 'get_schedule', title: 'Read the schedule', area: 'schedule', risk: 'read', needs: [], privacy: 'none',
    description: 'The weekly timetable, or what the schedule is on one date (a one-day change replaces the weekly one), or a range of dates that have one-day changes.',
    inputSchema: obj({ date: ISO_DATE, from: ISO_DATE, to: ISO_DATE, weekly: { type: 'boolean', description: 'true = the weekly timetable.' } }) },
  { name: 'list_posts', title: 'List the posts', area: 'announcements', risk: 'read', needs: [], privacy: 'none',
    description: 'Messages, banners, side notes and takeovers with their id, kind, status (live, scheduled, paused, draft, ended), text and timing.',
    inputSchema: obj({ status: { type: 'string', enum: ['live', 'scheduled', 'paused', 'draft', 'ended'] }, kind: { type: 'string', enum: ['slide', 'banner', 'note', 'takeover'] } }) },
  { name: 'get_settings', title: 'Read the main settings', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'The screen name, time zone, theme, orientation and this school\'s posting defaults. Location details and web links are not included.',
    inputSchema: obj({}) },
  { name: 'read_history', title: 'Recent changes', area: 'history', risk: 'read', needs: [], privacy: 'none',
    description: 'Who changed what and when, newest first. Changes made through an AI say so. Rows that can be undone carry an undoId for undo_change.',
    inputSchema: obj({ limit: { type: 'integer', minimum: 1, maximum: 50 } }) },
  { name: 'get_format_guide', title: 'The text and entry formats', area: 'schedule', risk: 'read', needs: [], privacy: 'none',
    description: 'The exact format the schedule tools accept (with this school\'s categories and groups), or the exact fields and limits for Daily Story / Word / Letter entries. Read it before you write schedule text or daily content.',
    inputSchema: obj({ kind: { type: 'string', enum: ['week', 'days', 'story', 'word', 'letter'], description: 'week = a weekly timetable; days = dated days (Shabbos, Yom Tov); story / word / letter = the exact fields and limits for adding Daily content.' } }, ['kind']) },
  { name: 'preview_change', title: 'Preview a change', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'Shows, in a plain sentence, exactly what a change tool would do, WITHOUT doing it, and returns the previewId that tool needs. Always preview, read the sentence back to the person, and only make the change after they agree. Nothing is saved by this call.',
    inputSchema: obj({ tool: { type: 'string', enum: CHANGE_TOOLS, description: 'The change tool to preview.' }, args: { type: 'object', additionalProperties: true, description: 'The arguments you would give that tool (without previewId).' } }, ['tool', 'args']) },

  // ── Schedule ────────────────────────────────────────────────────────────────
  { name: 'schedule_replace_week', title: 'Replace the weekly schedule', area: 'schedule', risk: 'change', needs: ['schedule.edit'], privacy: 'none',
    description: 'Replace the WHOLE weekly timetable with text in the TachTach schedule format (see get_format_guide). The old week is saved as an automatic backup template first. Ask the person to confirm the whole week before using this.',
    inputSchema: obj({ text: S('The weekly schedule text.', 60000), previewId: PREVIEW_ID }, ['text', 'previewId']) },
  { name: 'schedule_set_days', title: 'Set the schedule for certain dates', area: 'schedule', risk: 'change', needs: ['schedule.edit'], privacy: 'none',
    description: 'Set the schedule for one or more specific dates (for example Shabbos or a Yom Tov), as text in the TachTach schedule format (see get_format_guide). It replaces those dates only. All-or-nothing.',
    inputSchema: obj({ text: S('The dated schedule text.', 60000), previewId: PREVIEW_ID }, ['text', 'previewId']) },
  { name: 'schedule_change_day', title: 'Change one day\'s schedule (cancel, move, add a block)', area: 'schedule', risk: 'change', needs: ['schedule.edit'], privacy: 'none',
    description: 'Change blocks of ONE date without rewriting the schedule: cancel a block for that day only (for example the 10:30 Seder today), remove one, change a block\'s start or end time or name, or add a one-off block. The weekly timetable is NOT touched. FIRST call get_schedule for that date, ASK the person which block and what the new time is, and whether it is for that day only (this tool) or every week (schedule_change_week). Preview shows the day before and after.',
    inputSchema: obj({ date: S('today, tomorrow, or a date like 2026-11-26.', 12), ops: BLOCK_OPS, label: S('Optional name for that day, for example "Erev Chanukah".', 120), previewId: PREVIEW_ID }, ['date', 'ops', 'previewId']) },
  { name: 'schedule_change_week', title: 'Change the regular weekly timetable (move, cancel, add a block)', area: 'schedule', risk: 'change', needs: ['schedule.edit'], privacy: 'none',
    description: 'Change blocks of the REGULAR weekly timetable, which repeats every week: change a block\'s time or name, switch one off, remove one or add one (with its days). This changes every week from now on, so confirm that is what the person wants; for a single day use schedule_change_day. The old week is backed up automatically.',
    inputSchema: obj({ ops: BLOCK_OPS, previewId: PREVIEW_ID }, ['ops', 'previewId']) },
  { name: 'schedule_clear_day', title: 'Go back to the weekly schedule for a date', area: 'schedule', risk: 'delete', needs: ['schedule.edit'], privacy: 'none',
    description: 'Remove the one-day change for a date, so that date uses the weekly timetable again.',
    inputSchema: obj({ date: ISO_DATE, previewId: PREVIEW_ID }, ['date', 'previewId']) },

  // ── Posts ───────────────────────────────────────────────────────────────────
  { name: 'post_message', title: 'Post a message', area: 'announcements', risk: 'change', needs: ['announcements.post'], privacy: 'none',
    description: 'Post a message slide, banner, side note or full-screen takeover. FIRST call describe_options("announcements") and ASK the person: what kind (slide, banner, side note, takeover), the text (English, Hebrew or both), how long it should stay up, and whether it repeats. A takeover fills the whole screen and pauses everything, so confirm it clearly. Preview, read it back, then post.',
    inputSchema: obj({ post: POST, ...TIMING, ifTakeoverConflict: { type: 'string', enum: ['replace', 'share', 'queue'], description: 'If another takeover is live or scheduled at the same time: replace = pause the other one(s); share = they take turns full screen; queue = this one starts when the other ends (the other needs an end time). Ask the person.' }, previewId: PREVIEW_ID }, ['post', 'previewId']) },
  { name: 'edit_post', title: 'Change a post', area: 'announcements', risk: 'change', needs: ['announcements.edit'], privacy: 'none',
    description: 'Change fields of an existing post (use list_posts for the id). Only the fields you give are changed.',
    inputSchema: obj({ id: S('The post id.', 80), changes: POST, ...TIMING, previewId: PREVIEW_ID }, ['id', 'changes', 'previewId']) },
  { name: 'set_post_state', title: 'Pause, end, publish or show a post again', area: 'announcements', risk: 'change', needs: ['announcements.edit'], privacy: 'none',
    description: 'pause = hide it for now; resume = show it again; publish = make a draft live; end_now = end it now; show_again = put an ended or paused post back on the screen from now (optionally for a number of hours).',
    inputSchema: obj({ id: S('The post id.', 80), state: { type: 'string', enum: ['pause', 'resume', 'publish', 'end_now', 'show_again'] }, showAgainForHours: { type: 'integer', minimum: 1, maximum: END_HOURS_MAX, description: 'For show_again: how many hours. Leave out for until removed.' }, previewId: PREVIEW_ID }, ['id', 'state', 'previewId']) },
  { name: 'delete_post', title: 'Delete a post', area: 'announcements', risk: 'delete', needs: ['announcements.delete'], privacy: 'none',
    description: 'Delete a post for good (it can be undone for a while with undo_change). Prefer set_post_state end_now or pause if the person only wants it off the screen.',
    inputSchema: obj({ id: S('The post id.', 80), previewId: PREVIEW_ID }, ['id', 'previewId']) },

  // ── Slides ──────────────────────────────────────────────────────────────────
  { name: 'set_slide_enabled', title: 'Switch a slide on or off', area: 'slides', risk: 'change', needs: ['slides.edit'], privacy: 'none',
    description: 'Switch one slide on or off in the rotation (use list_slides for the id).',
    inputSchema: obj({ id: S('The slide id.', 80), enabled: { type: 'boolean' }, previewId: PREVIEW_ID }, ['id', 'enabled', 'previewId']) },
  { name: 'reorder_slides', title: 'Move a slide', area: 'slides', risk: 'change', needs: ['slides.edit'], privacy: 'none',
    description: 'Move one slide to a position in the rotation (1 = first).',
    inputSchema: obj({ id: S('The slide id.', 80), toPosition: { type: 'integer', minimum: 1, maximum: 200 }, previewId: PREVIEW_ID }, ['id', 'toPosition', 'previewId']) },
  { name: 'set_slide_duration', title: 'Set how long a slide stays', area: 'slides', risk: 'change', needs: ['slides.edit'], privacy: 'none',
    description: `How many seconds one slide stays on screen (${SECONDS_MIN}-${SECONDS_MAX}; 0 = automatic for slides that allow it).`,
    inputSchema: obj({ id: S('The slide id.', 80), seconds: { type: 'integer', minimum: 0, maximum: SECONDS_MAX }, previewId: PREVIEW_ID }, ['id', 'seconds', 'previewId']) },

  // ── Daily content ───────────────────────────────────────────────────────────
  { name: 'list_daily_content', title: 'List the Daily Story / Word / Letter entries', area: 'daily-story', alsoAreas: ['daily-word', 'daily-letter'], risk: 'read', needs: ['dailyWord.edit'], privacy: 'none',
    description: 'The entries on the Daily Story, Daily Word or Daily Letter list (id, title, whether it has a source, whether it is on) and what shows TODAY. Use the ids with the other daily tools. Letters are summarised, not printed in full.',
    inputSchema: obj({ kind: KIND, limit: { type: 'integer', minimum: 1, maximum: 200 } }, ['kind']) },
  { name: 'add_daily_content', title: 'Add Daily Story / Word / Letter entries', area: 'daily-story', alsoAreas: ['daily-word', 'daily-letter'], risk: 'change', needs: ['dailyWord.edit'], privacy: 'none',
    description: 'Add entries to the Daily Story, Daily Word or Daily Letter list in bulk. NEVER write a story, word meaning or letter from memory. Use only text the person gave you, or what you can cite with an exact, checkable source (a story with no source is saved hidden). Letters must be copied EXACTLY, never shortened or reworded. Call get_format_guide for the fields, ASK the person where each entry comes from, preview, read it back. mode "append" adds to the end (duplicates are skipped); "replace" swaps the WHOLE list (confirm clearly; it can be undone).',
    inputSchema: obj({
      kind: KIND,
      items: { type: 'array', maxItems: 50, description: 'The entries, as objects (see get_format_guide).', items: { type: 'object', additionalProperties: true } },
      mode: { type: 'string', enum: ['append', 'replace'], description: 'append (default) or replace the whole list.' },
      previewId: PREVIEW_ID,
    }, ['kind', 'items', 'previewId']) },
  { name: 'remove_daily_content', title: 'Remove Daily Story / Word / Letter entries', area: 'daily-story', alsoAreas: ['daily-word', 'daily-letter'], risk: 'delete', needs: ['dailyWord.edit'], privacy: 'none',
    description: 'Remove entries from a daily list by id (list_daily_content shows the ids). It can usually be undone with undo_change. If the person only wants an entry off the screen, switching it off in the admin or using set_daily_today is gentler.',
    inputSchema: obj({ kind: KIND, ids: { type: 'array', minItems: 1, maxItems: 50, items: S('An entry id.', 80) }, previewId: PREVIEW_ID }, ['kind', 'ids', 'previewId']) },
  { name: 'set_daily_today', title: 'Change what shows today', area: 'daily-story', alsoAreas: ['daily-word', 'daily-letter'], risk: 'change', needs: ['dailyWord.edit'], privacy: 'none',
    description: 'Change today\'s Daily Story / Word / Letter: pick = show a particular entry (give its id); random = a different one; hide = show none today; automatic = go back to the normal rotation. This cannot be undone with undo_change, but "automatic" puts it back.',
    inputSchema: obj({ kind: KIND, op: { type: 'string', enum: ['pick', 'random', 'hide', 'automatic'] }, id: S('The entry id (for pick).', 80), previewId: PREVIEW_ID }, ['kind', 'op', 'previewId']) },

  // ── Screen control ──────────────────────────────────────────────────────────
  { name: 'screen_control', title: 'Pause, resume, skip or blank the TV', area: 'home', risk: 'change', needs: ['screen.control'], privacy: 'none',
    description: 'Control the real TV right now: pause (stay on this slide), resume, advance (next slide), previous, or blank (toggle a black screen). It affects what everyone in the room sees, so confirm. For a timed blank or a freeze message use freeze_screen.',
    inputSchema: obj({ action: { type: 'string', enum: SCREEN_COMMANDS }, previewId: PREVIEW_ID }, ['action', 'previewId']) },
  { name: 'freeze_screen', title: 'Blank, freeze or put a message on the TV', area: 'home', risk: 'change', needs: ['screen.control'], privacy: 'none',
    description: 'Take over the TV: blank = black screen, logo = only the logo, freeze = stop on what is showing, message = a plain notice (give message). Ask the person for how long (30 minutes, 1 hour, a number of minutes, until a clock time, until tomorrow morning, or until someone resumes). Emergency takeovers still show through. resume_screen ends it.',
    inputSchema: obj({
      mode: { type: 'string', enum: FREEZE_MODES },
      message: S('For mode "message": the text (a short line).', FREEZE_MESSAGE_MAX),
      style: { type: 'string', enum: FREEZE_STYLES, description: 'plain (default) or terminal.' },
      for: { type: 'string', enum: ['30m', '1h', 'minutes', 'at', 'tomorrow', 'until_removed'], description: 'How long. minutes needs "minutes"; at needs "at".' },
      minutes: { type: 'integer', minimum: 1, maximum: FREEZE_MAX_MINUTES },
      at: S('A clock time in the school\'s zone, 24 hour, like 07:15 (the next time the clock reads it).', 5),
      previewId: PREVIEW_ID,
    }, ['mode', 'previewId']) },
  { name: 'resume_screen', title: 'End a blank / freeze and show the slides again', area: 'home', risk: 'change', needs: ['screen.control'], privacy: 'none',
    description: 'Put the TV back to normal after freeze_screen (or a blank started in the admin).',
    inputSchema: obj({ previewId: PREVIEW_ID }, ['previewId']) },

  // ── Look and settings ───────────────────────────────────────────────────────
  { name: 'update_look_and_settings', title: 'Change the look and main settings', area: 'themes', alsoAreas: ['style', 'layout', 'motion', 'shows', 'this-screen'], risk: 'change', needs: ['look.change', 'settings.change'], privacy: 'none',
    description: 'Change the theme, automatic day/night theme, Hebrew size, message font style, orientation, side rail, motion, graphics, long-text behaviour, the posting defaults and the screen name. FIRST call describe_options for the area (themes, style, layout, motion, shows, this-screen): it lists each setting, its allowed values and its current value. Ask the person what they want, preview, read it back. Changes the whole screen at once; it can be undone with undo_change. Location, logins, web links and uploaded fonts are not available here.',
    inputSchema: obj({ changes: LOOK_CHANGES_SCHEMA, previewId: PREVIEW_ID }, ['changes', 'previewId']) },

  // ── History ─────────────────────────────────────────────────────────────────
  { name: 'undo_change', title: 'Undo a change', area: 'history', risk: 'change', needs: [], privacy: 'none',
    description: 'Undo one change using the undoId from read_history. Only changes that can be undone have one; it is refused if the thing was changed again since.',
    inputSchema: obj({ undoId: S('The undoId from read_history.', 80), previewId: PREVIEW_ID }, ['undoId', 'previewId']) },
]);

/** Every area a tool belongs to (its main one plus any it also serves). */
export const areasOfTool = (t) => [t.area, ...(t.alsoAreas || [])];
export const CHANGE_TOOL_NAMES = Object.freeze(TOOLS.filter((t) => t.risk !== 'read').map((t) => t.name));
export const POST_STATUSES_FOR_FILTER = STATUSES;
const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));
export const toolByName = (name) => BY_NAME.get(name) || null;

/** MCP annotations: a read tool is readOnly (no Allow prompt); a change tool is not; delete is marked destructive. */
export function annotationsOf(tool) {
  return {
    title: tool.title,
    readOnlyHint: tool.risk === 'read',
    destructiveHint: tool.risk === 'delete',
    idempotentHint: false,
    openWorldHint: false,
  };
}

/**
 * The tools this caller may see. `caps` = the AI identity's capabilities; `mode` = 'read' | 'change'. A look-only key sees
 * no change tools at all. Tools are never hidden for any other reason, so get_capabilities and tools/list agree.
 */
export function toolsFor({ caps = [], mode = 'read' } = {}) {
  const have = new Set(caps);
  return TOOLS.filter((t) => {
    if (t.risk !== 'read' && mode !== 'change') return false;
    if (t.needs.length && !t.needs.some((c) => have.has(c))) return false;
    return true;
  });
}
