// Small admin-side helpers for the Announcements composer and list.
import { listRow } from '../../../shared/takeoverModel.js';
import { STYLE_GROUPS, STYLE_INFO, ANIMATIONS, ANIMATION_LABEL, DEFAULT_ANIMATION } from '../../../shared/takeoverStyles.js';

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
  { value: 'list', label: 'List', explain: 'A heading and a few short items (optional day and time on each).' },
  { value: 'quicktime', label: 'Quick time', explain: '"Mincha 1:45": the time stands out. Optional second time, old time, or a countdown number.' },
  { value: 'quote', label: 'Quote', explain: 'A short saying, set large, with its source.' },
  { value: 'sicha', label: 'Sicha', explain: 'An excerpt at a readable size. Long text splits into pages (1/3, 2/3...).' },
  { value: 'letter', label: 'Letter', explain: 'A letter with a date, greeting, body and signature. Long letters page the same way.' },
  { value: 'notice', label: 'Notice', explain: 'A small line, one BIG name or time, a small line. What quick messages use.' },
  { value: 'classic', label: 'Classic', explain: 'The original templates and styled cards.' },
];

export const LAYOUT_LABEL = Object.fromEntries(LAYOUT_OPTIONS.map((l) => [l.value, l.label]));

/** Style picker: the 26 styles in groups (round 3b), plus "Theme" (no style). */
export const STYLE_PICKER_GROUPS = STYLE_GROUPS.map((g) => ({
  ...g,
  options: g.ids.map((id) => ({ value: id, label: STYLE_INFO[id][0], desc: STYLE_INFO[id][1] })),
}));
export const STYLE_OPTIONS = [
  { value: '', label: 'Theme', desc: 'The screen’s own colours (drawn as Classic)' },
  ...STYLE_PICKER_GROUPS.flatMap((g) => g.options),
];

export const ANIMATION_OPTIONS = ANIMATIONS.map((v) => ({ value: v, label: ANIMATION_LABEL[v] }));

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
      targetHe: '',
      event: { title: '', titleHe: '', day: '', dayHe: '', time: '', place: '', place2: '', placeHe: '' },
      list: { heading: '', headingHe: '', items: [{ text: '', textHe: '', day: '', time: '' }, { text: '', textHe: '', day: '', time: '' }] },
      quicktime: { time: '', name: '', nameHe: '', place: '', placeHe: '', time2: '', label: '', labelHe: '', label2: '', label2He: '', was: '', big: '', bigLabel: '', pre: '' },
      quote: { text: '', textHe: '', source: '', sourceHe: '' },
      sicha: { title: '', titleHe: '', body: '', source: '' },
      letter: { date: '', dateHe: '', salutation: '', body: '', signature: '', source: '', sourceHe: '' },
      notice: { pre: '', focus: '', post: '', preHe: '', focusHe: '', postHe: '' },
    },
    look: { layout: 'bigwords', style: null, animation: DEFAULT_ANIMATION, template: 'announcement', fit: 'auto', maxFontPx: null, fullscreen: false },
    slide: { duration: 12, label: '' },
    note: { icon: null, order: 0 },
    takeover: { group: null, rotateSec: 10 },
    banner: { size: null, speed: null, repeat: null },
    when: { startsAt: null, expiresAt: null, lastDurationMin: null, recurrence: null },
  };
}

/** A list item as the composer edits it: { text, textHe, day, time } (old data was a plain string). */
export function toListObject(x) {
  if (x && typeof x === 'object') return { text: x.text || '', textHe: x.textHe || '', day: x.day || '', time: x.time || '' };
  const r = listRow(x);
  return { text: r.en, textHe: r.he, day: '', time: '' };
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
      list: { ...base.content.list, ...(c.list || {}), items: (c.list?.items?.length ? c.list.items.map(toListObject) : base.content.list.items) },
      quicktime: { ...base.content.quicktime, ...(c.quicktime || {}) },
      quote: { ...base.content.quote, ...(c.quote || {}) },
      sicha: { ...base.content.sicha, ...(c.sicha || {}) },
      letter: { ...base.content.letter, ...(c.letter || {}) },
      notice: { ...base.content.notice, ...(c.notice || {}) },
    },
    look: { ...base.look, ...(item?.look || {}), layout: item?.look?.layout || 'classic' },
    slide: { ...base.slide, ...(item?.slide || {}) },
    note: { ...base.note, ...(item?.note || {}) },
    takeover: { ...base.takeover, ...(item?.takeover || {}) },
    banner: { ...base.banner, ...(item?.banner || {}) },
    when: { ...base.when, ...(item?.when || {}) },
  };
}
