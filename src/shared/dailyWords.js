/**
 * Daily Word — pure rules shared by the kiosk, admin and server.
 *
 * Data (data/daily-words.json, falls back to the seed list until first save):
 *   { version: 1, order: 'sequential' | 'shuffle', words: [Word] }
 *   Word = {
 *     id, enabled, language ('Yiddish'), word (Hebrew letters), transliteration,
 *     pronunciation (respelling, stressed syllable in CAPS), partOfSpeech,
 *     meaning, context (origin / flavour, optional),
 *     convo: [{ text }, { text }]   // use in conversation; *asterisks* mark the word
 *     tags: [string], showOn?: 'YYYY-MM-DD'  // pin to a date
 *   }
 *
 * The word of the day is a pure function of the date, so every screen and a
 * restart show the same word, with no state to keep.
 */

export const DEFAULT_LANGUAGE = 'Yiddish';
export const LIMITS = { word: 60, transliteration: 60, pronunciation: 60, partOfSpeech: 30, meaning: 220, context: 320, convoLine: 200, tag: 24, tags: 8, words: 1000 };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// The rafe (U+05BF, the little bar above a pe/bet/kaf) is YIVO-only; Chabad print
// leaves it out and it reads as a stray mark on top of the letter, so it is dropped.
/** English spelling is Chabad-style: ch, not kh (Chaver, Nachas). Case-preserving. */
const chStyle = (v) => String(v ?? '').replace(/KH/g, 'CH').replace(/Kh/g, 'Ch').replace(/kh/g, 'ch');
const noRafe = (v) => String(v ?? '').replace(/\u05BF/g, '');

let counter = 0;
const newId = () => `w_${Date.now().toString(36)}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** Clean one word. Returns { word } or { error } (needs the word itself, a transliteration or meaning). */
export function normalizeWord(input) {
  if (!input || typeof input !== 'object') return { error: 'not an object' };
  const word = str(noRafe(input.word ?? input.yiddish ?? input.hebrew), LIMITS.word);
  const transliteration = str(chStyle(input.transliteration ?? input.translit ?? input.romanization), LIMITS.transliteration);
  const meaning = str(chStyle(input.meaning ?? input.english ?? input.translation), LIMITS.meaning);
  if (!word && !transliteration) return { error: 'needs a word or a transliteration' };
  if (!meaning) return { error: `"${word || transliteration}" needs a meaning` };
  let convoIn = input.convo ?? input.conversation ?? input.example ?? [];
  if (typeof convoIn === 'string') convoIn = convoIn.split(/\n+/);
  const convo = (Array.isArray(convoIn) ? convoIn : [])
    .map((l) => str(chStyle(typeof l === 'string' ? l : l?.text), LIMITS.convoLine))
    .filter(Boolean)
    .slice(0, 4)
    .map((text) => ({ text }));
  const tagsIn = Array.isArray(input.tags) ? input.tags : typeof input.tags === 'string' ? input.tags.split(',') : [];
  const showOn = ISO.test(String(input.showOn || '')) ? String(input.showOn) : undefined;
  const out = {
    id: str(input.id, 60) || newId(),
    enabled: input.enabled !== false,
    language: str(input.language, 30) || DEFAULT_LANGUAGE,
    word,
    transliteration,
    pronunciation: str(chStyle(input.pronunciation ?? input.pronounce), LIMITS.pronunciation),
    partOfSpeech: str(input.partOfSpeech ?? input.pos, LIMITS.partOfSpeech),
    meaning,
    context: str(chStyle(input.context ?? input.note ?? input.origin), LIMITS.context),
    convo,
    tags: tagsIn.map((t) => str(t, LIMITS.tag)).filter(Boolean).slice(0, LIMITS.tags),
  };
  if (showOn) out.showOn = showOn;
  return { word: out };
}

/** Clean a list; drops invalid entries and reports why. Duplicate ids are re-issued. */
export function normalizeWords(list) {
  const words = [];
  const errors = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).slice(0, LIMITS.words).forEach((raw, i) => {
    const r = normalizeWord(raw);
    if (r.error) { errors.push({ index: i, error: r.error }); return; }
    if (seen.has(r.word.id)) r.word.id = newId();
    seen.add(r.word.id);
    words.push(r.word);
  });
  return { words, errors };
}

/**
 * Parse pasted text: a JSON array, { words: [...] }, or JSON in a ```fence```
 * (what a chat assistant tends to return). Returns { words, errors }.
 */
export function parseWordsText(text) {
  let raw = String(text ?? '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  if (!raw) return { words: [], errors: [{ index: -1, error: 'nothing to import' }] };
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    const a = raw.indexOf('['); const b = raw.lastIndexOf(']');
    if (a >= 0 && b > a) { try { data = JSON.parse(raw.slice(a, b + 1)); } catch { /* fall through */ } }
    if (data === undefined) return { words: [], errors: [{ index: -1, error: 'could not read it as JSON: ' + e.message }] };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : null;
  if (!list) return { words: [], errors: [{ index: -1, error: 'expected a JSON list of words' }] };
  return normalizeWords(list);
}

/** Whole-file normaliser (server + kiosk): always returns a usable { order, words }. */
export function normalizeDailyWordsFile(file, seed = []) {
  const hasWords = file && Array.isArray(file.words);
  const { words } = normalizeWords(hasWords ? file.words : seed);
  return { version: 1, order: file?.order === 'shuffle' ? 'shuffle' : 'sequential', words };
}

// ── Picking today's word ────────────────────────────────────────────────────

/** Whole days since 1970-01-01 for a YYYY-MM-DD string (timezone-free). */
export function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
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

/** Deterministic permutation of 0..n-1 for a given cycle. */
function permutation(n, cycle) {
  const idx = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(0x9e3779b1 ^ (cycle * 2654435761));
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/**
 * The word for a date (YYYY-MM-DD in the kiosk's timezone), or null if the
 * list is empty. A word with showOn === date always wins; pinned words for
 * other dates are kept out of the rotation so they stay a surprise.
 * sequential: list order, wrapping. shuffle: a fresh fixed shuffle each cycle
 * (no repeats until every word has been shown).
 */
export function pickDailyWord(file, iso) {
  const words = (file?.words || []).filter((w) => w && w.enabled !== false);
  if (!words.length || !ISO.test(String(iso || ''))) return null;
  const pinned = words.find((w) => w.showOn === iso);
  if (pinned) return pinned;
  const pool = words.filter((w) => !w.showOn);
  if (!pool.length) return null;
  const day = dayNumber(iso);
  const n = pool.length;
  if (file?.order === 'shuffle') {
    const cycle = Math.floor(day / n);
    return pool[permutation(n, cycle)[((day % n) + n) % n]];
  }
  return pool[((day % n) + n) % n];
}

/** Split text on *asterisks* into [{ text, em }] for highlighting the word as used. */
export function splitEmphasis(text) {
  const out = [];
  String(text ?? '').split(/(\*[^*]+\*)/g).forEach((part) => {
    if (!part) return;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) out.push({ text: part.slice(1, -1), em: true });
    else out.push({ text: part, em: false });
  });
  return out;
}

/** Prompt the admin copies into a chat assistant to make more words. */
export const DAILY_WORD_PROMPT = `You are helping fill the "Daily Word" page of a Jewish school's digital screen.
Write {N} more {LANGUAGE} words that students would enjoy and actually use. Mix everyday words with Chabad/yeshiva ones.
Reply with ONLY a JSON list, no commentary. One object per word:
{
  "word": "the word in Hebrew letters, Chabad-style Yiddish spelling: use pasekh alef (אַ) and komets alef (אָ) where needed, but NO rafe (the bar above פ)",
  "transliteration": "English letters with ch (never kh), e.g. nachas, chaver",
  "pronunciation": "easy respelling, stressed syllable in CAPS, ch as in Bach, e.g. NAH-ches",
  "partOfSpeech": "noun | verb | adjective | adverb | interjection | phrase",
  "meaning": "one clear sentence",
  "context": "one or two short sentences: where it comes from or how it feels",
  "convo": ["line one of a short real-life exchange", "line two, with the word in *asterisks*"],
  "tags": ["family", "food", "chabad"]
}
Rules: keep the meaning under 25 words, each convo line under 15 words, and do not repeat these words that are already on the list: {EXISTING}.
Only include words you are sure are correct.`;
