/**
 * Daily Story: pure rules shared by the kiosk, admin and server (same pattern as dailyWords.js).
 *
 * Data (data/daily-stories.json, falls back to the starter library until first save):
 *   { version: 1, order: 'shuffle' | 'sequential', stories: [Story], history: { 'YYYY-MM-DD': Snapshot } }
 *   history = the story that actually showed each day (recorded by the server), so reordering or editing
 *   the list later never changes what was already on screen; it is also the admin's archive.
 *   Story = { id, enabled, kind: 'story' | 'thought', title, titleHe, text, textHe, source, tags, showOn? }
 *
 * The story of the day is a pure function of the date (+ the list): every screen and a restart agree.
 * Default order is 'shuffle': a fixed shuffle per cycle, so no story repeats until all of them have shown.
 */

import { wpmFor } from './longText.js';
import { changeToday, syncTodaySnapshot } from './dailyToday.js';
import { sanitizeLetterLook, NEW_LETTER_LOOK, MAX_LETTER_BODY } from './letterhead.js';
import { LETTER_FIELDS, defaultTitle } from './savedLetters.js';
import { normalizeStyleId } from './takeoverStyles.js';

export const KINDS = ['story', 'thought', 'letter'];
export const LIMITS = { title: 90, titleHe: 90, text: 700, textHe: 700, source: 100, tag: 24, tags: 8, stories: 500, letterBody: MAX_LETTER_BODY, letters: 300 };
export const HISTORY_LIMIT = 800;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, max);
const line = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

let counter = 0;
const newId = () => `s_${Date.now().toString(36)}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * A LETTER entry: the whole letter (same fields as an announcement's content.letter), how it is drawn (`paper` =
 * look.letter) and the takeover style behind it. `text` keeps a short preview of the body for lists and search;
 * the kiosk draws the letter fields. No source rule: a letter is its own source.
 */
function normalizeLetterEntry(input) {
  const src = input.letter && typeof input.letter === 'object' ? input.letter : {};
  const letter = {};
  if (String(src.body ?? '').length > MAX_LETTER_BODY) return { error: `"${line(input.title, LIMITS.title) || 'This letter'}" is too long (${String(src.body).length} characters; the most is ${MAX_LETTER_BODY}). Split it into two letters.` };
  for (const k of LETTER_FIELDS) letter[k] = String(src[k] ?? '').replace(/\r\n?/g, '\n').slice(0, k === 'body' ? LIMITS.letterBody : 300).trim();
  if (!letter.body) return { error: `"${line(input.title, LIMITS.title) || 'Untitled letter'}" needs the letter text` };
  const tagsIn = Array.isArray(input.tags) ? input.tags : typeof input.tags === 'string' ? input.tags.split(',') : [];
  const out = {
    id: line(input.id, 60) || newId(),
    enabled: input.enabled !== false,
    kind: 'letter',
    title: line(input.title, LIMITS.title) || defaultTitle('letter', letter),
    titleHe: line(input.titleHe, LIMITS.titleHe),
    text: letter.body.replace(/\s+/g, ' ').slice(0, LIMITS.text),
    textHe: '',
    source: line(input.source || letter.source || letter.sourceHe, LIMITS.source),
    tags: tagsIn.map((t) => line(t, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags),
    letter,
    paper: sanitizeLetterLook({ ...NEW_LETTER_LOOK, ...(input.paper && typeof input.paper === 'object' ? input.paper : {}) }),
    style: input.style ? normalizeStyleId(input.style) : null,
  };
  if (ISO.test(String(input.showOn || ''))) out.showOn = String(input.showOn);
  return { story: out };
}

/** Clean one entry. Returns { story } or { error } (needs some text, English or Hebrew). */
export function normalizeStory(input) {
  if (!input || typeof input !== 'object') return { error: 'not an object' };
  if (input.kind === 'letter') return normalizeLetterEntry(input);
  const text = str(input.text ?? input.story ?? input.english, LIMITS.text);
  const textHe = str(input.textHe ?? input.hebrew, LIMITS.textHe);
  const title = line(input.title, LIMITS.title);
  if (!text && !textHe) return { error: `"${title || 'Untitled'}" needs the story text` };
  const tagsIn = Array.isArray(input.tags) ? input.tags : typeof input.tags === 'string' ? input.tags.split(',') : [];
  const out = {
    id: line(input.id, 60) || newId(),
    enabled: input.enabled !== false,
    kind: KINDS.includes(input.kind) ? input.kind : 'story',
    title,
    titleHe: line(input.titleHe, LIMITS.titleHe),
    text,
    textHe,
    source: line(input.source, LIMITS.source),
    tags: tagsIn.map((t) => line(t, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags),
  };
  if (ISO.test(String(input.showOn || ''))) out.showOn = String(input.showOn);
  // A story is only shown with a real source (owner rule): without one it stays hidden until a source is added.
  if (out.kind === 'story' && !out.source) out.enabled = false;
  return { story: out };
}

/**
 * Clean a list; drops invalid entries and reports why. Duplicate ids are re-issued.
 * `pool` = 'story' (Daily Story: stories + thoughts, letters are not accepted here) or 'letter' (Daily Letter:
 * every entry is a letter).
 */
export function normalizeStories(list, pool = 'story') {
  const stories = [];
  const errors = [];
  const seen = new Set();
  const cap = pool === 'letter' ? LIMITS.letters : LIMITS.stories;
  (Array.isArray(list) ? list : []).slice(0, cap).forEach((raw, i) => {
    if (pool === 'story' && raw?.kind === 'letter') return; // letters have their own page and list
    const r = normalizeStory(pool === 'letter' && raw && typeof raw === 'object' ? { ...raw, kind: 'letter' } : raw);
    if (r.error) { errors.push({ index: i, error: r.error }); return; }
    if (seen.has(r.story.id)) r.story.id = newId();
    seen.add(r.story.id);
    stories.push(r.story);
  });
  return { stories, errors };
}

/** Parse pasted text: a JSON list, { stories: [...] }, or JSON inside a ```fence```. */
export function parseStoriesText(text, pool = 'story') {
  let raw = String(text ?? '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  if (!raw) return { stories: [], errors: [{ index: -1, error: 'nothing to import' }] };
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    const a = raw.indexOf('['); const b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { data = JSON.parse(raw.slice(a, b + 1)); } catch { /* fall through */ } }
    if (data === undefined) return { stories: [], errors: [{ index: -1, error: 'could not read it as JSON: ' + e.message }] };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.stories) ? data.stories : null;
  if (!list) return { stories: [], errors: [{ index: -1, error: 'expected a JSON list of stories' }] };
  return normalizeStories(list, pool);
}

/** Copy kept in the archive (survives the entry being edited or deleted). */
export function snapshotOf(s) {
  if (s.kind === 'letter') return { id: s.id, kind: 'letter', title: s.title || '', titleHe: s.titleHe || '', text: s.text || '', textHe: '', source: s.source || '', letter: { ...(s.letter || {}) }, paper: s.paper, style: s.style || null };
  return { id: s.id, kind: s.kind || 'story', title: s.title || '', titleHe: s.titleHe || '', text: s.text || '', textHe: s.textHe || '', source: s.source || '' };
}

/** Days of history that keep a letter's WHOLE text (so today's letter survives its entry being deleted); older days keep a short preview. */
const FULL_LETTER_DAYS = 7;
const LETTER_PREVIEW = 240;

function normalizeHistory(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  const keys = Object.keys(h).filter((k) => ISO.test(k)).sort().slice(-HISTORY_LIMIT);
  keys.forEach((k, i) => {
    const r = normalizeStory(h[k]);
    if (r.error) return;
    let snap = snapshotOf(r.story);
    // the archive only needs to say WHICH letter showed: a 30,000-character letter kept for 800 days would lock the list (size budget)
    if (snap.kind === 'letter' && i < keys.length - FULL_LETTER_DAYS) {
      const body = String(snap.letter?.body || '').replace(/\s+/g, ' ').slice(0, LETTER_PREVIEW);
      snap = { ...snap, letter: { ...snap.letter, body }, text: body };
    }
    out[k] = { ...snap, ...(h[k]?.manual === true ? { manual: true } : {}) };
  });
  return out;
}

/** Whole-file normaliser (server + kiosk): always a usable { order, stories, history }. */
export function normalizeDailyStoriesFile(file, seed = [], pool = 'story') {
  const has = file && Array.isArray(file.stories);
  const { stories } = normalizeStories(has ? file.stories : seed, pool);
  return { version: 1, order: file?.order === 'sequential' ? 'sequential' : 'shuffle', stories, history: normalizeHistory(file?.history) };
}

/**
 * The Daily Letter copy for the kiosk and the live link: like forKiosk, but a letter that is switched off never shows, so its
 * (long) text is not sent at all. Keeps every state load and every SSE update small.
 */
export function lettersForKiosk(file, keep = 3) {
  const k = forKiosk(file, keep);
  return { ...k, stories: (k.stories || []).filter((s) => s.enabled !== false) };
}

/** The most the letter list may weigh as JSON (the server refuses a save or import that would pass it; the parser takes 1 MB). */
export const LETTER_FILE_MAX_BYTES = 900000;

/** The slice the kiosk needs: the list plus only the last few days of history. */
export function forKiosk(file, keep = 3) {
  const keys = Object.keys(file?.history || {}).sort().slice(-keep);
  return { ...file, history: Object.fromEntries(keys.map((k) => [k, file.history[k]])) };
}

// ── Picking today's story ───────────────────────────────────────────────────

export function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}
export function addDaysISO(iso, n) {
  return new Date((dayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic permutation of 0..n-1 for a cycle (a different salt from the Daily Word, so they don't move in step). */
export function permutation(n, cycle) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(0x51ed27a3 ^ Math.imul(cycle + 1, 2654435761));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/** The rotation rule alone (ignores history). A story pinned to the date wins; stories pinned to other dates wait. */
export function pickFromRotation(file, iso) {
  const all = (file?.stories || []).filter((s) => s && s.enabled !== false);
  if (!all.length || !ISO.test(String(iso || ''))) return null;
  const pinned = all.find((s) => s.showOn === iso);
  if (pinned) return pinned;
  const pool = all.filter((s) => !s.showOn);
  if (!pool.length) return null;
  const day = dayNumber(iso);
  const n = pool.length;
  const pos = ((day % n) + n) % n;
  if (file?.order === 'sequential') return pool[pos];
  return pool[permutation(n, Math.floor(day / n))[pos]];
}

/** The story for a date, or null. A day already recorded keeps what was shown (the live entry if it still exists). */
export function pickDailyStory(file, iso) {
  if (!ISO.test(String(iso || ''))) return null;
  const rec = file?.history?.[iso];
  if (rec) return (file.stories || []).find((s) => s.id === rec.id) || { ...rec, enabled: true, tags: [] };
  return pickFromRotation(file, iso);
}

/** Record today's story in history the first time the day is seen; a pin whose day has come is cleared. */
export function recordShownStory(file, iso) {
  if (!ISO.test(String(iso || ''))) return { file, changed: false };
  let changed = false;
  let stories = file.stories;
  const history = { ...(file.history || {}) };
  // A story pinned to today wins even if today was archived already (a pin made after the day began is a hand pick).
  const pinnedNow = stories.find((s) => s.enabled !== false && s.showOn === iso);
  if (pinnedNow && history[iso]?.id !== pinnedNow.id) {
    history[iso] = { ...snapshotOf(pinnedNow), manual: true }; changed = true;
  } else if (!history[iso]) {
    const s = pickFromRotation(file, iso);
    if (s) { history[iso] = snapshotOf(s); changed = true; }
  }
  if (stories.some((s) => s.showOn && s.showOn <= iso)) {
    stories = stories.map((s) => (s.showOn && s.showOn <= iso ? (({ showOn, ...rest }) => rest)(s) : s));
    changed = true;
  }
  if (!changed) return { file, changed: false };
  const keys = Object.keys(history).sort();
  keys.slice(0, Math.max(0, keys.length - HISTORY_LIMIT)).forEach((k) => delete history[k]);
  return { file: { ...file, stories, history }, changed: true };
}

export const STORY_ADAPTER = Object.freeze({
  listKey: 'stories', itemKey: 'story', normalize: normalizeStory, snapshotOf, pickFromRotation, cap: LIMITS.stories,
  needsSource: (s) => s.kind === 'story',
});

/** The Daily Letter list's adapter: every entry is forced to be a letter, and the cap is the letter cap (not the story one). */
export const LETTER_ADAPTER = Object.freeze({
  listKey: 'stories', itemKey: 'story', normalize: (raw) => normalizeStory(raw && typeof raw === 'object' ? { ...raw, kind: 'letter' } : raw),
  snapshotOf, pickFromRotation, cap: LIMITS.letters,
});

/** Change today's story (or letter, with `adapter: LETTER_ADAPTER` in opts): op = 'pick' | 'random' | 'oneoff' | 'hide' | 'automatic' (see dailyToday.js). */
export function changeTodaysStory(file, iso, op, opts = {}) {
  return changeToday(file, opts.adapter || STORY_ADAPTER, iso, op, opts);
}
/** After a story was edited: today's archive copy follows it. */
export function syncTodaysStory(file, iso) {
  return syncTodaySnapshot(file, STORY_ADAPTER, iso);
}

/** The next `days` days: [{ date, story, pinned, locked }]. */
export function upcomingStories(file, startISO, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDaysISO(startISO, i);
    const story = pickDailyStory(file, date);
    return { date, story, pinned: !!(story && story.showOn === date), locked: !!file?.history?.[date] };
  });
}

/** Archive rows, newest first: [{ date, entry, live }]. */
export function archiveRows(file) {
  return Object.keys(file?.history || {}).sort().reverse().map((date) => {
    const entry = file.history[date];
    return { date, entry, live: (file.stories || []).find((s) => s.id === entry.id) || null };
  });
}

/** Pin `id` to `iso` (any other story pinned to that day is un-pinned). */
export function pinStory(file, id, iso) {
  const stories = file.stories.map((s) => {
    if (s.id === id) return { ...s, showOn: iso, enabled: true };
    if (s.showOn === iso) { const { showOn, ...rest } = s; return rest; }
    return s;
  });
  return { ...file, stories };
}

/** Rough reading size, used by the slide to pick a layout (and by the admin to warn about very long text). */
export function storyLength(s) {
  return String(s?.text || '').length + String(s?.textHe || '').length * 0.9;
}

/** Prompt the admin copies into a chat assistant to write more. */
export const DAILY_STORY_PROMPT = `You are helping fill the "Daily Story" page of a Chabad yeshiva's digital screen, read by bochurim walking past.
Write {N} short, uplifting stories ONLY IF you are certain each one is real and you can name its exact source (book/sefer and page or chapter, or the named person who told it). Never invent or embellish a story, never attribute words to the Rebbe or any person unless a real source says so. If you are not sure, leave it out and return fewer. Retell in your own words, never copy a book.
Reply with ONLY a JSON list, no commentary. One object per entry:
{
  "kind": "story" or "thought",
  "title": "a short English title",
  "titleHe": "the title in Hebrew (optional)",
  "text": "60 to 90 words of warm, simple English; Chabad spelling (Shabbos, chossid, Yiras Shomayim)",
  "textHe": "optional Hebrew version, or leave empty",
  "source": "REQUIRED for a story: the exact, checkable source, e.g. 'Sichos Kodesh 5731 vol. 2 p. 114' or 'Told by Rabbi Y. Y. Jacobson, <where>'"
}
Do not repeat these titles already on the list: {EXISTING}.`;

/** Prompt the admin copies into a chat assistant to turn letters they paste (e.g. from the English Rebbe responsa site) into entries. */
export const DAILY_LETTER_PROMPT = `You are helping fill the "Daily Letter" page of a Chabad yeshiva's digital screen. The screen types each letter out on a sheet of letterhead.
I will paste {N} letter(s) of the Rebbe below (for example from the English responsa website). Do NOT write, invent, shorten or reword any letter: copy each one EXACTLY as I paste it, keeping every paragraph. If I paste only a link or a topic and no text, say so and stop.
Reply with ONLY a JSON list, no commentary. One object per letter:
{
  "title": "a short name for my list, e.g. 'To the 5th grade, Cheshvan 5738'",
  "letter": {
    "dateHe": "the Hebrew date if the letter has one, else empty",
    "date": "the English date and place exactly as written, e.g. 'In the Beginning of Cheshvan, 5738. Brooklyn, N.Y.'",
    "to": "who it was sent to, one line each (use \\n), or empty",
    "salutation": "the greeting, e.g. 'Greeting and Blessing:'",
    "body": "the full text; separate paragraphs with a blank line (\\n\\n)",
    "signature": "the closing, e.g. 'With esteem'",
    "source": "where it is printed, e.g. 'Igros Kodesh vol. 12, p. 34' (only if I told you), else empty"
  }
}
A letter must be under 30,000 characters. Do not repeat these titles already on my list: {EXISTING}.`;

/**
 * Seconds a passer-by needs to read it: words at ~140 wpm (Hebrew a little slower) + a few seconds to look up.
 * `speed` is the screen's existing reading speed (Look & Settings > Motion > Long text: slow | normal | fast);
 * Normal is exactly the old 140 / 110 wpm, so nothing changes until someone picks another speed.
 */
export function readingSeconds(story, speed = 'normal') {
  if (story?.kind === 'letter') return 0; // a letter asks for its own time (its typing + reading plan)
  const k = wpmFor(speed, 'en') / wpmFor('normal', 'en');
  const words = (t, wpm) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length * (60 / (wpm * k)) : 0);
  return Math.round(Math.min(90, 4 + words(story?.text, 140) + words(story?.textHe, 110) * 0.5));
}
