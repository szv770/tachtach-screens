/**
 * Changing what Daily Word / Daily Story shows TODAY (pure; shared by the server routes, the admin and the tests).
 *
 * Why this exists: the server archives each day's pick into `history` the first time the day is seen, and a day that
 * is in `history` is frozen (so reordering never rewrites what was on screen). That froze TODAY from the first
 * minute of the day, so a pin for today, a hide, or a different pick changed nothing until tomorrow. These
 * operations edit today's history entry on purpose, so the archive records what actually showed.
 *
 * The same rules serve both lists through a small adapter:
 *   { listKey: 'words' | 'stories', itemKey: 'word' | 'story', normalize(input) -> { [itemKey] } | { error },
 *     snapshotOf(item), pickFromRotation(file, iso), cap, tag? }
 *
 * Ops (all return { file, pickedId?, error? }; a refusal returns the file untouched with a plain sentence):
 *   pick(id)       show this entry today (must be switched on)
 *   random         a different entry (RANDOM_FROM: 'unshown' = not yet in the archive, falling back to any)
 *   oneoff(entry)  write a new entry just for today; it is added to the list switched OFF, so it never joins the rotation
 *   hide           switch today's entry off and let the rotation choose again
 *   automatic      forget the hand pick: the rotation decides again (also clears a pin for today)
 */

export const RANDOM_FROM = Object.freeze(['unshown', 'all']);
export const DEFAULT_RANDOM_FROM = 'unshown';
export const RANDOM_FROM_LABEL = Object.freeze({ unshown: 'Not shown yet (then any)', all: 'Any entry' });

/** settings.dailyPick.randomFrom; a missing or unknown value is the default, so a bad file never breaks the button. */
export function randomFrom(settings) {
  const v = settings?.dailyPick?.randomFrom;
  return RANDOM_FROM.includes(v) ? v : DEFAULT_RANDOM_FROM;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const unpin = (item) => { const { showOn, ...rest } = item; return rest; };

function withHistory(file, adapter, iso, snap) {
  const history = { ...(file.history || {}) };
  if (snap) history[iso] = snap; else delete history[iso];
  return { ...file, history };
}

/** The entry on screen today: the archived pick (live copy when it still exists), else what the rotation gives. */
export function todaysEntry(file, adapter, iso) {
  const list = file?.[adapter.listKey] || [];
  const rec = file?.history?.[iso];
  if (rec) return list.find((x) => x.id === rec.id) || null;
  return adapter.pickFromRotation(file, iso);
}

/** True when today's pick was made by hand (kept in the archive as `manual`). */
export function isManualToday(file, iso) {
  return !!file?.history?.[iso]?.manual;
}

/** Keep today's archive copy equal to the live entry after it was edited (the archive records what showed). */
export function syncTodaySnapshot(file, adapter, iso) {
  const rec = file?.history?.[iso];
  if (!rec) return file;
  const live = (file[adapter.listKey] || []).find((x) => x.id === rec.id);
  if (!live) return file;
  return withHistory(file, adapter, iso, { ...adapter.snapshotOf(live), ...(rec.manual ? { manual: true } : {}) });
}

export function changeToday(file, adapter, iso, op, opts = {}) {
  if (!ISO.test(String(iso || ''))) return { file, error: 'No date.' };
  const key = adapter.listKey;
  const list = file[key] || [];
  const on = list.filter((x) => x.enabled !== false);
  const curId = file.history?.[iso]?.id || adapter.pickFromRotation(file, iso)?.id || null;
  const clearPin = (arr) => arr.map((x) => (x.showOn === iso ? unpin(x) : x));
  const choose = (arr, item) => ({
    file: withHistory({ ...file, [key]: clearPin(arr) }, adapter, iso, { ...adapter.snapshotOf(item), manual: true }),
    pickedId: item.id,
  });

  if (op === 'pick') {
    const item = list.find((x) => x.id === opts.id);
    if (!item) return { file, error: 'That one is not on the list any more.' };
    if (item.enabled === false) return { file, error: 'That one is switched off. Switch it on in the list first.' };
    return choose(list, item);
  }

  if (op === 'random') {
    const others = on.filter((x) => x.id !== curId);
    if (!others.length) return { file, error: 'There is no other one to show. Add more to the list first.' };
    const seen = new Set(Object.values(file.history || {}).map((h) => h.id));
    const fresh = others.filter((x) => !seen.has(x.id));
    const from = (opts.randomFrom || DEFAULT_RANDOM_FROM) === 'all' || !fresh.length ? others : fresh;
    const rnd = typeof opts.rng === 'function' ? opts.rng : Math.random;
    return choose(list, from[Math.min(from.length - 1, Math.floor(rnd() * from.length))]);
  }

  if (op === 'oneoff') {
    if (list.length >= adapter.cap) return { file, error: 'The list is full. Delete one first.' };
    const r = adapter.normalize({ ...opts.entry, id: undefined, enabled: true, showOn: undefined });
    if (r.error) return { file, error: r.error };
    const item = r[adapter.itemKey];
    if (adapter.needsSource?.(item) && !item.source) return { file, error: 'A story needs a real source before it can go on the screen.' };
    // Off the rotation: it shows today (the archive finds it by id) and never comes round by itself.
    const stored = { ...item, enabled: false, tags: [...new Set([...(item.tags || []), 'just for today'])].slice(0, 8) };
    return choose([...list, stored], stored);
  }

  if (op === 'hide') {
    if (!curId) return { file, error: 'Nothing is showing today.' };
    const arr = clearPin(list.map((x) => (x.id === curId ? { ...x, enabled: false } : x)));
    const next = { ...file, [key]: arr };
    const again = adapter.pickFromRotation(withHistory(next, adapter, iso, null), iso);
    return { file: withHistory(next, adapter, iso, again ? adapter.snapshotOf(again) : null), pickedId: again?.id || null };
  }

  if (op === 'automatic') {
    const next = { ...file, [key]: clearPin(list) };
    const again = adapter.pickFromRotation(withHistory(next, adapter, iso, null), iso);
    return { file: withHistory(next, adapter, iso, again ? adapter.snapshotOf(again) : null), pickedId: again?.id || null };
  }

  return { file, error: 'Unknown action.' };
}
