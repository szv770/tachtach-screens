// Global-search index + matcher. Pure (no React/DOM) so it can be unit-tested.
//
// Static "Settings & features" entries describe what exists in the admin today:
//   section  - /admin/<section> that holds it (role-filtered with canOpenSection)
//   anchor   - element id to scroll to (added where cheap)
//   match    - fallback: visible text near the control; jump.js finds it in the DOM
// Keep this in step with docs/claude/ADMIN_FEATURE_MAP.md when a setting is added or moved.
import { canOpenSection } from '../../shared/permissions.js';
import { areaOfSection, areaInfo, sectionInfo } from '../nav.js';
import { TOPICS, GLOSSARY } from '../help/helpContent.js';
import { status as announcementStatus } from '../../shared/announcements.js';
import { slideLabel, announcementTitle, formatTime12 } from './labels.js';

const S = (section, title, keywords, extra = {}) => ({ section, title, keywords, ...extra });

export const SETTINGS_INDEX = [
  // Look & Settings > Look. `anchor` = the id of the closed Collapsible (jump opens it); `match` = text inside to flash.
  S('themes', 'Screen theme (light / dark colours)', 'colours colors dark light look appearance swatch family', { anchor: 'look-theme' }),
  S('themes', 'Automatic day / night theme (two themes + switch times)', 'auto automatic dark light sunrise sunset shkia netz alos tzeis switch zmanim', { anchor: 'look-theme', match: 'Switch light' }),
  S('themes', 'Custom accent colour', 'colours colors primary custom palette highlight gold', { anchor: 'look-custom-theme' }),
  S('style', 'Screen fonts (Hebrew, English, numerals, Torah text)', 'typography typeface rubik manrope roles font family', { anchor: 'style-fonts' }),
  S('style', 'Hebrew size (text scale)', 'bigger smaller scale text size', { anchor: 'style-hebrew-size' }),
  S('style', 'Message & takeover font style', 'announcement fonts editorial modern classic', { anchor: 'style-announce-fonts' }),
  S('style', 'Upload or delete a font', 'custom font ttf otf woff upload remove', { anchor: 'style-upload' }),
  S('layout', 'Screen orientation (landscape / portrait)', 'rotate vertical horizontal 9:16 tv layout', { anchor: 'look-orientation' }),
  S('layout', 'Portrait layout (compact / scrollable)', 'vertical stack fit', { anchor: 'look-orientation', match: 'Portrait layout' }),
  S('layout', 'Side rail position (left / right)', 'rail sidebar clock position side location column', { anchor: 'look-side-rail' }),
  S('layout', 'Zmanim page layout', 'board arc tiles sun times', { anchor: 'look-zmanim-layout' }),
  S('layout', 'Schedule page layout', 'timeline list now next', { anchor: 'look-schedule-layout' }),
  S('layout', 'Weather page (turn on / off)', 'weather slide rotation page forecast', { anchor: 'look-weather-page' }),
  S('logo', 'Credit line', 'powered by footer credit text size position', { anchor: 'set-credit-line' }),
  S('logo', 'Logo (upload, look, size, position)', 'logo upload image brand blend plate svg', { anchor: 'look-logo' }),
  S('motion', 'Motion (smooth / minimal / lively)', 'animation transitions speed', { anchor: 'look-motion' }),
  S('motion', 'Graphics (rich / subtle / off)', 'icons drawings patterns decoration', { anchor: 'look-graphics' }),
  // Look & Settings > Screen setup
  S('location', 'Location (zip code)', 'zip postal code city place zmanim chabad location id', { anchor: 'settings-location', match: 'Zip code' }),
  S('location', 'Show location as (place name on the screen)', 'city name display custom blank automatic place title', { anchor: 'settings-location', match: 'Show location as' }),
  S('location', 'Chabad location ID', 'candle lighting chabad.org id', { anchor: 'settings-location', match: 'Chabad location ID' }),
  S('location', 'Time zone', 'timezone clock hours', { anchor: 'settings-location', match: 'Time zone' }),
  S('location', 'Weather in the side rail (temperature, units, test)', 'temperature units fahrenheit celsius forecast rail readout', { anchor: 'set-weather' }),
  S('shows', 'What shows in the side rail (clock, date, parsha, omer, side notes)', 'visibility hide show toggle', { anchor: 'set-visibility' }),
  S('shows', 'Up-next card minutes', 'upcoming next schedule reminder rail', { anchor: 'look-up-next' }),
  S('shows', 'Daily study slide language and items', 'limudim chitas rambam chumash tehillim tanya hebrew english both', { anchor: 'set-daily-study-slide' }),
  S('shows', 'Hayom Yom language', 'hebrew english both', { anchor: 'set-hayom-yom-language' }),
  S('schedule-display', 'Schedule display (full day / scroll / two columns)', 'scroll speed start timetable mode', { anchor: 'set-schedule-display' }),
  S('schedule-display', 'Schedule language (Hebrew / English names first)', 'hebrew english language of the screen', { anchor: 'set-schedule-display', match: 'Language' }),
  S('schedule-display', 'Two schedules in one day (Track A / B)', 'dual track switch time morning afternoon', { anchor: 'set-dual-track-schedule' }),
  // Look & Settings > System
  S('security', 'Trusted devices (2-step)', 'security remember device forget totp', { anchor: 'set-security' }),
  S('this-screen', 'Screen name', 'site name school title sidebar home', { anchor: 'look-site-name' }),
  S('this-screen', 'Storage cleanup', 'disk space delete old uploads cache', { anchor: 'set-storage' }),
  // Look & Settings > Team
  S('team', 'Invite someone', 'add person editor admin invite link new user', { match: 'Invite' }),
  S('team', 'People who can sign in', 'team users roles admin editor remove sign-in link', { match: 'People' }),
  // Everyone
  S('account', 'My account', 'name profile password change 2-step totp authenticator', { match: 'Password' }),
  S('account', 'Alerts on this phone', 'push notifications offline screen zmanim out of date', { match: 'Alerts' }),
  S('account', 'Light / dark appearance', 'theme dark mode light mode system', { match: 'Appearance' }),
  // Screen
  S('slides', 'Slides: turn on / off, reorder, duration', 'rotation slideshow seconds enable disable drag order', { match: 'Slides' }),
  S('slides', 'New slide', 'add web page image photos feed message weather', { match: 'New Slide' }),
  S('images', 'Upload an image or video', 'photo picture gif media library', { match: 'Upload' }),
  S('images', 'Google Photos album', 'photos album connect sync shared', { match: 'Google Photos' }),
  S('rss-feeds', 'News feeds (RSS)', 'rss news feed refresh', { match: 'RSS' }),
  S('daily-word', 'Daily Word', 'yiddish word archive coming up import', { match: 'Daily Word' }),
  // Schedule
  S('schedule', 'Weekly schedule', 'timetable entries categories alerts', { match: 'Weekly' }),
  S('schedule', 'Schedule for one date', 'by date override change tomorrow shabbos', { match: 'By date' }),
  S('schedule', 'Paste / import a schedule (with Claude)', 'ai prompt import paste copy', { match: 'Paste' }),
  S('custom-days', 'Custom days', 'special dates yahrtzeit holiday hebrew date mark', { match: 'Custom' }),
  // Announce
  S('announcements', 'Banner display settings', 'ticker scroll size speed repeat', { match: 'Banner' }),
  S('announcements', 'Archive: delete old announcements after days', 'auto delete archived history', { match: 'Archive' }),
  S('announcements', 'Announcements (slide, banner, side note, takeover)', 'message post live scheduled drafts paused', { match: 'Announcements' }),
];

export const QUICK_ACTIONS = [
  { id: 'qa-new', title: 'New announcement', keywords: 'post message add create slide', action: { type: 'new', kind: 'slide' }, icon: 'message', needs: 'announcements' },
  { id: 'qa-quick', title: 'Quick message', keywords: 'post big words fast two taps call home', action: { type: 'quick' }, icon: 'bolt', needs: 'announcements' },
  { id: 'qa-banner', title: 'New banner', keywords: 'ticker strip bottom', action: { type: 'new', kind: 'banner' }, icon: 'banner', needs: 'announcements' },
  { id: 'qa-takeover', title: 'New takeover', keywords: 'full screen urgent emergency', action: { type: 'new', kind: 'takeover' }, icon: 'takeover', needs: 'announcements' },
  { id: 'qa-pause', title: 'Pause the screen', keywords: 'stop rotation hold freeze', action: { type: 'command', name: 'pause' }, icon: 'pause', needs: 'slides' },
  { id: 'qa-resume', title: 'Resume the screen', keywords: 'play continue unpause', action: { type: 'command', name: 'resume' }, icon: 'play', needs: 'slides' },
  { id: 'qa-blank', title: 'Blank the screen', keywords: 'black off hide', action: { type: 'command', name: 'blank' }, icon: 'close', needs: 'slides' },
  { id: 'qa-next', title: 'Next slide on the screen', keywords: 'advance skip', action: { type: 'command', name: 'advance' }, icon: 'chevron', needs: 'slides' },
  { id: 'qa-preview', title: 'Open live preview in a new tab', keywords: 'view see tv screen', action: { type: 'preview' }, icon: 'external', needs: 'home' },
  { id: 'qa-invite', title: 'Invite someone', keywords: 'add person editor admin team', action: { type: 'go', section: 'team', match: 'Invite' }, icon: 'users', needs: 'team' },
  { id: 'qa-help', title: 'Open Help', keywords: 'how to guide tour', action: { type: 'go', section: 'help' }, icon: 'help', needs: 'help' },
];

// ---------------------------------------------------------------- matching
function lev1(a, b) {
  // true if the edit distance between a and b is <= 1
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function tokenize(q) {
  return String(q || '').toLowerCase().split(/[\s,;/]+/).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
}

function tokenScore(token, words) {
  let best = 0;
  for (const w of words) {
    if (w.startsWith(token)) best = Math.max(best, 3);
    else if (w.includes(token)) best = Math.max(best, 2);
    else if (token.length >= 5 && lev1(token, w.slice(0, token.length))) best = Math.max(best, 1);
  }
  return best;
}

/** Score a record against the query tokens; 0 = no match (every token must hit something). */
export function score(tokens, { title = '', keywords = '', crumb = '' }) {
  if (!tokens.length) return 0;
  const tw = tokenize(title); const kw = tokenize(keywords); const cw = tokenize(crumb);
  let total = 0;
  for (const t of tokens) {
    const a = tokenScore(t, tw); const b = tokenScore(t, kw); const c = tokenScore(t, cw);
    const s = Math.max(a ? a + 2 : 0, b ? b + 1 : 0, c);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Split text into [{text, hit}] so the UI can mark what matched. */
export function highlight(text, tokens) {
  const src = String(text || '');
  if (!tokens.length) return [{ text: src, hit: false }];
  const lower = src.toLowerCase();
  const marks = new Array(src.length).fill(false);
  for (const t of tokens) {
    let from = 0;
    for (;;) {
      const i = lower.indexOf(t, from);
      if (i < 0) break;
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      from = i + t.length;
    }
  }
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += src[i]; else out.push({ text: src[i], hit: marks[i] });
  }
  return out;
}

function crumbOf(section) {
  const sec = sectionInfo(section);
  const area = areaInfo(areaOfSection(section));
  return [area && area.key !== 'home' ? area.en : null, sec?.en].filter(Boolean).join(' › ');
}

export const GROUPS = [
  { key: 'actions', title: 'Quick actions' },
  { key: 'settings', title: 'Settings & features' },
  { key: 'content', title: 'On the screen' },
  { key: 'help', title: 'Help' },
];

/**
 * Run a search. `state` is the admin state; `role` filters out anything the person cannot open.
 * Returns [{ key, title, items: [{ id, title, sub, icon, tokens, action, inline? }] }] (empty groups dropped).
 */
export function search(query, { state = {}, role } = {}) {
  const tokens = tokenize(query);
  const can = (section) => canOpenSection(role, section);
  const tz = state?.settings?.location?.timezone;
  const out = { actions: [], settings: [], content: [], help: [] };
  const push = (g, rec, s) => out[g].push({ ...rec, tokens, _s: s });

  for (const q of QUICK_ACTIONS) {
    if (!can(q.needs)) continue;
    const s = tokens.length ? score(tokens, q) : 1;
    if (s) push('actions', { id: q.id, title: q.title, sub: 'Action', icon: q.icon, action: q.action }, s);
  }
  if (!tokens.length) {
    return GROUPS.map((g) => ({ ...g, items: out[g.key].slice(0, 6) })).filter((g) => g.items.length);
  }

  for (const [i, e] of SETTINGS_INDEX.entries()) {
    if (!can(e.section)) continue;
    const crumb = crumbOf(e.section);
    const s = score(tokens, { title: e.title, keywords: e.keywords, crumb });
    if (s) push('settings', { id: `set-${i}`, title: e.title, sub: crumb, icon: 'gear', action: { type: 'go', section: e.section, anchor: e.anchor, match: e.match } }, s);
  }

  if (can('announcements')) {
    for (const a of state.announcements || []) {
      const title = announcementTitle(a);
      const st = announcementStatus(a, new Date(), { tz });
      if (st === 'archived') continue;
      const c = a.content || {};
      const s = score(tokens, { title, keywords: [c.bodyEn, c.bodyHe, c.subtitle, c.event?.place, a.display].filter(Boolean).join(' ') });
      if (s) {
        const paused = st === 'paused';
        push('content', {
          id: `ann-${a.id}`, title, sub: `Announcement · ${a.display || 'slide'} · ${st}`, icon: 'megaphone',
          action: { type: 'edit-announcement', item: a },
          inline: st === 'live' || st === 'paused' || st === 'scheduled' ? { label: paused ? 'Resume' : 'Pause', action: { type: 'toggle-announcement', item: a, enabled: paused } } : null,
        }, s + 1);
      }
    }
  }
  if (can('slides')) {
    for (const sl of state.slides || []) {
      const title = slideLabel(sl);
      const s = score(tokens, { title, keywords: `slide ${sl.type || ''}` });
      if (s) push('content', { id: `slide-${sl.id}`, title, sub: `Slide · ${sl.enabled ? 'on' : 'off'}`, icon: 'screen', action: { type: 'go', section: 'slides', match: title } }, s);
    }
  }
  if (can('schedule')) {
    for (const e of state.scheduleEntries || []) {
      const s = score(tokens, { title: `${e.name || ''} ${e.nameHe || ''}`, keywords: `schedule ${e.category || ''}` });
      if (s) push('content', { id: `sch-${e.id}`, title: e.name || e.nameHe || 'Schedule item', sub: `Schedule · ${formatTime12(e.time)}`, icon: 'clock', action: { type: 'go', section: 'schedule', match: e.name } }, s);
    }
  }
  if (can('custom-days')) {
    for (const d of state.customDays || []) {
      const s = score(tokens, { title: d.title || '', keywords: 'custom day special date' });
      if (s) push('content', { id: `day-${d.id}`, title: d.title || 'Custom day', sub: 'Custom day', icon: 'calendar', action: { type: 'go', section: 'custom-days', match: d.title } }, s);
    }
  }
  if (can('help')) {
    for (const t of TOPICS) {
      const s = score(tokens, { title: t.title, keywords: (t.body || []).join(' ') });
      if (s) push('help', { id: `help-${t.id}`, title: t.title, sub: 'Help', icon: 'help', action: { type: 'go', section: 'help', match: t.title } }, s);
    }
    for (const g of GLOSSARY) {
      const s = score(tokens, { title: g.term, keywords: g.text });
      if (s) push('help', { id: `gloss-${g.term}`, title: g.term, sub: 'Help · what it means', icon: 'help', action: { type: 'go', section: 'help', match: g.term } }, s);
    }
  }

  return GROUPS.map((g) => ({
    ...g,
    items: out[g.key].sort((a, b) => b._s - a._s).slice(0, g.key === 'settings' ? 8 : 6),
  })).filter((g) => g.items.length);
}
