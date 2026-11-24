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
import { DISPLAYS, LAYOUTS, STATUSES } from '../announcements.js';
import { STYLE_IDS, ANIMATIONS } from '../takeoverStyles.js';
import { SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX } from '../postList.js';

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
  }),
  slide: obj({ duration: { type: 'integer', minimum: 0, maximum: SECONDS_MAX, description: `Seconds a slide stays on screen (${SECONDS_MIN}-${SECONDS_MAX}); 0 = automatic.` } }),
  banner: obj({ mode: { type: 'string', enum: ['still', 'scroll'] }, speed: { type: 'string', enum: ['slow', 'normal', 'fast'] } }),
  takeover: obj({ rotateSec: { type: 'integer', minimum: 3, maximum: 300, description: 'Seconds each takeover stays when several share the screen.' } }),
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
};

const CHANGE_TOOLS = ['schedule_replace_week', 'schedule_set_days', 'schedule_clear_day', 'post_message', 'edit_post', 'set_post_state', 'delete_post', 'set_slide_enabled', 'reorder_slides', 'set_slide_duration', 'undo_change'];

export const TOOLS = Object.freeze([
  // ── Read ────────────────────────────────────────────────────────────────────
  { name: 'get_capabilities', title: 'What can I do here?', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'START HERE. Lists every part of the admin, what this connection can do in each (and which tools), what is not possible and why, and what is not available yet. Call it first, and again if the person asks "can you do X?". Do not guess.',
    inputSchema: obj({}) },
  { name: 'describe_options', title: 'What are the choices?', area: 'home', risk: 'read', needs: [], privacy: 'none',
    description: 'The real choices for one area, with plain descriptions, this school\'s own defaults, the limits and the questions to ASK the person before you change anything there. Call it before every change in that area and ask the person about each choice that matters (for example: banner or full slide? how long should it stay up? Hebrew too?).',
    inputSchema: obj({ area: { type: 'string', enum: ['announcements', 'schedule', 'slides', 'history', 'home'], description: 'Which part.' } }, ['area']) },
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
  { name: 'get_format_guide', title: 'The schedule text format', area: 'schedule', risk: 'read', needs: [], privacy: 'none',
    description: 'The exact text format the schedule tools accept, with this school\'s categories and groups. Read it before you write schedule text.',
    inputSchema: obj({ kind: { type: 'string', enum: ['week', 'days'], description: 'week = a weekly timetable; days = one or more dated days (Shabbos, Yom Tov).' } }, ['kind']) },
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
  { name: 'schedule_clear_day', title: 'Go back to the weekly schedule for a date', area: 'schedule', risk: 'delete', needs: ['schedule.edit'], privacy: 'none',
    description: 'Remove the one-day change for a date, so that date uses the weekly timetable again.',
    inputSchema: obj({ date: ISO_DATE, previewId: PREVIEW_ID }, ['date', 'previewId']) },

  // ── Posts ───────────────────────────────────────────────────────────────────
  { name: 'post_message', title: 'Post a message', area: 'announcements', risk: 'change', needs: ['announcements.post'], privacy: 'none',
    description: 'Post a message slide, banner, side note or full-screen takeover. FIRST call describe_options("announcements") and ASK the person: what kind (slide, banner, side note, takeover), the text (English, Hebrew or both), how long it should stay up, and whether it repeats. A takeover fills the whole screen and pauses everything, so confirm it clearly. Preview, read it back, then post.',
    inputSchema: obj({ post: POST, ...TIMING, previewId: PREVIEW_ID }, ['post', 'previewId']) },
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

  // ── History ─────────────────────────────────────────────────────────────────
  { name: 'undo_change', title: 'Undo a change', area: 'history', risk: 'change', needs: [], privacy: 'none',
    description: 'Undo one change using the undoId from read_history. Only changes that can be undone have one; it is refused if the thing was changed again since.',
    inputSchema: obj({ undoId: S('The undoId from read_history.', 80), previewId: PREVIEW_ID }, ['undoId', 'previewId']) },
]);

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
