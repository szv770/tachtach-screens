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
  home: { en: 'Home', status: 'available', tools: ['get_overview'], blurb: 'What is on the screen now, what is next, what is live.' },
  slides: { en: 'Slides', status: 'available', tools: ['list_slides', 'set_slide_enabled', 'reorder_slides', 'set_slide_duration'], blurb: 'The rotation: switch slides on or off, change the order, and how many seconds each stays.' },
  images: { en: 'Media', status: 'soon', blurb: 'Pictures, videos, photo albums, web pages and news feeds. Not through the connector yet.' },
  'daily-word': { en: 'Daily Word', status: 'soon', blurb: 'Not through the connector yet.' },
  'daily-story': { en: 'Daily Story', status: 'soon', blurb: 'Not through the connector yet.' },
  'daily-letter': { en: 'Daily Letter', status: 'soon', blurb: 'Not through the connector yet.' },
  menu: { en: 'Menu', status: 'soon', blurb: 'Not through the connector yet.' },
  averages: { en: 'Test Averages', status: 'blocked', blockedUnless: 'aiAccess.allowAverages', reason: 'It shows students\' names next to their marks. An admin can allow it with "Let an AI see the Test Averages" in Connect an AI.', blurb: '' },
  shiurim: { en: 'Shiurim', status: 'soon', blurb: 'Not through the connector yet.' },
  occasions: { en: 'Occasions', status: 'soon', blurb: 'Not through the connector yet.' },
  shabbos: { en: 'Shabbos', status: 'soon', blurb: 'Not through the connector yet.' },
  roster: { en: 'Bochurim', status: 'blocked', reason: NAMES, blurb: '' },
  chazan: { en: 'Chazan', status: 'blocked', reason: NAMES, blurb: '' },
  schedule: { en: 'Schedule', status: 'available', tools: ['get_schedule', 'get_format_guide', 'schedule_replace_week', 'schedule_set_days', 'schedule_clear_day'], blurb: 'The weekly timetable and one-day changes (Shabbos, Yom Tov, a different day). Always previewed before it is saved, and the old week is backed up.' },
  'custom-days': { en: 'Custom days', status: 'soon', blurb: 'Not through the connector yet.' },
  announcements: { en: 'Announcements', status: 'available', tools: ['list_posts', 'post_message', 'edit_post', 'set_post_state', 'delete_post'], blurb: 'Message slides, banners, side notes and full-screen takeovers: post, change, pause, end, show again, delete.' },
  themes: { en: 'Themes', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  style: { en: 'Fonts', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  layout: { en: 'Layout', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  logo: { en: 'Logo & credit', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  motion: { en: 'Motion & graphics', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  location: { en: 'Location & weather', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  shows: { en: 'What shows', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  'schedule-display': { en: 'Schedule display', status: 'soon', blurb: 'Look and settings are not through the connector yet.' },
  security: { en: 'Security', status: 'blocked', reason: 'Security settings (trusted devices, sign-in) are never reachable through an AI key.', blurb: '' },
  'this-screen': { en: 'This screen', status: 'soon', blurb: 'Not through the connector yet.' },
  history: { en: 'Recent changes', status: 'available', tools: ['read_history', 'undo_change'], blurb: 'See who changed what (changes made through an AI are marked), and undo a change.' },
  health: { en: 'System health', status: 'soon', blurb: 'Not through the connector yet.' },
  team: { en: 'Team', status: 'blocked', reason: 'People and their access are never reachable through an AI key.', blurb: '' },
  ai: { en: 'Connect an AI', status: 'blocked', reason: 'An AI key cannot make, change or remove AI connections, or change the school-wide AI switch and limits.', blurb: '' },
  account: { en: 'My account', status: 'blocked', reason: 'Passwords and 2-step are never reachable through an AI key.', blurb: '' },
});

/** The admin section keys this table accounts for (the coverage test compares it with nav.js). */
export const AREA_KEYS = Object.freeze(Object.keys(AREAS));
