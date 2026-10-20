import { primaryText } from '../../../shared/announcements.js';

// The slide type registry: ONE table that drives the Slides list labels, the
// "New slide" card grid and the per-slide pencil popups. To add a slide type (or
// give another site a different set), add a row here; nothing else lists types.
// No site-specific names live here: school content comes from settings/data.
//
//   id        slide `type` as stored in data/slides.json
//   label     name in the list / grid
//   group     which New-slide card it belongs to (SLIDE_GROUPS)
//   icon      key of ui/Icon.jsx
//   desc      one line for the grid
//   create    what "add this" does:
//               { kind: 'navigate', section, tab? }   go to another admin page (Media tabs)
//               { kind: 'composer' }                   open the announcement composer
//               { kind: 'builtin' }                   built-in page: turn on its row (or add it), then set it up
//               { kind: 'web' }                       web address form, creates the slide here
//               { kind: 'embed' }                     web address form for an embed slide
//   editGo    the pencil goes to this page ({ section, tab? }) instead of opening a popup
//   edit      sections shown in the pencil popup (see SlideEditSheet FIELD_SECTIONS); duration + label are always there
//   deletable can the row be deleted (built-in pages are only switched off)
//   defaults  fields a new row starts with
//   variant   short chip text when this type is one of several kinds inside one card

export const SLIDE_GROUPS = [
  { id: 'media', label: 'Photo, video or web', icon: 'image', big: true, blurb: 'Upload or pick from your library, an album, a web page or a news feed.' },
  { id: 'text', label: 'Message', icon: 'message', blurb: 'Words on screen, any style' },
  { id: 'builtin', label: 'Built-in page', icon: 'star', blurb: 'Zmanim, learning, Hayom Yom, weather…' },
  { id: 'other', label: 'Other', icon: 'external', blurb: 'Live embeds from another app' },
];

export const SLIDE_TYPES = [
  // Media (one card, variants inside)
  { id: 'IMAGE_SLIDE', label: 'Image', variant: 'Image', group: 'media', icon: 'image', desc: 'A picture from your library.', create: { kind: 'navigate', section: 'images', tab: 'library' }, edit: ['image', 'fullscreen'], deletable: true, defaults: { duration: 15 } },
  { id: 'VIDEO_SLIDE', label: 'Video', variant: 'Video', group: 'media', icon: 'play', desc: 'A video from your library.', create: { kind: 'navigate', section: 'images', tab: 'library' }, edit: ['fullscreen'], deletable: true, defaults: { duration: 30 } },
  { id: 'PDF_SLIDE', label: 'PDF', variant: 'PDF', group: 'media', icon: 'copy', desc: 'A PDF shown page by page.', create: { kind: 'navigate', section: 'images', tab: 'library' }, edit: ['pdf', 'fullscreen'], deletable: true, defaults: { duration: 30, pageSeconds: 10 } },
  { id: 'GOOGLE_PHOTOS_SLIDE', label: 'Google Photos', variant: 'Photo album', group: 'media', icon: 'image', desc: 'A shared Google Photos album.', create: { kind: 'navigate', section: 'images', tab: 'photos' }, edit: ['photos', 'fullscreen'], editGo: { section: 'images', tab: 'photos' }, deletable: true, defaults: { duration: 30 } },
  { id: 'WEB_PAGE', label: 'Web page', variant: 'Web page', group: 'media', icon: 'external', desc: 'Show any website, such as a live fundraiser screen.', create: { kind: 'web' }, edit: ['web', 'fullscreen'], editGo: { section: 'images', tab: 'web' }, deletable: true, defaults: { label: 'Web page', duration: 30 } },
  { id: 'RSS_SLIDE', label: 'News feed', variant: 'News feed', group: 'media', icon: 'rss', desc: 'Headlines or a daily item from a feed.', create: { kind: 'navigate', section: 'images', tab: 'feeds' }, edit: ['rss'], editGo: { section: 'images', tab: 'feeds' }, deletable: true, defaults: { duration: 15 } },

  // Text
  { id: 'ANNOUNCEMENT', label: 'Message', group: 'text', icon: 'message', desc: 'Text, event, list or time. Opens the composer.', create: { kind: 'composer' }, edit: [], deletable: true },

  // Built-in pages (singletons: the row exists, you switch it on)
  { id: 'ZMANIM', label: 'Zmanim', group: 'builtin', icon: 'sun', desc: 'Today\'s halachic times.', create: { kind: 'builtin' }, edit: ['zmanim'], defaults: { duration: 15 } },
  { id: 'LIMUDIM', label: 'Limudim', group: 'builtin', icon: 'word', desc: 'Chitas, Rambam, Tanya and the daily study.', create: { kind: 'builtin' }, edit: ['limudim'], defaults: { duration: 15 } },
  { id: 'HAYOM_YOM', label: 'Hayom Yom', group: 'builtin', icon: 'word', desc: 'The day\'s Hayom Yom teaching.', create: { kind: 'builtin' }, edit: ['hayomYom'], defaults: { duration: 25 } },
  { id: 'PIRKEI_AVOS', label: 'Pirkei Avos', group: 'builtin', icon: 'word', desc: 'This week\'s chapter. Seasonal.', create: { kind: 'builtin' }, edit: [], defaults: { duration: 13 } },
  { id: 'WEATHER', label: 'Weather', group: 'builtin', icon: 'sun', desc: 'Current conditions and forecast.', create: { kind: 'builtin' }, edit: ['weather'], defaults: { duration: 15 } },
  { id: 'DAILY_WORD', label: 'Daily Word', group: 'builtin', icon: 'word', desc: 'A new word every day.', create: { kind: 'builtin' }, edit: ['dailyWord'], editGo: { section: 'daily-word' }, defaults: { duration: 20 } },
  { id: 'BIRTHDAYS', label: 'Birthdays', group: 'builtin', icon: 'star', desc: 'Happy birthday to the bochurim whose Hebrew birthday it is. Only shows on those days.', create: { kind: 'builtin' }, edit: [], editGo: { section: 'roster' }, defaults: { duration: 15 } },
  { id: 'SCHEDULE', label: 'Schedule / Seder', group: 'builtin', icon: 'calendar', desc: 'The day\'s timetable.', create: { kind: 'builtin' }, edit: ['schedule'], editGo: { section: 'schedule' }, defaults: { duration: 20 } },
  { id: 'DAILY_QUOTE', label: 'Daily Quote', group: 'builtin', icon: 'message', desc: 'A daily vort or quote.', create: { kind: 'builtin' }, edit: [], defaults: { duration: 12 } },
  { id: 'PARSHA_TIDBITS', label: 'Parsha Tidbits', group: 'builtin', icon: 'list', desc: 'Short points on the weekly parsha.', create: { kind: 'builtin' }, edit: [], defaults: { duration: 25 } },

  // Other
  { id: 'MIVTZAH_LEADERBOARD', label: 'Mivtzah Leaderboard', group: 'other', icon: 'star', desc: 'The Mivtzah points leaderboard.', create: { kind: 'builtin' }, edit: [], defaults: { duration: 20 } },
  { id: 'MIVTZAH_LIVE_EMBED', label: 'Mivtzah Live Screen (embed)', group: 'other', icon: 'external', desc: 'The public live page of your Mivtzah app, full screen.', create: { kind: 'embed' }, edit: ['embed', 'fullscreen'], deletable: true, defaults: { duration: 30 } },
];

const BY_ID = Object.fromEntries(SLIDE_TYPES.map((t) => [t.id, t]));
export const typeInfo = (id) => BY_ID[id] || null;
export const typesInGroup = (group) => SLIDE_TYPES.filter((t) => t.group === group);

/** Types that are "pages that already exist as a row" (switch on, don't add a copy). */
export const isBuiltIn = (id) => BY_ID[id]?.create?.kind === 'builtin';
/** Rows the person may delete (everything but the built-in pages). */
export const isDeletable = (slide) => !!BY_ID[slide?.type]?.deletable || !BY_ID[slide?.type];
export const isEmbedType = (id) => id === 'WEB_PAGE' || id === 'MIVTZAH_LIVE_EMBED';

/** The name a row shows in the Slides list. */
export function slideTitle(slide, { announcementsById } = {}) {
  const t = slide.type;
  if (t === 'WEB_PAGE') {
    let host = '';
    try { host = new URL(slide.embedUrl).hostname.replace(/^www\./, ''); } catch { /* not set yet */ }
    return slide.label && slide.label !== 'Web page' ? slide.label : (host ? `Web page · ${host}` : 'Web page (no address yet)');
  }
  if (t === 'ANNOUNCEMENT') {
    const a = announcementsById?.get(slide.announcementId);
    if (!a) return 'Message (deleted)';
    return String(primaryText(a) || '').split('\n')[0] || 'Message';
  }
  const info = BY_ID[t];
  if (info) return slide.label || info.label;
  return slide.titleEn || slide.titleHe || slide.template || 'Custom';
}

// Option lists for the popups (kept local: no coupling to the media components).
export const LIMUDIM_ITEMS = [
  { key: 'chumash', label: 'Chumash' },
  { key: 'tehillim', label: 'Tehillim' },
  { key: 'tanya', label: 'Tanya' },
  { key: 'rambam1', label: 'Rambam, 1 chapter' },
  { key: 'rambam3', label: 'Rambam, 3 chapters' },
  { key: 'sefer', label: 'Sefer HaMitzvos' },
];
export const LANGS = [{ value: 'both', label: 'Both' }, { value: 'hebrew', label: 'Hebrew only' }, { value: 'english', label: 'English only' }];
export const IMAGE_FIT = [
  { value: 'fit', label: 'Fit (show all of it)' },
  { value: 'fill', label: 'Fill (crop to cover)' },
  { value: 'stretch', label: 'Stretch' },
];
export const IMAGE_EDGE = [
  { value: 'blur', label: 'Blur' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];
export const PHOTO_LAYOUTS = [
  { value: 'single', label: 'Single photo' },
  { value: 'fullscreen', label: 'Fullscreen' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'collage-2', label: 'Collage, 2 photos' },
  { value: 'collage-4', label: 'Collage, 4 photos' },
  { value: 'collage-6', label: 'Collage, 6 photos' },
];
export const PHOTO_ORDER = [{ value: 'album', label: 'Album order' }, { value: 'random', label: 'Random' }, { value: 'newest', label: 'Newest first' }];
export const RSS_MODES = [{ value: 'latest', label: 'Latest item' }, { value: 'random', label: 'Random daily' }];
export const RSS_STYLES = [{ value: '', label: 'None' }, { value: 'classic', label: 'Classic' }, { value: 'grand', label: 'Grand' }, { value: 'sleek', label: 'Sleek' }];
export const WEB_RELOAD = [
  { value: 0, label: 'Never (the page updates itself)' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
  { value: 120, label: 'Every 2 minutes' },
  { value: 300, label: 'Every 5 minutes' },
  { value: 600, label: 'Every 10 minutes' },
];
export const WEB_ZOOM = [50, 60, 70, 80, 90, 100, 110, 125, 150];
