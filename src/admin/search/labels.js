// Plain-language labels for things in state, shared by Home and global search.
import { entryRunsOnDay, isEntryActiveOn } from '../../shared/scheduleDays.js';

const TYPE_NAMES = {
  ZMANIM: 'Zmanim', LIMUDIM: 'Daily study', HAYOM_YOM: 'Hayom Yom', PIRKEI_AVOS: 'Pirkei Avos',
  DAILY_QUOTE: 'Daily quote', DAILY_WORD: 'Daily Word', BIRTHDAYS: 'Birthdays', PARSHA_TIDBITS: 'Parsha tidbits',
  SCHEDULE: 'Schedule', WEATHER: 'Weather', RSS_SLIDE: 'News feed', MIVTZAH_LEADERBOARD: 'Mivtzah leaderboard',
  MIVTZAH_LIVE_EMBED: 'Mivtzah live', VIDEO_SLIDE: 'Video', PDF_SLIDE: 'PDF', IMAGE_SLIDE: 'Image',
  GOOGLE_PHOTOS_SLIDE: 'Google Photos', ANNOUNCEMENT: 'Message', WEB_PAGE: 'Web page',
};

export function slideLabel(s) {
  if (!s) return '';
  if (s.label) return s.label;
  if (s.type === 'WEB_PAGE') {
    try { return `Web page · ${new URL(s.url).hostname.replace(/^www\./, '')}`; } catch { /* fall through */ }
  }
  return TYPE_NAMES[s.type] || 'Slide';
}

export function announcementTitle(a) {
  const c = a?.content || {};
  return (c.headlineEn || c.headlineHe || c.event?.title || c.event?.titleHe || c.quicktime?.name || c.quicktime?.nameHe
    || c.list?.heading || c.list?.headingHe || c.quote?.text || c.sicha?.title || c.bodyEn || c.bodyHe || a?.slide?.label || 'Untitled').toString().trim().slice(0, 90);
}

export function formatTime12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return String(hhmm || '');
  const h = +m[1];
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
}

/** Next weekly-schedule entry later today (base schedule only, ignores by-date overrides). */
export function nextScheduleEntry(entries = [], now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const e of entries) {
    if (!isEntryActiveOn(e, now)) continue;
    const m = /^(\d{1,2}):(\d{2})$/.exec(e.time || '');
    if (!m) continue;
    const t = +m[1] * 60 + +m[2];
    if (t >= mins && (!best || t < best.t)) best = { t, entry: e };
  }
  return best?.entry || null;
}

export { entryRunsOnDay };
