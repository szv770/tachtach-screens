/**
 * The look and settings an AI connection may change: a SHORT, typed list (pure, shared with the hub).
 *
 * Why a list and not "any setting": most nested settings are free-form on the server, so a wrong value would reach the TV.
 * Every field here has a type, the allowed values or range, a plain label and what it does; the tool builds the real settings
 * patch from it and the server still validates it (settingsMerge.validateSettingsPatch). Security, location, logins, links and
 * fonts uploaded by the school are NOT on this list on purpose.
 */
import { THEMES, DEFAULT_THEME, DEFAULT_DAY_THEME, DEFAULT_NIGHT_THEME } from '../themes.js';
import { ANNOUNCE_FONT_IDS, ANNOUNCE_FONT_PRESETS } from '../fontRoles.js';
import { START_AS, INSERT_AT, DEFAULT_SECONDS, SECONDS_MIN, SECONDS_MAX, END_HOURS_MAX, DEFAULT_INSERT_AT } from '../postList.js';

const THEME_IDS = THEMES.map((t) => t.id);
const opts = (pairs) => pairs.map(([id, label, note]) => ({ id, label, ...(note ? { note } : {}) }));
const enumOf = (list) => ({ type: 'string', enum: list.map((o) => o.id) });

const ORIENTATION = opts([['landscape', 'Landscape', 'A normal wide TV.'], ['portrait', 'Portrait', 'A TV mounted on its side (9:16): the whole screen is laid out vertically.']]);
const PORTRAIT_LAYOUT = opts([['compact', 'Compact'], ['scroll', 'Scroll']]);
const SIDE = opts([['left', 'Left'], ['right', 'Right']]);
const MOTION = opts([['smooth', 'Smooth (default)'], ['minimal', 'Minimal'], ['lively', 'Lively']]);
const GRAPHICS = opts([['rich', 'Rich (default)'], ['subtle', 'Subtle'], ['off', 'Off']]);
const LT_MODE = opts([['scroll', 'Scroll (default)', 'Long text scrolls slowly on one slide.'], ['pages', 'Pages', 'Long text is split into pages.']]);
const LT_SPEED = opts([['slow', 'Slow'], ['normal', 'Normal (default)'], ['fast', 'Fast']]);
const STARTS = opts([['live', 'Live', 'New posts go live at once.'], ['draft', 'Draft', 'New posts are saved as drafts until someone publishes them.']]);
const GOES_AT = opts([['end', 'The end of the rotation (default)'], ['start', 'The start of the rotation']]);
const THEME_OPTIONS = THEMES.map((t) => ({ id: t.id, label: t.name, note: t.note, family: t.family }));
const FONT_OPTIONS = ANNOUNCE_FONT_IDS.map((id) => ({ id, label: ANNOUNCE_FONT_PRESETS[id].label, note: ANNOUNCE_FONT_PRESETS[id].hint }));

const get = (o, path, d) => path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o) ?? d;

/** key -> { area, label, what, schema, options?|range?, default, read(settings), patch(value), warn? } */
export const LOOK_FIELDS = Object.freeze({
  theme: {
    area: 'themes', label: 'Screen theme', what: 'The colours of the whole screen (dark and light families).',
    schema: { type: 'string', enum: THEME_IDS, description: 'A theme id from describe_options("themes").' }, options: THEME_OPTIONS, default: DEFAULT_THEME,
    read: (s) => (THEME_IDS.includes(s.theme) ? s.theme : (s.theme === 'custom' ? 'custom (a custom accent colour; not changed through the connector)' : DEFAULT_THEME)),
    patch: (v) => ({ theme: v }),
  },
  autoDayNight: {
    area: 'themes', label: 'Automatic day / night theme', what: 'Switch theme by itself at sunrise and sunset (zmanim).',
    schema: { type: 'object', additionalProperties: false, properties: { enabled: { type: 'boolean' }, dayTheme: { type: 'string', enum: THEME_IDS }, nightTheme: { type: 'string', enum: THEME_IDS } }, description: 'Give only what changes.' },
    default: { enabled: false, dayTheme: DEFAULT_DAY_THEME, nightTheme: DEFAULT_NIGHT_THEME },
    read: (s) => ({ enabled: !!s.themeAuto?.enabled, dayTheme: s.themeAuto?.dayTheme || DEFAULT_DAY_THEME, nightTheme: s.themeAuto?.nightTheme || DEFAULT_NIGHT_THEME }),
    patch: (v) => ({ themeAuto: v }),
  },
  hebrewFontScale: {
    area: 'style', label: 'Hebrew text size', what: 'Scales every Hebrew size on the screen together (1.00 = the designed size).',
    schema: { type: 'number', minimum: 0.8, maximum: 1.4, description: '0.8 to 1.4.' }, range: { min: 0.8, max: 1.4, step: 0.05 }, default: 1,
    read: (s) => (Number.isFinite(Number(s.hebrewFontScale)) ? Number(s.hebrewFontScale) : 1), patch: (v) => ({ hebrewFontScale: v }),
    warn: 'Changes the size of every Hebrew line on the screen.',
  },
  announceFonts: {
    area: 'style', label: 'Message and takeover font style', what: 'The type used by announcements and full-screen takeovers.',
    schema: { type: 'string', enum: ANNOUNCE_FONT_IDS }, options: FONT_OPTIONS, default: 'editorial',
    read: (s) => (ANNOUNCE_FONT_IDS.includes(s.announceFonts) ? s.announceFonts : 'editorial'), patch: (v) => ({ announceFonts: v }),
  },
  orientation: {
    area: 'layout', label: 'Screen orientation', what: 'Landscape for a normal TV, portrait for a TV mounted on its side.',
    schema: enumOf(ORIENTATION), options: ORIENTATION, default: 'landscape',
    read: (s) => (s.orientation === 'portrait' ? 'portrait' : 'landscape'), patch: (v) => ({ orientation: v }),
    warn: 'Only choose portrait if the TV is physically mounted on its side: the whole screen is laid out again.',
  },
  portraitLayout: {
    area: 'layout', label: 'Portrait layout', what: 'How a portrait screen stacks its parts (only matters in portrait).',
    schema: enumOf(PORTRAIT_LAYOUT), options: PORTRAIT_LAYOUT, default: 'compact',
    read: (s) => (s.portraitLayout === 'scroll' ? 'scroll' : 'compact'), patch: (v) => ({ portraitLayout: v }),
  },
  railSide: {
    area: 'layout', label: 'Side rail position', what: 'Which side the clock and side rail are on.',
    schema: enumOf(SIDE), options: SIDE, default: 'left',
    read: (s) => ((s.layout?.railSide || s.clockSide) === 'right' ? 'right' : 'left'), patch: (v) => ({ layout: { railSide: v }, clockSide: v }),
  },
  motion: {
    area: 'motion', label: 'Motion', what: 'How much the screen animates.',
    schema: enumOf(MOTION), options: MOTION, default: 'smooth',
    read: (s) => (['minimal', 'lively'].includes(s.motion) ? s.motion : 'smooth'), patch: (v) => ({ motion: v }),
  },
  graphics: {
    area: 'motion', label: 'Graphics', what: 'How much decorative drawing there is.',
    schema: enumOf(GRAPHICS), options: GRAPHICS, default: 'rich',
    read: (s) => (['subtle', 'off'].includes(s.graphics) ? s.graphics : 'rich'), patch: (v) => ({ graphics: v }),
  },
  longTextMode: {
    area: 'motion', label: 'When a text is too long', what: 'Hayom Yom, Sichos and Letters: scroll slowly or split into pages.',
    schema: enumOf(LT_MODE), options: LT_MODE, default: 'scroll',
    read: (s) => (s.longText?.mode === 'pages' ? 'pages' : 'scroll'), patch: (v) => ({ longText: { mode: v } }),
  },
  longTextSpeed: {
    area: 'motion', label: 'Reading speed', what: 'How fast long text scrolls or turns pages.',
    schema: enumOf(LT_SPEED), options: LT_SPEED, default: 'normal',
    read: (s) => (['slow', 'fast'].includes(s.longText?.speed) ? s.longText.speed : 'normal'), patch: (v) => ({ longText: { speed: v } }),
  },
  newPostStartsAs: {
    area: 'shows', label: 'New posts start as', what: 'Whether a new post goes live at once or waits as a draft.',
    schema: { type: 'string', enum: START_AS }, options: STARTS, default: 'live',
    read: (s) => (START_AS.includes(get(s, 'announcements.startAs')) ? s.announcements.startAs : 'live'), patch: (v) => ({ announcements: { startAs: v } }),
  },
  newPostDefaultEndHours: {
    area: 'shows', label: 'How long a new post shows (hours)', what: 'The default length of a new post. 0 = until someone turns it off.',
    schema: { type: 'integer', minimum: 0, maximum: END_HOURS_MAX }, range: { min: 0, max: END_HOURS_MAX }, default: 0,
    read: (s) => (Number.isInteger(get(s, 'announcements.defaultEndHours')) ? s.announcements.defaultEndHours : 0), patch: (v) => ({ announcements: { defaultEndHours: v } }),
  },
  newSlideSeconds: {
    area: 'shows', label: 'Seconds a new message slide stays on screen', what: 'The default for message slides.',
    schema: { type: 'integer', minimum: SECONDS_MIN, maximum: SECONDS_MAX }, range: { min: SECONDS_MIN, max: SECONDS_MAX }, default: DEFAULT_SECONDS,
    read: (s) => (Number.isInteger(get(s, 'announcements.defaultSeconds')) ? s.announcements.defaultSeconds : DEFAULT_SECONDS), patch: (v) => ({ announcements: { defaultSeconds: v } }),
  },
  newSlideGoesAt: {
    area: 'shows', label: 'Where a new message slide goes', what: 'Start or end of the rotation.',
    schema: { type: 'string', enum: INSERT_AT }, options: GOES_AT, default: DEFAULT_INSERT_AT,
    read: (s) => (INSERT_AT.includes(get(s, 'announcements.insertAt')) ? s.announcements.insertAt : DEFAULT_INSERT_AT), patch: (v) => ({ announcements: { insertAt: v } }),
  },
  showChabadCredit: {
    area: 'shows', label: 'Show the "Courtesy of Chabad.org" line', what: 'The small credit line on pages that show Chabad.org content.',
    schema: { type: 'boolean' }, default: true,
    read: (s) => s.showChabadCredit !== false, patch: (v) => ({ showChabadCredit: v }),
    warn: 'Chabad.org allows its content with credit: turning the line off removes that credit.',
  },
  screenName: {
    area: 'this-screen', label: 'Screen name', what: 'This screen\'s name in the admin.',
    schema: { type: 'string', minLength: 1, maxLength: 60 }, default: '',
    read: (s) => s.siteName || '', patch: (v) => ({ siteName: v }),
  },
});

export const LOOK_FIELD_KEYS = Object.freeze(Object.keys(LOOK_FIELDS));
export const LOOK_AREAS = Object.freeze([...new Set(Object.values(LOOK_FIELDS).map((f) => f.area))]);

/** The `changes` schema of update_look_and_settings, generated from the table. */
export const LOOK_CHANGES_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false, description: 'Only the settings to change. See describe_options for each one.',
  properties: Object.fromEntries(LOOK_FIELD_KEYS.map((k) => [k, { ...LOOK_FIELDS[k].schema, description: `${LOOK_FIELDS[k].label}. ${LOOK_FIELDS[k].what}${LOOK_FIELDS[k].schema.description ? ` ${LOOK_FIELDS[k].schema.description}` : ''}` }])),
});

/** Build the settings patch for a `changes` object (deep merge of each field's patch). */
export function patchFromChanges(changes) {
  const merge = (a, b) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k], v) : v;
    return out;
  };
  return Object.entries(changes || {}).reduce((acc, [k, v]) => (LOOK_FIELDS[k] ? merge(acc, LOOK_FIELDS[k].patch(v)) : acc), {});
}
