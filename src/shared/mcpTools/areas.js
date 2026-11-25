/**
 * Every section of the admin (src/admin/nav.js) and what an AI connection can do there.
 *
 * ONE table, so the AI can always be told exactly how much it can do (get_capabilities) and so a test can fail the day
 * somebody adds an admin section without deciding what the connector does about it (test/mcpCoverage.test.js).
 *
 *   status  'available'  tools exist (listed in `tools`)
 *           'soon'       planned, no tool yet: the AI is told so honestly instead of guessing
 *           'blocked'    never available through an AI key: `reason` says why (names, security, its own keys)
 *   `blockedUnless`      a school switch that opens a blocked area (Test Averages)
 */
export const AREA_STATUS = Object.freeze(['available', 'soon', 'blocked']);

const NAMES = 'It holds students\' names, and names never go to an AI.';

export const AREAS = Object.freeze({
  home: { en: 'Home', status: 'available', tools: ['get_overview', 'screen_control', 'freeze_screen', 'resume_screen'], blurb: 'What is on the screen now, what is next, what is live; and the TV controls: pause, resume, next, previous, blank, and Freeze (blank, logo only, freeze, or a notice) for a set time.' },
  slides: { en: 'Slides', status: 'available', tools: ['list_slides', 'set_slide_enabled', 'reorder_slides', 'set_slide_duration'], blurb: 'The rotation: switch slides on or off, change the order, and how many seconds each stays.' },
  images: { en: 'Media', status: 'soon', blurb: 'Pictures, videos, photo albums, web pages and news feeds. Not through the connector yet.' },
  'daily-word': { en: 'Daily Word', status: 'available', tools: ['list_daily_content', 'add_daily_content', 'remove_daily_content', 'set_daily_today', 'get_format_guide'], blurb: 'A new Yiddish (or other) word every day: add words in bulk, remove, change today. Only words and meanings you or the person can vouch for.' },
  'daily-story': { en: 'Daily Story', status: 'available', tools: ['list_daily_content', 'add_daily_content', 'remove_daily_content', 'set_daily_today', 'get_format_guide'], blurb: 'A short story or thought every day: add in bulk (each story needs a real source, or it is saved hidden), remove, change today.' },
  'daily-letter': { en: 'Daily Letter', status: 'available', tools: ['list_daily_content', 'add_daily_content', 'remove_daily_content', 'set_daily_today', 'get_format_guide'], blurb: 'A letter typed out on letterhead, one a day: add letters the person pastes (copied exactly, never rewritten), remove, change today.' },
  menu: { en: 'Menu', status: 'soon', blurb: 'Not through the connector yet.' },
  averages: { en: 'Test Averages', status: 'blocked', blockedUnless: 'aiAccess.allowAverages', reason: 'It shows students\' names next to their marks. An admin can allow it with "Let an AI see the Test Averages" in Connect an AI.', blurb: '' },
  shiurim: { en: 'Shiurim', status: 'soon', blurb: 'Not through the connector yet.' },
  occasions: { en: 'Occasions', status: 'soon', blurb: 'Not through the connector yet.' },
  shabbos: { en: 'Shabbos', status: 'soon', blurb: 'Not through the connector yet.' },
  roster: { en: 'Bochurim', status: 'blocked', reason: NAMES, blurb: '' },
  chazan: { en: 'Chazan', status: 'blocked', reason: NAMES, blurb: '' },
  schedule: { en: 'Schedule', status: 'available', tools: ['get_schedule', 'get_format_guide', 'schedule_change_day', 'schedule_change_week', 'schedule_replace_week', 'schedule_set_days', 'schedule_clear_day'], blurb: 'The weekly timetable and one-day changes. Small edits (cancel a Seder today, move Mincha to 1:45, add a block) or whole days and weeks (Shabbos, Yom Tov). Always previewed before it is saved, and the old week is backed up.' },
  'custom-days': { en: 'Custom days', status: 'soon', blurb: 'Not through the connector yet.' },
  announcements: { en: 'Announcements', status: 'available', tools: ['list_posts', 'post_message', 'edit_post', 'set_post_state', 'delete_post'], blurb: 'Message slides, banners, side notes and full-screen takeovers: post, change, pause, end, show again, delete.' },
  'themes': { en: 'Themes', status: 'available', tools: ['update_look_and_settings'], blurb: 'Screen theme and the automatic day/night theme.' },
  'style': { en: 'Fonts', status: 'available', tools: ['update_look_and_settings'], blurb: 'Hebrew text size and the message and takeover font style (uploading or choosing individual fonts is not available).' },
  'layout': { en: 'Layout', status: 'available', tools: ['update_look_and_settings'], blurb: 'Orientation, portrait layout and the side rail position.' },
  logo: { en: 'Logo & credit', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  'motion': { en: 'Motion & graphics', status: 'available', tools: ['update_look_and_settings'], blurb: 'Motion, graphics and how long text scrolls.' },
  location: { en: 'Location & weather', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  'shows': { en: 'What shows', status: 'available', tools: ['update_look_and_settings'], blurb: 'The posting defaults (how long, how many seconds, draft or live, where a new slide goes) and the Chabad.org credit line.' },
  'schedule-display': { en: 'Schedule display', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  security: { en: 'Security', status: 'blocked', reason: 'Security settings (trusted devices, sign-in) are never reachable through an AI key.', blurb: '' },
  'this-screen': { en: 'This screen', status: 'available', tools: ['update_look_and_settings'], blurb: "The screen's name." },
  history: { en: 'Recent changes', status: 'available', tools: ['read_history', 'undo_change'], blurb: 'See who changed what (changes made through an AI are marked), and undo a change.' },
  health: { en: 'System health', status: 'soon', blurb: 'Not through the connector yet.' },
  team: { en: 'Team', status: 'blocked', reason: 'People and their access are never reachable through an AI key.', blurb: '' },
  ai: { en: 'Connect an AI', status: 'blocked', reason: 'An AI key cannot make, change or remove AI connections, or change the school-wide AI switch and limits.', blurb: '' },
  account: { en: 'My account', status: 'blocked', reason: 'Passwords and 2-step are never reachable through an AI key.', blurb: '' },
});

/** The admin section keys this table accounts for (the coverage test compares it with nav.js). */
export const AREA_KEYS = Object.freeze(Object.keys(AREAS));
