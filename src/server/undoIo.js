/**
 * The real data access behind src/server/undo.js: the same stores, files and broadcasts the normal
 * routes use, so an undo reaches the screen exactly like the original change did.
 */
import { readJSON, writeJSON } from './storage.js';
import { broadcast } from './sse.js';
import { withLock, loadItems, saveItems } from './announcements-store.js';
import { withScheduleLock, readScheduleDates, writeScheduleDates } from './scheduleStore.js';
import { initCountdowns } from './countdown.js';

const reinit = () => initCountdowns().catch((e) => console.error('[countdown] Re-init error:', e.message));

// routes/api.js is heavy and only needed for settings, so it is loaded the first time one is undone.
let apiMod = null;
const api = async () => (apiMod ||= await import('./routes/api.js'));

// The daily lists live in route modules (heavy imports), so they load the first time one is undone.
const dailyIo = (load, readName, saveName, lockName) => ({
  read: async () => (await load())[readName](),
  write: async (file) => (await load())[saveName](file),
  withLock: async (fn) => (await load())[lockName](fn),
});

export const undoIo = {
  daily: {
    stories: dailyIo(() => import('./routes/daily-stories.js'), 'readDailyStories', 'saveDailyStories', 'withStoriesLock'),
    words: dailyIo(() => import('./routes/daily-words.js'), 'readDailyWords', 'saveDailyWords', 'withWordsLock'),
    letters: dailyIo(() => import('./routes/daily-letters.js'), 'readDailyLetters', 'saveDailyLetters', 'withLettersLock'),
  },
  announcements: { withLock, load: loadItems, save: saveItems },
  readSlides: async () => (await readJSON('slides.json')) ?? [],
  writeSlides: async (list) => { await writeJSON('slides.json', list); broadcast('slides-update', list); reinit(); },
  readSchedule: async () => (await readJSON('schedule.json')) ?? { entries: [], categories: [] },
  writeSchedule: async (schedule) => { await writeJSON('schedule.json', schedule); broadcast('schedule-update', schedule); reinit(); },
  readDates: async () => readScheduleDates(),
  updateDates: (fn) => withScheduleLock(async () => {
    const dates = await readScheduleDates();
    const next = fn(dates);
    const saved = await writeScheduleDates(next);
    broadcast('schedule-dates-update', saved);
    reinit();
  }),
  readSettings: async () => (await readJSON('settings.json')) ?? {},
  updateSettings: async (fn) => {
    const m = await api();
    return m.withSettingsLock(async () => {
      const cur = (await readJSON('settings.json')) ?? {};
      const { settings, restartScheduler } = fn(cur);
      await m.saveSettings(m.normalizeForSave(settings), { restartScheduler });
    });
  },
  get schedulerKeys() { return ['location', 'scheduler', 'zipCode', 'chabadLocationId', 'trackA', 'trackBTime']; },
};
