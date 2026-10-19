// Admin navigation model: 5 areas, each owning some of the existing /admin/<section> URLs.
// Pure data (no React) so the shell, Home, search and tests share it.
import { canOpenSection } from '../shared/permissions.js';

/** Every section that has its own URL. `area` null = reached from the header (account, help, home). */
export const navItems = [
  { key: 'home', en: 'Home', desc: 'What\'s on the screen now', area: 'home' },
  { key: 'slides', en: 'Slides', desc: 'Control what plays on screen', area: 'screen' },
  { key: 'images', en: 'Media', desc: 'Images, videos & Google Photos', area: 'screen' },
  { key: 'rss-feeds', en: 'News feeds', desc: 'Live news & content feeds', area: 'screen' },
  { key: 'daily-word', en: 'Daily Word', desc: 'A new word every day', area: 'screen' },
  { key: 'schedule', en: 'Schedule', desc: 'Daily timetable & alerts', area: 'schedule' },
  { key: 'custom-days', en: 'Custom days', desc: 'Mark special dates', area: 'schedule' },
  { key: 'announcements', en: 'Announcements', desc: 'Slides, banners, notes & takeovers', area: 'announce' },
  { key: 'style', en: 'Style', desc: 'Fonts & typography', area: 'look' },
  { key: 'settings', en: 'Settings', desc: 'Location, theme & layout', area: 'look' },
  { key: 'team', en: 'Team', desc: 'People who can sign in', area: 'look' },
  { key: 'account', en: 'My account', desc: 'Your name, password & 2-step', area: null },
  { key: 'help', en: 'Help', desc: 'Learn the basics', area: null },
  { key: 'kit', en: 'UI kit', desc: 'Shared components (admin only)', area: null },
];

/** The five areas (order = sidebar order). `tab` = shown in the mobile bottom bar. */
export const AREAS = [
  { key: 'home', en: 'Home', icon: 'home', tab: true, color: null, blurb: 'What is on the screen now' },
  { key: 'screen', en: 'Screen', icon: 'screen', tab: true, color: 'var(--area-screen)', blurb: 'Slides, media, feeds, daily word' },
  { key: 'schedule', en: 'Schedule', icon: 'calendar', tab: true, color: 'var(--area-schedule)', blurb: 'Timetable and special days' },
  { key: 'announce', en: 'Announce', icon: 'megaphone', tab: true, color: 'var(--area-announce)', blurb: 'Messages, banners, takeovers' },
  { key: 'look', en: 'Look & Settings', icon: 'gear', tab: false, color: 'var(--area-look)', blurb: 'Themes, fonts, location, team' },
];

export const SECTION_KEYS = navItems.map((n) => n.key);
export const sectionInfo = (key) => navItems.find((n) => n.key === key) || null;
export const areaInfo = (key) => AREAS.find((a) => a.key === key) || null;
export const areaOfSection = (key) => sectionInfo(key)?.area ?? null;

/** Sections of an area this role may open (the server enforces the real rules too). */
export function sectionsOfArea(area, role) {
  return navItems.filter((n) => n.area === area && canOpenSection(role, n.key));
}

/** Where an area's tab/tile takes you: its first section this role can open. */
export function firstSectionOfArea(area, role) {
  return sectionsOfArea(area, role)[0]?.key || null;
}

/** Areas this role can open anything in. */
export function areasFor(role) {
  return AREAS.filter((a) => sectionsOfArea(a.key, role).length > 0);
}
