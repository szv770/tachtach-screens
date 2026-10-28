// Admin navigation model: 5 areas, each owning some of the existing /admin/<section> URLs.
// Pure data (no React) so the shell, Home, search and tests share it.
import { canOpenSection } from '../shared/permissions.js';

/** Every section that has its own URL. `area` null = reached from the header (account, help, home). */
export const navItems = [
  { key: 'home', en: 'Home', desc: 'What\'s on the screen now', area: 'home' },
  { key: 'slides', en: 'Slides', desc: 'Control what plays on screen', area: 'screen', group: 'main' },
  { key: 'images', en: 'Media', desc: 'Pictures, videos, photo albums, web pages & news feeds', area: 'screen', group: 'main' },
  { key: 'daily-word', en: 'Daily Word', desc: 'A new word every day', area: 'screen', group: 'daily' },
  { key: 'daily-story', en: 'Daily Story', desc: 'A short story or thought every day', area: 'screen', group: 'daily' },
  { key: 'shabbos', en: 'Shabbos', desc: 'Friday and Motzei Shabbos pages, reminders, the screen during Shabbos', area: 'screen', group: 'daily' },
  { key: 'roster', en: 'Bochurim', desc: 'The list of names, and the birthday slide', area: 'screen', group: 'daily' },
  { key: 'chazan', en: 'Chazan', desc: 'Who leads Shacharis, Mincha and Maariv', area: 'screen', group: 'daily' },
  { key: 'schedule', en: 'Schedule', desc: 'Weekly timetable, one-day changes & alerts', area: 'schedule' },
  { key: 'custom-days', en: 'Custom days', desc: 'Mark special dates', area: 'schedule' },
  { key: 'announcements', en: 'Announcements', desc: 'Posts, quick messages, banners & letters', area: 'announce' },
  // Look & Settings: small sorted pages in three groups (see LOOK_GROUPS).
  { key: 'themes', en: 'Themes', desc: 'Light, dark & automatic day/night', area: 'look', group: 'look' },
  { key: 'style', en: 'Fonts', desc: 'Fonts & text size', area: 'look', group: 'look' },
  { key: 'layout', en: 'Layout', desc: 'Orientation, side rail & page layouts', area: 'look', group: 'look' },
  { key: 'logo', en: 'Logo & credit', desc: 'Credit line and your logo', area: 'look', group: 'look' },
  { key: 'motion', en: 'Motion & graphics', desc: 'Animation and drawings', area: 'look', group: 'look' },
  { key: 'location', en: 'Location & weather', desc: 'Zip, time zone, place name, weather', area: 'look', group: 'setup' },
  { key: 'shows', en: 'What shows', desc: 'Side-rail items, up-next, study languages, Post button', area: 'look', group: 'setup' },
  { key: 'schedule-display', en: 'Schedule display', desc: 'How the timetable looks; two tracks', area: 'look', group: 'setup' },
  { key: 'security', en: 'Security', desc: 'Trusted devices', area: 'look', group: 'system' },
  { key: 'this-screen', en: 'This screen', desc: 'Screen name and storage', area: 'look', group: 'system' },
  { key: 'history', en: 'Recent changes', desc: 'Who changed what, and Undo', area: 'look', group: 'system' },
  { key: 'health', en: 'System health', desc: 'Is the screen online, is the data fresh, is there room left', area: 'look', group: 'system' },
  { key: 'team', en: 'Team', desc: 'People who can sign in', area: 'look', group: 'system' },
  { key: 'account', en: 'My account', desc: 'Your name, password & 2-step', area: 'look', group: 'system' },
  { key: 'help', en: 'Help', desc: 'Learn the basics', area: null },
  { key: 'kit', en: 'UI kit', desc: 'Shared components (admin only)', area: null },
];

/** The five areas (order = sidebar order). `tab` = shown in the mobile bottom bar. */
export const AREAS = [
  { key: 'home', en: 'Home', icon: 'home', tab: true, color: null, blurb: 'What is on the screen now' },
  { key: 'screen', en: 'Screen', icon: 'screen', tab: true, color: 'var(--area-screen)', blurb: 'Slides, media, feeds, daily word, birthdays' },
  { key: 'schedule', en: 'Schedule', icon: 'calendar', tab: true, color: 'var(--area-schedule)', blurb: 'Timetable and special days' },
  { key: 'announce', en: 'Announce', icon: 'megaphone', tab: true, color: 'var(--area-announce)', blurb: 'Messages, banners, takeovers' },
  { key: 'look', en: 'Look & Settings', icon: 'gear', tab: false, color: 'var(--area-look)', blurb: 'Themes, fonts, location, team' },
];

/** Sub-groups of the Look & Settings area (sidebar headings + the two-row sub-nav on a phone). */
export const LOOK_GROUPS = [
  { key: 'look', en: 'Look' },
  { key: 'setup', en: 'Settings' },
  { key: 'system', en: 'System' },
];

/** Sub-groups of the Screen area (desktop sidebar shows each as its own section). */
export const SCREEN_GROUPS = [
  { key: 'main', en: 'Slides & media' },
  { key: 'daily', en: 'Daily & people' },
];

/**
 * Desktop sidebar sections: every area, split by its groups, so no list is long.
 * key = `${area}` or `${area}:${group}`; `of(section)` tells which one a page lives in.
 */
export function sidebarSections(role) {
  const out = [];
  for (const a of AREAS) {
    if (a.key === 'home') continue;
    const items = sectionsOfArea(a.key, role);
    if (!items.length) continue;
    const groups = a.key === 'look' ? LOOK_GROUPS : a.key === 'screen' ? SCREEN_GROUPS : null;
    if (!groups) { out.push({ key: a.key, area: a.key, en: a.en, color: a.color, items }); continue; }
    for (const g of groups) {
      const gi = items.filter((it) => it.group === g.key);
      if (gi.length) out.push({ key: `${a.key}:${g.key}`, area: a.key, en: a.key === 'look' ? g.en : g.en, color: a.color, items: gi });
    }
  }
  return out;
}
export const sidebarKeyOf = (section) => {
  const info = sectionInfo(section);
  if (!info?.area || info.area === 'home') return null;
  return info.group && (info.area === 'look' || info.area === 'screen') ? `${info.area}:${info.group}` : info.area;
};

/** Retired section URLs that still work (bookmarks, old links, help text). */
export const SECTION_ALIASES = { settings: 'location', 'rss-feeds': 'images' };

/** The Media page's tabs (`/admin/images?tab=<value>`; the first is the default). */
export const MEDIA_TABS = [
  { value: 'library', label: 'Library', needs: ['media.upload', 'media.delete', 'slides.edit'] },
  { value: 'photos', label: 'Photo albums', needs: ['feeds.edit'] },
  { value: 'web', label: 'Web pages', needs: ['slides.edit', 'slides.delete'] },
  { value: 'feeds', label: 'News feeds', needs: ['feeds.edit'] },
];
export const MEDIA_TAB_VALUES = MEDIA_TABS.map((t) => t.value);
export const DEFAULT_MEDIA_TAB = 'library';

/** The Announce page's tabs (`/admin/announcements?tab=posts|quick|letters`; the first is the default). */
export const ANNOUNCE_TABS = [
  { value: 'posts', label: 'Announcements' },
  { value: 'quick', label: 'Quick messages' },
  { value: 'letters', label: 'Letters' },
];
export const ANNOUNCE_TAB_VALUES = ANNOUNCE_TABS.map((t) => t.value);
export const DEFAULT_ANNOUNCE_TAB = 'posts';

/** Sections that keep a tab in the address bar. */
export const SECTION_TABS = { images: MEDIA_TAB_VALUES, announcements: ANNOUNCE_TAB_VALUES };

/**
 * Turn anything a link or button can ask for into { section, tab }:
 * 'images', 'images?tab=web', and the retired 'rss-feeds' (= Media > News feeds).
 */
export function resolveTarget(raw) {
  const [path, query = ''] = String(raw || '').split('?');
  let section = SECTION_ALIASES[path] || path;
  let tab = new URLSearchParams(query).get('tab') || null;
  if (path === 'rss-feeds' && !tab) tab = 'feeds';
  if (!SECTION_TABS[section]?.includes(tab)) tab = null;
  return { section, tab };
}

export const SECTION_KEYS = navItems.map((n) => n.key);
export const sectionInfo = (key) => navItems.find((n) => n.key === key) || null;
export const areaInfo = (key) => AREAS.find((a) => a.key === key) || null;
export const areaOfSection = (key) => sectionInfo(key)?.area ?? null;

/** Sections of an area this role may open (the server enforces the real rules too). */
export function sectionsOfArea(area, role) {
  return navItems.filter((n) => n.area === area && canOpenSection(role, n.key));
}

/** Look & Settings pages of one group this role may open. */
export function sectionsOfGroup(group, role) {
  return sectionsOfArea('look', role).filter((n) => n.group === group);
}

/** Where an area's tab/tile takes you: its first section this role can open. */
export function firstSectionOfArea(area, role) {
  return sectionsOfArea(area, role)[0]?.key || null;
}

/** Areas this role can open anything in. */
export function areasFor(role) {
  return AREAS.filter((a) => sectionsOfArea(a.key, role).length > 0);
}
