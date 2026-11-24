/**
 * What the AI is told about the system (pure; built from the app's own constants so it cannot drift from them).
 *
 *   buildCapabilities(ctx)        the map of every admin section for THIS key: can / cannot / not yet, and why
 *   describeOptions(area, ctx)    the real choices in one area, this school's defaults, limits and the QUESTIONS to ask the person
 *
 * ctx = { caps: string[], mode: 'read'|'change', allowAverages: bool, settings: object, limits?: {...}, tz?: string }
 */
import { AREAS } from './areas.js';
import { TOOLS, toolsFor, CONNECTOR_LAYOUTS, NOT_YET_LAYOUTS } from './catalogue.js';
import { DISPLAYS, LAYOUTS, DEFAULT_TZ } from '../announcements.js';
import { STYLE_GROUPS, STYLE_INFO, ANIMATIONS, ANIMATION_LABEL } from '../takeoverStyles.js';
import { postingDefaults, SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX } from '../postList.js';
import { aiAccessFrom } from '../aiAccess.js';
import { LOOK_FIELDS } from './lookSettings.js';
import { LIMITS as STORY_LIMITS, KINDS as STORY_KINDS } from '../dailyStories.js';
import { LIMITS as WORD_LIMITS } from '../dailyWords.js';

/** One line per layout, in the words a person would use. Every layout the connector offers MUST have one (test). */
export const LAYOUT_INFO = Object.freeze({
  bigwords: ['Big words', 'A short, bold message in large type. The best choice for most quick messages.', 'headlineEn / headlineHe'],
  classic: ['Classic', 'A headline with a paragraph under it. The plain default.', 'headlineEn / headlineHe, bodyEn / bodyHe'],
  event: ['Event', 'An event with a title, day, time and place.', 'content.event { title, day, time (HH:MM), place }'],
  list: ['List', 'A heading with up to 8 lines (a to-do, a packing list, a few announcements).', 'content.list { heading, items[] }'],
  quicktime: ['Time change', 'A time, optionally with the old time shown as changed. Good for "Mincha moved to 1:45".', 'content.quicktime { time, was, name, place }'],
  quote: ['Quote', 'A quotation with its source.', 'content.quote { text, source }'],
  notice: ['Notice', 'One sentence with the important words highlighted.', 'content.notice { pre, focus, post }'],
});

export const DISPLAY_INFO = Object.freeze({
  slide: { label: 'Message slide', what: 'Joins the slide rotation and is shown for a few seconds each round.', pausesRotation: false, bestFor: 'Ordinary announcements that can wait for their turn.' },
  banner: { label: 'Banner', what: 'A strip along the screen (still or scrolling). The slides keep rotating underneath. A banner never pauses the rotation.', pausesRotation: false, bestFor: 'A short line everyone should see all the time, for example "Mincha is at 1:45 today".' },
  note: { label: 'Side note', what: 'A small note in the side rail.', pausesRotation: false, bestFor: 'A gentle reminder that should not compete with the slides.' },
  takeover: { label: 'Full-screen takeover', what: 'Fills the WHOLE screen and pauses the slides until it ends.', pausesRotation: true, bestFor: 'Urgent or special moments only: a drill, an emergency, a big simcha.' },
});

const ASK = {
  announcements: [
    'What should it say? English, Hebrew, or both?',
    'How should it appear: a message slide in the rotation, a banner strip (never pauses the slides), a small side note, or a full-screen takeover (covers everything and pauses the slides)?',
    'How long should it stay up: until you remove it, for a number of hours, or until a certain time?',
    'Should it start now or later? Does it repeat (certain days, or only between certain times)?',
    'For a slide: how many seconds should it stay on screen each time?',
    'For a takeover: which look fits (for example Emergency, Celebration, Shabbos)? If another takeover is live, should this one replace it?',
    'Post it now, or save it as a draft first?',
  ],
  schedule: [
    'Is this the regular weekly timetable that repeats every week, or a change for specific dates (for example this Shabbos or a Yom Tov)?',
    'Which dates or days, and what are all the items with their times?',
    'Which category does each item belong to (davening, seder, meal, break...)?',
    'Do you want Hebrew names too?',
  ],
  slides: [
    'Which slide? (list_slides shows them.)',
    'Do you want it switched off, or just moved or shorter? Switching a slide off hides it from the TV until someone turns it on.',
  ],
  history: ['Which change do you want to undo? (read_history shows the recent ones.)'],
  'daily-story': [
    'Where is each story from? I need the exact source for every story (the book and page, or the named person who told it). A story with no source is saved hidden.',
    'Do you want these added to the end of the list, or to replace the whole list? (Replace removes what is there now; it can be undone.)',
    'Should any of them show on a particular date?',
    'English only, or Hebrew too?',
  ],
  'daily-word': [
    'Which words, and do you have the meanings, or should I suggest them for you to check before anything is saved?',
    'Which language are they (the list is mostly Yiddish)?',
    'Add to the end of the list, or replace the whole list? (Replace removes what is there now; it can be undone.)',
  ],
  'daily-letter': [
    'Please paste each letter exactly as it is. I will copy it word for word and will not write, shorten or reword it.',
    'Where is each letter printed (for example the volume and page)? I only fill that in if you tell me.',
    'Add to the end of the list, or replace the whole list? (Replace removes what is there now; it can be undone.)',
  ],
  themes: ['Which theme (look at the list), or should it change by itself between day and night?'],
  style: ['Do you want the Hebrew bigger or smaller, or a different style for messages and takeovers?'],
  layout: ['Is the TV mounted sideways (portrait) or normal (landscape)? Which side should the clock and side rail be on?'],
  motion: ['How lively should the screen be, and should long text scroll or turn into pages?'],
  shows: ['Should new posts go live at once or wait as drafts? How long should a new post stay up, and how many seconds should a message slide stay?'],
  'this-screen': ['What should this screen be called?'],
  home: [],
};

const wrapList = (xs) => xs.filter(Boolean);

function announcementsOptions(ctx) {
  const defaults = postingDefaults(ctx.settings || {});
  const canTakeover = (ctx.caps || []).includes('announcements.takeover');
  return {
    area: 'announcements',
    summary: 'Posts are messages on the screen. They can be a slide, a banner, a side note or a full-screen takeover, shown now or at set times, and they can repeat.',
    choices: {
      display: DISPLAYS.map((id) => ({ id, ...DISPLAY_INFO[id], ...(id === 'takeover' ? { allowedForYou: canTakeover } : {}) })),
      layouts: CONNECTOR_LAYOUTS.map((id) => ({ id, label: LAYOUT_INFO[id][0], what: LAYOUT_INFO[id][1], fields: LAYOUT_INFO[id][2] })),
      layoutsNotAvailableYet: Object.entries(NOT_YET_LAYOUTS).map(([id, why]) => ({ id, why })),
      takeoverStyles: STYLE_GROUPS.map((g) => ({ group: g.label, styles: g.ids.map((id) => ({ id, label: STYLE_INFO[id][0], bestFor: STYLE_INFO[id][1] })) })),
      takeoverAnimations: ANIMATIONS.map((id) => ({ id, label: ANIMATION_LABEL[id] })),
      banner: { modes: ['still', 'scroll'], speeds: ['slow', 'normal', 'fast'] },
      timing: {
        howLong: 'endsInHours (0 = until removed), or endsAtLocal as the school\'s local time like 2026-11-24T15:00, or a repeat rule.',
        start: 'startsAtLocal (school time). Leave out to start now.',
        repeat: 'post.when.recurrence { days: [Sun..Sat], windows: [{start:"07:00",end:"09:30"}], monthDays, from, until }',
        timeZone: ctx.tz || DEFAULT_TZ,
      },
      status: [{ id: 'published', what: 'Goes live (or waits for its start time).' }, { id: 'draft', what: 'Saved, never shown until published.' }],
    },
    defaults: {
      startsAs: defaults.startAs === 'draft' ? 'a draft (this school saves posts as drafts first)' : 'live',
      defaultEndHours: defaults.defaultEndHours === 0 ? 'none (stays until removed)' : `${defaults.defaultEndHours} hours`,
      slideSeconds: defaults.defaultSeconds,
      newSlideGoesAt: defaults.insertAt === 'start' ? 'the start of the rotation' : 'the end of the rotation',
    },
    limits: { textCharacters: 4000, listItems: 8, slideSeconds: `${SECONDS_MIN}-${SECONDS_MAX} (0 = automatic)`, endsInHours: `0-${END_HOURS_MAX}` },
    youCanTakeover: canTakeover,
    questionsToAsk: ASK.announcements,
    rules: [
      'A banner never pauses the rotation; a takeover always does. That is how the screen is meant to work.',
      'Do not invent names, times, dates or sources. Use only what the person told you, and read the final text back.',
      'Preview first (preview_change), read the sentence back, and post only after the person says yes.',
    ],
    examples: [
      { say: 'a banner that stays all day', post: { display: 'banner', content: { headlineEn: 'Mincha is at 1:45 today' }, banner: { mode: 'scroll', speed: 'normal' } }, endsInHours: 8 },
      { say: 'a time-change slide', post: { display: 'slide', look: { layout: 'quicktime' }, content: { quicktime: { name: 'Mincha', time: '13:45', was: '13:30' } }, slide: { duration: 15 } }, endsInHours: 6 },
      { say: 'a mazel tov takeover', post: { display: 'takeover', look: { style: 'celebration' }, content: { headlineEn: 'Mazel Tov!', headlineHe: 'מזל טוב' } }, endsInHours: 2 },
    ],
  };
}

function scheduleOptions() {
  return {
    area: 'schedule',
    summary: 'Two layers: the regular weekly timetable that repeats, and one-day changes for specific dates. A date with a one-day change shows that day\'s schedule instead of the weekly one.',
    choices: {
      weekly: 'schedule_replace_week replaces the WHOLE weekly timetable (the old one is backed up automatically first).',
      days: 'schedule_set_days replaces the schedule of the listed dates only. schedule_clear_day puts one date back on the weekly timetable.',
      format: 'Both take text in the TachTach schedule format. Call get_format_guide for the exact format with this school\'s categories and groups.',
    },
    questionsToAsk: ASK.schedule,
    rules: [
      'Show the person the whole schedule you wrote (every item and time) before you ask to save it.',
      'Replacing the week is big: confirm it clearly. Use schedule_set_days for a single Shabbos or Yom Tov.',
      'Times that change every week (candle lighting) belong in dated days, not in the weekly timetable.',
      'Everything is checked first: if any line has an error nothing is saved.',
    ],
    undo: 'Both kinds can be undone with undo_change (see read_history).',
  };
}

function slidesOptions() {
  return {
    area: 'slides',
    summary: 'The rotation is the list of slides the TV plays one after another. You can switch a slide on or off, move it, and set how long it stays.',
    choices: { operations: ['set_slide_enabled', 'reorder_slides', 'set_slide_duration'], seconds: `${SECONDS_MIN}-${SECONDS_MAX}; 0 = automatic for slides that allow it`, positions: '1 = first' },
    questionsToAsk: ASK.slides,
    rules: ['Turning a slide off removes it from the TV; say so plainly and confirm.', 'Adding new slides, pictures and web pages is not available through the connector yet.'],
  };
}

function historyOptions() {
  return {
    area: 'history',
    summary: 'Every change is logged with who did it. Changes made through an AI are marked "by AI". Some changes can be undone.',
    choices: { read: 'read_history', undo: 'undo_change with the undoId on a row' },
    questionsToAsk: ASK.history,
    rules: ['An undo is refused if the thing was changed again since. That is safe: tell the person.'],
  };
}

function homeOptions() {
  return {
    area: 'home',
    summary: 'get_overview shows what is on the screen now. get_capabilities shows everything this connection can do.',
    questionsToAsk: ASK.home,
    rules: ['Names of students, people, security and software updates are never available through an AI connection.'],
  };
}

const KIND_OF_AREA = { 'daily-story': 'story', 'daily-word': 'word', 'daily-letter': 'letter' };
const ENTRY_FIELDS = {
  story: {
    kind: 'story or thought',
    title: `short English title (up to ${STORY_LIMITS.title} characters)`,
    titleHe: 'title in Hebrew (optional)',
    text: `the text, in warm simple English (up to ${STORY_LIMITS.text} characters)`,
    textHe: 'Hebrew version (optional)',
    source: `REQUIRED for a story: the exact, checkable source (up to ${STORY_LIMITS.source} characters). Without it the story is saved hidden.`,
    tags: `up to ${STORY_LIMITS.tags} short tags (optional)`,
    showOn: 'a date like 2026-12-01 to show it on exactly that day (optional)',
  },
  word: {
    word: `the word (up to ${WORD_LIMITS.word} characters)`,
    transliteration: 'how it is written in English letters',
    meaning: `the meaning (up to ${WORD_LIMITS.meaning} characters), REQUIRED`,
    pronunciation: 'optional', partOfSpeech: 'optional', context: 'a short note on where it comes from (optional)',
    convo: 'up to 4 short example lines (optional)', language: 'default Yiddish', showOn: 'a date to show it on exactly that day (optional)',
  },
  letter: {
    title: 'a short name for your list',
    letter: { dateHe: 'optional', date: 'the English date and place as written', to: 'who it was sent to (optional)', salutation: 'the greeting', body: `the FULL text, paragraphs separated by a blank line (under ${STORY_LIMITS.letterBody} characters), REQUIRED`, signature: 'the closing', source: 'only if the person told you where it is printed' },
  },
};

function dailyOptions(area, ctx) {
  const kind = KIND_OF_AREA[area];
  const noun = { story: 'Daily Story', word: 'Daily Word', letter: 'Daily Letter' }[kind];
  const rules = {
    story: ['Never write a story from memory. Only add stories the person gave you, or that you can cite with an exact, checkable source. If you are not certain, ask.', 'A story with no source is saved hidden (the school\'s rule). Thoughts need no source.'],
    word: ['Only add words and meanings you are sure of, and have the person check suggested meanings before you save them.'],
    letter: ['Copy each letter exactly as pasted. Do not write, invent, shorten or reword a letter. If only a link or a topic was given, say you need the text.'],
  }[kind];
  return {
    area,
    summary: `The ${noun} page shows one entry a day from a list. You can add entries in bulk, remove some, and change what shows today.`,
    choices: {
      operations: { list: 'list_daily_content', add: 'add_daily_content (append, or replace the whole list)', remove: 'remove_daily_content', today: 'set_daily_today (pick, random, hide, automatic)' },
      entryFields: ENTRY_FIELDS[kind],
      ...(kind === 'story' ? { kinds: STORY_KINDS.filter((k) => k !== 'letter') } : {}),
    },
    limits: { entriesPerCall: 50, ...(kind === 'story' ? { stories: STORY_LIMITS.stories } : kind === 'letter' ? { letters: STORY_LIMITS.letters } : { words: WORD_LIMITS.words }) },
    questionsToAsk: ASK[area],
    rules: [...rules, 'Preview first: it shows how many would be added, how many are skipped as duplicates, and anything that cannot be used.', 'An import and a removal can usually be undone with undo_change.'],
    formatGuide: `get_format_guide("${kind}")`,
  };
}

function lookOptions(area, ctx) {
  const settings = ctx.settings || {};
  const fields = Object.entries(LOOK_FIELDS).filter(([, f]) => f.area === area);
  return {
    area,
    summary: 'These are the settings an AI connection may change here. Each has its allowed values and its current value.',
    settings: fields.map(([key, f]) => ({
      key, label: f.label, what: f.what,
      ...(f.options ? { allowed: f.options } : {}),
      ...(f.range ? { range: f.range } : {}),
      ...(f.schema.type === 'object' ? { shape: f.schema.properties && Object.keys(f.schema.properties) } : {}),
      current: f.read(settings),
      default: f.default,
      ...(f.warn ? { careful: f.warn } : {}),
    })),
    questionsToAsk: ASK[area],
    rules: ['Change only what the person asked for. Preview first and read the before and after back to them.', 'Changes show on the TV straight away and can be undone with undo_change.', 'Anything not listed here (location, logins, web links, uploaded fonts) is not available through the connector.'],
  };
}

const BUILDERS = { announcements: announcementsOptions, schedule: scheduleOptions, slides: slidesOptions, history: historyOptions, home: homeOptions,
  'daily-story': (c) => dailyOptions('daily-story', c), 'daily-word': (c) => dailyOptions('daily-word', c), 'daily-letter': (c) => dailyOptions('daily-letter', c),
  themes: (c) => lookOptions('themes', c), style: (c) => lookOptions('style', c), layout: (c) => lookOptions('layout', c), motion: (c) => lookOptions('motion', c), shows: (c) => lookOptions('shows', c), 'this-screen': (c) => lookOptions('this-screen', c) };
export const DESCRIBED_AREAS = Object.freeze(Object.keys(BUILDERS));

/** @returns {object|null} null for an area with nothing to describe yet */
export function describeOptions(area, ctx = {}) {
  const fn = BUILDERS[area];
  return fn ? fn(ctx) : null;
}

/** Plain reason a tool is hidden from this key. */
function whyHidden(tool, { caps = [], mode = 'read' }) {
  if (tool.risk !== 'read' && mode !== 'change') return 'this connection is set to look only';
  const have = new Set(caps);
  if (tool.needs.length && !tool.needs.some((c) => have.has(c))) return 'the person who made this connection does not have that access';
  return null;
}

/** The map of every admin section for this key. */
export function buildCapabilities(ctx = {}) {
  const { caps = [], mode = 'read', allowAverages = false, settings = {} } = ctx;
  const visible = new Set(toolsFor({ caps, mode }).map((t) => t.name));
  const access = aiAccessFrom(settings);
  const areas = Object.entries(AREAS).map(([key, a]) => {
    if (a.status === 'blocked') {
      if (a.blockedUnless === 'aiAccess.allowAverages' && allowAverages) {
        return { area: key, name: a.en, status: 'allowed-but-no-tools-yet', note: 'The school allows an AI here, but there are no tools for it yet.' };
      }
      return { area: key, name: a.en, status: 'not-possible', reason: a.reason };
    }
    if (a.status === 'soon') return { area: key, name: a.en, status: 'not-yet', note: a.blurb };
    const mine = a.tools.map((n) => TOOLS.find((t) => t.name === n)).filter(Boolean);
    const can = mine.filter((t) => visible.has(t.name)).map((t) => ({ tool: t.name, what: t.title, kind: t.risk }));
    const cannot = mine.filter((t) => !visible.has(t.name)).map((t) => ({ tool: t.name, what: t.title, because: whyHidden(t, { caps, mode }) }));
    return { area: key, name: a.en, status: can.length ? 'available' : 'not-for-you', canChange: can.some((c) => c.kind !== 'read'), summary: a.blurb, can, ...(cannot.length ? { cannot } : {}), ...(DESCRIBED_AREAS.includes(key) ? { moreDetail: `describe_options("${key}")` } : {}) };
  });
  return {
    youAre: { mode: mode === 'change' ? 'can change things (the person still taps Allow)' : 'look only', canChange: mode === 'change' },
    limits: { changesPerMinute: access.changesPerMinute, changesPerDay: access.changesPerDay, note: 'Only changes count; looking things up is free. One bulk action counts once.' },
    areas,
    howToWork: [
      'Before a change: call describe_options for that area, ASK the person about each choice, call preview_change, read the sentence back, and only then make the change with the previewId.',
      'Never invent facts, names, times or sources.',
      'If something is "not-yet" or "not-possible", say so plainly and offer to explain how the person can do it in the admin.',
    ],
  };
}

/** Test helper: every layout constant is either offered with a description or explained as not available yet. */
export function undescribedLayouts() {
  return LAYOUTS.filter((l) => !(l in LAYOUT_INFO) && !(l in NOT_YET_LAYOUTS));
}
export { wrapList };
