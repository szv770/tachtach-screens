// Small admin-side helpers for the Announcements composer and list.

export const DISPLAY_OPTIONS = [
  { value: 'slide', label: 'Slide', explain: 'Takes its turn in the slideshow with the other slides.' },
  { value: 'banner', label: 'Banner', explain: 'Scrolls along the bottom. Never stops the slideshow.' },
  { value: 'note', label: 'Side note', explain: 'A small note in the side column (up to 3 show at once).' },
  { value: 'takeover', label: 'Takeover', explain: 'Covers the whole screen and pauses everything.' },
];

export const DISPLAY_LABEL = { slide: 'Slide', banner: 'Banner', note: 'Side note', takeover: 'Takeover' };

export const LAYOUT_OPTIONS = [
  { value: 'bigwords', label: 'Big words', explain: 'A short message, sized as big as fits.' },
  { value: 'event', label: 'Event', explain: 'Title, day and time tiles, place.' },
  { value: 'list', label: 'List', explain: 'A heading and a few short items.' },
  { value: 'quicktime', label: 'Quick time', explain: '"Mincha 1:45" — the time stands out.' },
  { value: 'classic', label: 'Classic', explain: 'The original templates and styled cards.' },
];

export const LAYOUT_LABEL = Object.fromEntries(LAYOUT_OPTIONS.map((l) => [l.value, l.label]));

// All 11 takeover styles (the 6 StyledSlide ones are a subset). For a slide in
// the Classic layout the takeover-only styles render as a slide card.
export const STYLE_OPTIONS = [
  { value: '', label: 'Theme', desc: 'Screen colours', swatch: null },
  { value: 'classic', label: 'Classic', desc: 'Clean, minimal', swatch: '#C4342D' },
  { value: 'grand', label: 'Grand', desc: 'Gold shimmer', swatch: 'linear-gradient(135deg,#1a1000,#FFD700)' },
  { value: 'emergency', label: 'Emergency', desc: 'Red alert', swatch: '#DC2626' },
  { value: 'sleek', label: 'Sleek', desc: 'Modern, black', swatch: 'linear-gradient(135deg,#000,#6366F1)' },
  { value: 'celebration', label: 'Celebration', desc: 'Joyful', swatch: 'linear-gradient(135deg,#FF006E,#8338EC,#3A86FF)' },
  { value: 'urgent', label: 'Notice', desc: 'Amber attention', swatch: '#FFC107' },
  { value: 'torah', label: 'Torah', desc: 'Shiur, learning', swatch: 'linear-gradient(135deg,#0A0E1A,#D4A84B)' },
  { value: 'trip', label: 'Trip', desc: 'Outing', swatch: 'linear-gradient(180deg,#0369A1,#7DD3FC)' },
  { value: 'phone', label: 'Phone', desc: 'Call to action', swatch: 'linear-gradient(135deg,#0F172A,#38BDF8)' },
  { value: 'memorial', label: 'Memorial', desc: 'Yahrzeit', swatch: 'linear-gradient(135deg,#08060F,#C8B496)' },
  { value: 'hype', label: 'Hype', desc: 'Excitement', swatch: 'linear-gradient(135deg,#A855F7,#06B6D4)' },
];

export const TEMPLATE_OPTIONS = [
  { value: 'headline', label: 'Headline' },
  { value: 'quote', label: 'Quote' },
  { value: 'info', label: 'Info' },
  { value: 'announcement', label: 'Announcement' },
];

export const DAY_CHIPS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

/** ISO → value for <input type="datetime-local"> in the browser's zone. */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function localInputToIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Forgiving time parser: "21:30", "9:30 pm", "930p", "9pm", "9.30" → "HH:MM".
 * Returns null if it can't make sense of it, '' for empty.
 */
export function parseTimeInput(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return '';
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/.exec(t);
  if (!m) return null;
  let h = +m[1];
  const mi = m[2] ? +m[2] : 0;
  if (mi > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    const pm = m[3].startsWith('p');
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

/** "13:45" → "1:45 PM" for showing in a text box. */
export function timeToDisplay(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return hhmm || '';
  const h = +m[1];
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

export function minutesLabel(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h >= 48 && m === 0 && h % 24 === 0) return `${h / 24} days`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function endOfDay(from = new Date()) {
  const d = new Date(from);
  d.setHours(23, 59, 0, 0);
  return d;
}

export function emptyItem(display = 'slide') {
  return {
    status: 'published',
    display,
    hold: false,
    enabled: true,
    content: {
      headlineEn: '', headlineHe: '', bodyEn: '', bodyHe: '', subtitle: '', target: '', attribution: '',
      event: { title: '', titleHe: '', day: '', time: '', place: '', placeHe: '' },
      list: { heading: '', headingHe: '', items: ['', ''] },
      quicktime: { time: '', name: '', nameHe: '', place: '' },
    },
    look: { layout: 'bigwords', style: null, template: 'announcement', fit: 'auto', maxFontPx: null, fullscreen: false },
    slide: { duration: 12, label: '' },
    note: { icon: null, order: 0 },
    takeover: { group: null, rotateSec: 10 },
    banner: { size: null, speed: null, repeat: null },
    when: { startsAt: null, expiresAt: null, lastDurationMin: null, recurrence: null },
  };
}

/** Deep-fill an existing item with defaults so the composer can edit any field. */
export function withDefaults(item) {
  const base = emptyItem(item?.display || 'slide');
  const c = item?.content || {};
  return {
    ...base,
    ...item,
    content: {
      ...base.content, ...c,
      event: { ...base.content.event, ...(c.event || {}) },
      list: { ...base.content.list, ...(c.list || {}), items: (c.list?.items?.length ? c.list.items : base.content.list.items) },
      quicktime: { ...base.content.quicktime, ...(c.quicktime || {}) },
    },
    look: { ...base.look, ...(item?.look || {}), layout: item?.look?.layout || 'classic' },
    slide: { ...base.slide, ...(item?.slide || {}) },
    note: { ...base.note, ...(item?.note || {}) },
    takeover: { ...base.takeover, ...(item?.takeover || {}) },
    banner: { ...base.banner, ...(item?.banner || {}) },
    when: { ...base.when, ...(item?.when || {}) },
  };
}
