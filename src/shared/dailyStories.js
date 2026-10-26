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

export const KINDS = ['story', 'thought'];
export const LIMITS = { title: 90, titleHe: 90, text: 700, textHe: 700, source: 100, tag: 24, tags: 8, stories: 500 };
export const HISTORY_LIMIT = 800;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, max);
const line = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

let counter = 0;
const newId = () => `s_${Date.now().toString(36)}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Clean one entry. Returns { story } or { error } (needs some text, English or Hebrew). */
export function normalizeStory(input) {
  if (!input || typeof input !== 'object') return { error: 'not an object' };
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

/** Clean a list; drops invalid entries and reports why. Duplicate ids are re-issued. */
export function normalizeStories(list) {
  const stories = [];
  const errors = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, LIMITS.stories).forEach((raw, i) => {
    const r = normalizeStory(raw);
    if (r.error) { errors.push({ index: i, error: r.error }); return; }
    if (seen.has(r.story.id)) r.story.id = newId();
    seen.add(r.story.id);
    stories.push(r.story);
  });
  return { stories, errors };
}

/** Parse pasted text: a JSON list, { stories: [...] }, or JSON inside a ```fence```. */
export function parseStoriesText(text) {
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
  return normalizeStories(list);
}

/** Copy kept in the archive (survives the entry being edited or deleted). */
export function snapshotOf(s) {
  return { id: s.id, kind: s.kind || 'story', title: s.title || '', titleHe: s.titleHe || '', text: s.text || '', textHe: s.textHe || '', source: s.source || '' };
}

function normalizeHistory(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  Object.keys(h).filter((k) => ISO.test(k)).sort().slice(-HISTORY_LIMIT).forEach((k) => {
    const r = normalizeStory(h[k]);
    if (!r.error) out[k] = snapshotOf(r.story);
  });
  return out;
}

/** Whole-file normaliser (server + kiosk): always a usable { order, stories, history }. */
export function normalizeDailyStoriesFile(file, seed = []) {
  const has = file && Array.isArray(file.stories);
  const { stories } = normalizeStories(has ? file.stories : seed);
  return { version: 1, order: file?.order === 'sequential' ? 'sequential' : 'shuffle', stories, history: normalizeHistory(file?.history) };
}

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
  if (!history[iso]) {
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

/**
 * Seconds a passer-by needs to read it: words at ~140 wpm (Hebrew a little slower) + a few seconds to look up.
 * `speed` is the screen's existing reading speed (Look & Settings > Motion > Long text: slow | normal | fast);
 * Normal is exactly the old 140 / 110 wpm, so nothing changes until someone picks another speed.
 */
export function readingSeconds(story, speed = 'normal') {
  const k = wpmFor(speed, 'en') / wpmFor('normal', 'en');
  const words = (t, wpm) => (String(t || '').trim() ? String(t).trim().split(/\s+/).length * (60 / (wpm * k)) : 0);
  return Math.round(Math.min(90, 4 + words(story?.text, 140) + words(story?.textHe, 110) * 0.5));
}
