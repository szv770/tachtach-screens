import { clientError, isClientError, networkReason } from '../safeError.js';
import express, { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, readdir } from 'fs/promises';
import multer from 'multer';
import { readJSON, writeJSON, updateJSON, SKIP } from '../storage.js';
import { normalizeWebUrl } from '../../shared/embedCheck.js';
import { readDailyWords } from './daily-words.js';
import { readDailyStories } from './daily-stories.js';
import { readRoster } from './roster.js';
import { normalizeTefilaTag } from '../../shared/chazan.js';
import { readForKiosk as readChazanForKiosk } from '../chazanStore.js';
import { forKiosk as rosterForKiosk } from '../../shared/roster.js';
import { broadcast, broadcastToAll } from '../sse.js';
import { SCREEN_COMMANDS } from '../../shared/screenCommands.js';
import { getScreenState, setScreenState, getScreenDisplay } from '../screenState.js';
import { setupTrackA, setupTrackB, manualRefresh, applySettingsChange } from '../scheduler.js';
import { upload, processImage, processGif, processVideo, getMediaType, deleteMedia, listMedia, UPLOAD_DIR } from '../upload.js';
import { processPdf, PdfError } from '../pdf.js';
import { PDF_MAX_PAGES, clampPageSeconds } from '../../shared/pdfPages.js';
import { uploadBox } from '../../shared/screenSize.js';
import { syncAlbum, deleteAlbumCache, getAlbumStatus, getAlbumPhotos, startSyncTimer, stopSyncTimer } from '../google-photos.js';
import { extractAlbumId } from '../../fetchers/google-photos.js';
import { initCountdowns } from '../countdown.js';
import { runCleanup } from '../cleanup.js';
import { fetchRSSFeed, RSS_FIELDS } from '../../fetchers/rss.js';
import { parseFeedUrl, isGoogleAlbumUrl } from '../urlRules.js';
import { sniffLogoType, LOGO_EXTS } from '../logoType.js';
import { refreshRSSFeed, refreshAllRSSFeeds, startRSSScheduler, stopRSSTimer } from '../rss-scheduler.js';
import users from '../users.js';
import { normalizeSettings } from '../settings-migrate.js';
import { deepMerge, validateSettingsPatch } from '../../shared/settingsMerge.js';
import { getEffectiveSchedule } from '../../shared/scheduleResolution.js';
import { sanitizeStages, isKind } from '../../shared/scheduleStages.js';
import { sanitizeGroupFields } from '../../shared/scheduleGroups.js';
import { scheduleGroupIds } from '../schedule-groups.js';
import { getStateExtras } from '../announcements-store.js';
import { fetchWeather } from '../../fetchers/weather.js';
import { describeWeather } from '../../shared/weatherCodes.js';

const __apiFilename = fileURLToPath(import.meta.url);
const __apiDirname = path.dirname(__apiFilename);
const FONTS_DIR = path.resolve(__apiDirname, '../../../data/fonts');
await mkdir(FONTS_DIR, { recursive: true });

// Font upload multer instance
const FONT_TYPES = [
  'font/ttf', 'font/woff', 'font/woff2', 'font/otf',
  'application/x-font-ttf', 'application/font-woff', 'application/font-woff2',
  'application/x-font-opentype', 'font/opentype',
  'application/octet-stream',  // browsers often send this for font files
];
const FONT_EXTS = ['.ttf', '.woff', '.woff2', '.otf'];

const fontStorage = multer.memoryStorage();
const fontUpload = multer({
  storage: fontStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (FONT_EXTS.includes(ext)) cb(null, true);
    else cb(clientError('Only .ttf, .otf, .woff, and .woff2 font files are allowed.'));
  },
});

const router = Router();

// ── Input validation helpers ──────────────────────────────────────────────
function pick(obj, allowedFields) {
  const result = {};
  for (const key of allowedFields) {
    if (obj != null && key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

// videoUrl / blurUrl / edgeTreatment / isGif are what the admin's Media upload
// sends and what VideoSlide/ImageSlide read. They were missing here, so every
// new video slide was saved without its URL (blank on screen) and image edge
// treatment / blurred backdrop were silently dropped.
const SLIDE_FIELDS = ['type', 'template', 'titleHe', 'titleEn', 'bodyHe', 'bodyEn', 'attribution', 'label', 'fullscreen', 'imageUrl', 'videoUrl', 'blurUrl', 'edgeTreatment', 'isGif', 'mediaId', 'filename', 'blurFilename', 'mediaType', 'duration', 'textHe', 'textEn', 'enabled', 'order', 'width', 'height', 'dominantColor', 'googleAlbumId', 'displayMode', 'photoInterval', 'photoOrder', 'kenBurns', 'imageDisplayMode', 'subtitle', 'style', 'rssFeedId', 'rssDisplayMode', 'embedUrl', 'webRefreshSec', 'webZoom', 'webCacheBust', 'qrOn', 'qrUrl', 'qrCorner', 'qrSize', 'qrCaption', 'announcementId', 'pdfPages', 'pageSeconds', 'hideOnShabbos'];
// PDF slide pages: only our own page pictures, at most PDF_MAX_PAGES (fail closed: anything else is dropped).
const PDF_PAGE_URL = /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-p\d{2,3})?\.jpg$/i;
// Web page / QR addresses: http(s) only (defence in depth behind the kiosk CSP, audit L3); anything else is dropped.
export function cleanUrlFields(slide) {
  for (const k of ['embedUrl', 'qrUrl']) {
    if (!(k in slide) || slide[k] === '' || slide[k] === null || slide[k] === undefined) continue;
    const ok = typeof slide[k] === 'string' && slide[k].length <= 2000 ? normalizeWebUrl(slide[k]) : null;
    if (ok) slide[k] = ok; else delete slide[k];
  }
  return slide;
}
function cleanPdfFields(slide) {
  cleanUrlFields(slide);
  if ('pdfPages' in slide) {
    const ok = Array.isArray(slide.pdfPages) ? slide.pdfPages.filter((u) => typeof u === 'string' && PDF_PAGE_URL.test(u)).slice(0, PDF_MAX_PAGES) : [];
    if (ok.length) slide.pdfPages = ok; else delete slide.pdfPages;
  }
  if ('pageSeconds' in slide) slide.pageSeconds = clampPageSeconds(slide.pageSeconds);
  return slide;
}
/** Letters, digits, space and dash only (any script), at most 60 characters. */
export function cleanFontName(raw) {
  return String(raw ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
/** TrueType / OpenType / WOFF / WOFF2 / collection signatures (the file is served as-is, so check what it claims to be). */
export function looksLikeFont(buf) {
  if (!buf || buf.length < 12) return false;
  const sig = buf.subarray(0, 4);
  return sig.equals(Buffer.from([0, 1, 0, 0])) || ['OTTO', 'wOFF', 'wOF2', 'true', 'ttcf'].includes(sig.toString('latin1'));
}
const RSS_FEED_FIELDS = ['url', 'name', 'mapping', 'refreshInterval'];
const CUSTOM_DAY_FIELDS = ['title', 'titleHe', 'subtitle', 'date', 'recurring', 'type', 'enabled', 'noChazan', 'hebrewMonth', 'hebrewDay', 'gregorianMonth', 'gregorianDay'];
const SCHEDULE_ENTRY_FIELDS = ['name', 'nameHe', 'time', 'endTime', 'category', 'days', 'enabled', 'alertBefore', 'order', 'countdownDisplay', 'icon', 'stages', 'groupTimes', 'groups', 'tefila'];
// `alertDisplay` is accepted only as a legacy alias (older admin builds and
// the built-in "Standard Yeshiva Day" template sent it); pickScheduleEntry()
// folds it into `countdownDisplay`, which is the only key that gets stored.
const SCHEDULE_ENTRY_INPUT_FIELDS = [...SCHEDULE_ENTRY_FIELDS, 'alertDisplay'];
function pickScheduleEntry(e, groupIds = null) {
  const picked = pick(e, SCHEDULE_ENTRY_INPUT_FIELDS);
  if ('groupTimes' in picked || 'groups' in picked) {
    // Groups (src/shared/scheduleGroups.js): unknown ids and bad slots are dropped here; the single-entry
    // routes refuse bad times outright (groupErrors) before saving.
    const g = sanitizeGroupFields(picked, groupIds);
    delete picked.groupTimes; delete picked.groups;
    if (g.groupTimes) picked.groupTimes = g.groupTimes;
    if (g.groups) picked.groups = g.groups;
  }
  if ('alertDisplay' in picked) {
    if (!picked.countdownDisplay) picked.countdownDisplay = picked.alertDisplay;
    delete picked.alertDisplay;
  }
  if ('countdownDisplay' in picked) {
    picked.countdownDisplay = picked.countdownDisplay === 'takeover' ? 'takeover' : 'slide';
  }
  if ('tefila' in picked) {
    // Which davening this row is ('Shacharis' | 'Mincha' | 'Maariv' | 'other'): the chazan's name shows on it. Anything else is dropped.
    const tf = normalizeTefilaTag(picked.tefila);
    if (tf) picked.tefila = tf; else delete picked.tefila;
  }
  if ('stages' in picked) {
    // Attention stages (src/shared/scheduleStages.js): { justStarted, inSession }; invalid/empty is dropped.
    const st = sanitizeStages(picked.stages);
    if (st) picked.stages = st; else delete picked.stages;
  }
  return picked;
}
const SCHEDULE_CATEGORY_FIELDS = ['id', 'name', 'color', 'icon', 'defaultAlert', 'stages', 'kind'];
// defaultAlert = minutes of countdown reminder given to pasted entries of this
// category that have no explicit "alert N" (0/absent = none).
function pickCategory(c) {
  const out = pick(c, SCHEDULE_CATEGORY_FIELDS);
  if ('defaultAlert' in out) {
    const n = Math.round(Number(out.defaultAlert));
    if (Number.isFinite(n) && n > 0) out.defaultAlert = Math.min(120, n);
    else delete out.defaultAlert;
  }
  if ('stages' in out) {
    const st = sanitizeStages(out.stages);
    if (st) out.stages = st; else delete out.stages;
  }
  if ('kind' in out && !isKind(out.kind)) delete out.kind; // seder | davening | break | meal | other
  return out;
}
const SCHEDULE_TEMPLATE_FIELDS = ['name', 'entries', 'categories'];

// GET /api/state lives in src/server/app.js (route 6c, localhostOrAuth +
// csrfProtection), registered before this router. A second copy used to live
// here but was unreachable (shadowed), so it was removed — add new state keys
// to app.js.

// ── Settings ───────────────────────────────────────────────────────────────

router.get('/settings', async (_req, res) => {
  try {
    const settings = await readJSON('settings.json');
    res.json(settings ?? {});
  } catch (err) {
    console.error('[api] GET /settings error:', err.message);
    res.status(500).json({ error: 'Failed to read settings.' });
  }
});

// One settings read-modify-write at a time (PATCH and PUT), so two saves
// landing together can't both read the old file and drop each other's change.
let settingsQueue = Promise.resolve();
function withSettingsLock(fn) {
  const run = settingsQueue.then(fn, fn);
  settingsQueue = run.catch(() => {});
  return run;
}

/** Write settings, broadcast, and restart scheduler tracks when asked. */
async function saveSettings(settings, { restartScheduler = true } = {}) {
  const prev = await readJSON('settings.json').catch(() => null);
  await writeJSON('settings.json', settings);
  broadcast('settings-update', settings);
  // Re-arm Track C and refresh weather/zmanim now if the location or weather
  // options changed (a zip change used to have no visible effect).
  applySettingsChange(prev, settings);
  if (!restartScheduler) return;
  try {
    const config = settings.location || { zip: '33139', locationId: '33139' };
    if (settings.scheduler?.trackA !== false) {
      await setupTrackA(config);
    }
    if (settings.scheduler?.trackBTime) {
      setupTrackB(config, settings.scheduler.trackBTime);
    }
  } catch (schedErr) {
    console.error('[api] Scheduler restart error:', schedErr.message);
    // Don't fail the whole save — settings were written successfully
  }
}

// Legacy whole-object replace, kept for admin tabs still running an older
// build. The current admin uses PATCH (below), so one panel's stale copy
// can't revert keys another panel saved (audit bug 14).
router.put('/settings', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid settings data.' });
    }
    // An admin tab still running an older build may send the stray top-level
    // zipCode/trackA/... keys; fold them into location/scheduler (audit bug 6).
    const { settings } = normalizeSettings(req.body);
    await withSettingsLock(() => saveSettings(settings));
    res.json(settings);
  } catch (err) {
    console.error('[api] PUT /settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings. Check server disk space and permissions.' });
  }
});

// Partial update: deep-merges only the keys sent into settings.json and
// returns the full result. Top-level keys must be listed in SETTINGS_KEYS
// (src/shared/settingsMerge.js) — unknown keys are a 400 naming them.
const SCHEDULER_KEYS = ['location', 'scheduler', 'zipCode', 'chabadLocationId', 'trackA', 'trackBTime'];
router.patch('/settings', async (req, res) => {
  const check = validateSettingsPatch(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });
  try {
    const merged = await withSettingsLock(async () => {
      const current = (await readJSON('settings.json')) ?? {};
      const { settings } = normalizeSettings(deepMerge(current, req.body));
      await saveSettings(settings, { restartScheduler: SCHEDULER_KEYS.some((k) => k in req.body) });
      return settings;
    });
    res.json(merged);
  } catch (err) {
    console.error('[api] PATCH /settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings. Check server disk space and permissions.' });
  }
});

// ── Slides ─────────────────────────────────────────────────────────────────

router.use('/slides', express.json({ limit: '256kb' })); // whole-rotation saves outgrow the 16 kB default (audit M3)
router.get('/slides', async (_req, res) => {
  try {
    const slides = await readJSON('slides.json');
    res.json(slides ?? []);
  } catch (err) {
    console.error('[api] GET /slides error:', err.message);
    res.status(500).json({ error: 'Failed to read slides.' });
  }
});

// The Schedule slide being switched on/off decides whether schedule alerts run
// at all (isScheduleSlideOn), so any slides change re-evaluates the timers.
function reinitCountdownsForSlides() {
  initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
}

router.put('/slides', async (req, res) => {
  try {
    const slides = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ error: 'Invalid slides data — expected an array.' });
    }
    // Sanitize each slide to only allowed fields (preserve id)
    const sanitized = slides.map((s) => cleanPdfFields({ id: s?.id, ...pick(s, SLIDE_FIELDS) }));
    await updateJSON('slides.json', () => sanitized); // under the file lock, so it cannot interleave with a post being published
    broadcast('slides-update', sanitized);
    reinitCountdownsForSlides();
    res.json(sanitized);
  } catch (err) {
    console.error('[api] PUT /slides error:', err.message);
    res.status(500).json({ error: 'Failed to save slides.' });
  }
});

router.post('/slides', async (req, res) => {
  try {
    const picked = cleanPdfFields(pick(req.body, SLIDE_FIELDS));
    // Default enabled to true so new slides are visible immediately
    if (picked.enabled === undefined) picked.enabled = true;
    const newSlide = { id: uuidv4(), ...picked };
    const slides = await updateJSON('slides.json', (list) => { list.push(newSlide); return list; }, () => []);
    broadcast('slides-update', slides);
    reinitCountdownsForSlides();
    res.status(201).json(newSlide);
  } catch (err) {
    console.error('[api] POST /slides error:', err.message);
    res.status(500).json({ error: 'Failed to create slide.' });
  }
});

router.delete('/slides/:id', async (req, res) => {
  try {
    // Find the slide being deleted so we can clean up its uploaded file
    let deleted;
    const slides = await updateJSON('slides.json', (list) => {
      deleted = list.find((s) => s.id === req.params.id);
      return list.filter((s) => s.id !== req.params.id);
    }, () => []);
    broadcast('slides-update', slides);
    reinitCountdownsForSlides();

    // Clean up uploaded media file if this was a media slide - unless another slide
    // (Media > Add to screen can add the same upload twice) still shows it.
    const stillUsed = (id) => slides.some((s) => s.mediaId === id || (s.imageUrl || '').includes(`/uploads/${id}.`) || (s.videoUrl || '').includes(`/uploads/${id}.`));
    if (deleted?.mediaId && stillUsed(deleted.mediaId)) {
      // keep the file
    } else if (deleted?.mediaId) {
      deleteMedia(deleted.mediaId).catch((e) => {
        console.error(`[api] Media cleanup failed for ${deleted.mediaId}:`, e.message);
      });
    } else if (deleted?.imageUrl) {
      // Legacy IMAGE_SLIDE — extract id from /uploads/UUID.ext
      const match = deleted.imageUrl.match(/\/uploads\/([a-f0-9-]+)\./);
      if (match && !stillUsed(match[1])) deleteMedia(match[1]).catch((e) => {
        console.error(`[api] Legacy media cleanup failed for ${match[1]}:`, e.message);
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /slides error:', err.message);
    res.status(500).json({ error: 'Failed to delete slide.' });
  }
});

// ── Messages / Pinned ────────────────────────────────────────────────────
// Moved to routes/announcements.js (unified announcements). The legacy
// /api/messages and /api/pinned endpoints are answered there by translating
// to/from data/announcements.json for one release.

// ── Custom Days ────────────────────────────────────────────────────────────

router.get('/custom-days', async (_req, res) => {
  try {
    const customDays = await readJSON('custom-days.json');
    res.json(customDays ?? []);
  } catch (err) {
    console.error('[api] GET /custom-days error:', err.message);
    res.status(500).json({ error: 'Failed to read custom days.' });
  }
});

router.post('/custom-days', async (req, res) => {
  try {
    if (!req.body?.title) {
      return res.status(400).json({ error: 'Custom day title is required.' });
    }
    const newDay = { id: uuidv4(), ...pick(req.body, CUSTOM_DAY_FIELDS) };
    const customDays = await updateJSON('custom-days.json', (list) => { list.push(newDay); return list; }, () => []);
    broadcast('custom-days-update', customDays);
    res.status(201).json(newDay);
  } catch (err) {
    console.error('[api] POST /custom-days error:', err.message);
    res.status(500).json({ error: 'Failed to add custom day.' });
  }
});

// Edit in place (same id). Switching between a Hebrew and a Gregorian date
// clears the other kind's fields so the badge can't match on both.
router.put('/custom-days/:id', async (req, res) => {
  try {
    const updates = pick(req.body, CUSTOM_DAY_FIELDS);
    if ('title' in updates && !String(updates.title || '').trim()) {
      return res.status(400).json({ error: 'Custom day title is required.' });
    }
    let next = null;
    const customDays = await updateJSON('custom-days.json', (list) => {
      const idx = list.findIndex((d) => d.id === req.params.id);
      if (idx === -1) return SKIP;
      next = { ...list[idx], ...updates, id: req.params.id };
      if (updates.hebrewMonth) { delete next.gregorianMonth; delete next.gregorianDay; }
      if (updates.gregorianMonth) { delete next.hebrewMonth; delete next.hebrewDay; }
      for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null) delete next[k];
      list[idx] = next;
      return list;
    }, () => []);
    if (customDays === SKIP) return res.status(404).json({ error: 'Custom day not found.' });
    broadcast('custom-days-update', customDays);
    res.json(next);
  } catch (err) {
    console.error('[api] PUT /custom-days error:', err.message);
    res.status(500).json({ error: 'Failed to update custom day.' });
  }
});

router.delete('/custom-days/:id', async (req, res) => {
  try {
    const customDays = await updateJSON('custom-days.json', (list) => list.filter((d) => d.id !== req.params.id), () => []);
    broadcast('custom-days-update', customDays);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /custom-days error:', err.message);
    res.status(500).json({ error: 'Failed to delete custom day.' });
  }
});

// ── Schedule ──────────────────────────────────────────────────────────────

router.get('/schedule', async (_req, res) => {
  try {
    const schedule = await readJSON('schedule.json');
    res.json(schedule ?? { entries: [], categories: [] });
  } catch (err) {
    console.error('[api] GET /schedule error:', err.message);
    res.status(500).json({ error: 'Failed to read schedule.' });
  }
});

// Whole-schedule bodies (90+ blocks) exceed the global 16 kB cap, which app.js skips for these paths.
router.use(['/schedule/entries', '/schedule/categories', '/schedule/template', '/schedule/templates'], express.json({ limit: '256kb' }));

router.put('/schedule/entries', async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Invalid entries data — expected an array.' });
    }
    const gids = await scheduleGroupIds();
    const schedule = await updateJSON('schedule.json', (sch) => {
      sch.entries = entries.map((e) => ({ id: e?.id, ...pickScheduleEntry(e, gids) }));
      return sch;
    }, () => ({ entries: [], categories: [] }));
    broadcast('schedule-update', schedule);
    // Re-initialize countdown timers with new schedule
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json(schedule.entries);
  } catch (err) {
    console.error('[api] PUT /schedule/entries error:', err.message);
    res.status(500).json({ error: 'Failed to save schedule entries.' });
  }
});

router.post('/schedule/entries', async (req, res) => {
  try {
    if (!req.body?.name && !req.body?.nameHe) {
      return res.status(400).json({ error: 'Entry name (English or Hebrew) is required.' });
    }
    if (!req.body?.time) {
      return res.status(400).json({ error: 'Entry time is required.' });
    }
    const gids = await scheduleGroupIds();
    const gErr = sanitizeGroupFields(req.body, gids).errors;
    if (gErr.length) return res.status(400).json({ error: gErr.join(' ') });
    const picked = pickScheduleEntry(req.body, gids);
    if (picked.enabled === undefined) picked.enabled = true;
    const newEntry = { id: uuidv4(), ...picked };
    const schedule = await updateJSON('schedule.json', (sch) => { sch.entries.push(newEntry); return sch; }, () => ({ entries: [], categories: [] }));
    broadcast('schedule-update', schedule);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.status(201).json(newEntry);
  } catch (err) {
    console.error('[api] POST /schedule/entries error:', err.message);
    res.status(500).json({ error: 'Failed to add schedule entry.' });
  }
});

router.put('/schedule/entries/:id', async (req, res) => {
  try {
    const gids = await scheduleGroupIds();
    const gErr = sanitizeGroupFields(req.body, gids).errors;
    if (gErr.length) return res.status(400).json({ error: gErr.join(' ') });
    let updated = null;
    const schedule = await updateJSON('schedule.json', (sch) => {
      const idx = sch.entries.findIndex((e) => e.id === req.params.id);
      if (idx === -1) return SKIP;
      sch.entries[idx] = { ...sch.entries[idx], ...pickScheduleEntry(req.body, gids), id: req.params.id };
      // Sending an empty groupTimes / groups clears them (same idea as stages below).
      const cleanG = sanitizeGroupFields(req.body || {}, gids);
      if (req.body && 'groupTimes' in req.body && !cleanG.groupTimes) delete sch.entries[idx].groupTimes;
      if (req.body && 'groups' in req.body && !cleanG.groups) delete sch.entries[idx].groups;
      if (req.body && 'tefila' in req.body && !normalizeTefilaTag(req.body.tefila)) delete sch.entries[idx].tefila; // '' = back to automatic
      // Sending an empty/invalid `stages` clears the stored override (pickScheduleEntry drops it, so the merge would keep the old one).
      if (req.body && 'stages' in req.body && !sanitizeStages(req.body.stages)) delete sch.entries[idx].stages;
      updated = sch.entries[idx];
      return sch;
    }, () => ({ entries: [], categories: [] }));
    if (schedule === SKIP) return res.status(404).json({ error: 'Schedule entry not found.' });
    broadcast('schedule-update', schedule);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json(updated);
  } catch (err) {
    console.error('[api] PUT /schedule/entries/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update schedule entry.' });
  }
});

router.delete('/schedule/entries/:id', async (req, res) => {
  try {
    const schedule = await updateJSON('schedule.json', (sch) => { sch.entries = sch.entries.filter((e) => e.id !== req.params.id); return sch; }, () => ({ entries: [], categories: [] }));
    broadcast('schedule-update', schedule);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /schedule/entries/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete schedule entry.' });
  }
});

router.put('/schedule/categories', async (req, res) => {
  try {
    const categories = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'Invalid categories data — expected an array.' });
    }
    const schedule = await updateJSON('schedule.json', (sch) => { sch.categories = categories.map(pickCategory); return sch; }, () => ({ entries: [], categories: [] }));
    broadcast('schedule-update', schedule);
    res.json(schedule.categories);
  } catch (err) {
    console.error('[api] PUT /schedule/categories error:', err.message);
    res.status(500).json({ error: 'Failed to save schedule categories.' });
  }
});

// ── Schedule — Load Template (replace current schedule) ─────────────────

router.post('/schedule/template', async (req, res) => {
  try {
    const { entries, categories } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Template entries must be an array.' });
    }
    const schedule = {
      entries: entries.map((e) => ({ id: uuidv4(), ...pickScheduleEntry(e), enabled: e.enabled !== false })),
      categories: Array.isArray(categories) ? categories.map(pickCategory) : [],
    };
    await writeJSON('schedule.json', schedule);
    broadcast('schedule-update', schedule);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json(schedule);
  } catch (err) {
    console.error('[api] POST /schedule/template error:', err.message);
    res.status(500).json({ error: 'Failed to load schedule template.' });
  }
});

// ── Schedule Templates ───────────────────────────────────────────────────

router.get('/schedule/templates', async (_req, res) => {
  try {
    const templates = await readJSON('schedule-templates.json');
    res.json(templates ?? []);
  } catch (err) {
    console.error('[api] GET /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to read schedule templates.' });
  }
});

router.post('/schedule/templates', async (req, res) => {
  try {
    if (!req.body?.name) {
      return res.status(400).json({ error: 'Template name is required.' });
    }
    const picked = pick(req.body, SCHEDULE_TEMPLATE_FIELDS);
    if (!Array.isArray(picked.entries)) {
      return res.status(400).json({ error: 'Template entries must be an array.' });
    }
    // Sanitize entries and categories within the template
    picked.entries = picked.entries.map((e) => pickScheduleEntry(e));
    if (Array.isArray(picked.categories)) {
      picked.categories = picked.categories.map(pickCategory);
    } else {
      picked.categories = [];
    }
    const newTemplate = {
      id: uuidv4(),
      ...picked,
      createdAt: new Date().toISOString(),
    };
    await updateJSON('schedule-templates.json', (list) => { list.push(newTemplate); return list; }, () => []);
    res.status(201).json(newTemplate);
  } catch (err) {
    console.error('[api] POST /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to save schedule template.' });
  }
});

router.put('/schedule/templates/:id', async (req, res) => {
  try {
    const updates = pick(req.body, SCHEDULE_TEMPLATE_FIELDS);
    // Sanitize entries and categories if provided
    if (Array.isArray(updates.entries)) {
      updates.entries = updates.entries.map((e) => pickScheduleEntry(e));
    }
    if (Array.isArray(updates.categories)) {
      updates.categories = updates.categories.map(pickCategory);
    }
    let updated = null;
    const r = await updateJSON('schedule-templates.json', (list) => {
      const idx = list.findIndex((t) => t.id === req.params.id);
      if (idx === -1) return SKIP;
      list[idx] = { ...list[idx], ...updates, id: req.params.id, updatedAt: new Date().toISOString() };
      updated = list[idx];
      return list;
    }, () => []);
    if (r === SKIP) return res.status(404).json({ error: 'Template not found.' });
    res.json(updated);
  } catch (err) {
    console.error('[api] PUT /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to update schedule template.' });
  }
});

router.delete('/schedule/templates/:id', async (req, res) => {
  try {
    const r = await updateJSON('schedule-templates.json', (list) => (list.some((t) => t.id === req.params.id) ? list.filter((t) => t.id !== req.params.id) : SKIP), () => []);
    if (r === SKIP) return res.status(404).json({ error: 'Template not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to delete schedule template.' });
  }
});

// ── Weather test (admin Settings → Weather → Test) ─────────────────────────
// Fetches live weather for the SAVED zip and reports what the screen would
// show, or a plain-English reason it can't. Writes nothing (cache untouched).
router.get('/weather/preview', async (req, res) => {
  const settings = (await readJSON('settings.json').catch(() => null)) ?? {};
  const zip = String(settings.location?.zip || '').trim();
  const units = req.query.units === 'C' ? 'C' : req.query.units === 'F' ? 'F' : (settings.weather?.units === 'C' ? 'C' : 'F');
  if (!zip) return res.json({ ok: false, error: 'No zip code is set. Add one under Settings → Location and save.' });
  if (!/^\d{5}$/.test(zip)) return res.json({ ok: false, zip, error: `"${zip}" is not a 5-digit US zip code, so the weather can't be looked up. Fix it under Settings → Location.` });
  try {
    const w = await fetchWeather({ zip, units, timezone: settings.location?.timezone, strict: true });
    const d = describeWeather(w.current.code, w.current.isDay);
    res.json({
      ok: true, zip, units, place: w.location?.name || '',
      temp: w.current.temp, feels: w.current.feels, condition: d.en, conditionHe: d.he,
      hi: w.today?.hi ?? null, lo: w.today?.lo ?? null, fetchedAt: w.fetchedAt,
    });
  } catch (err) {
    res.json({ ok: false, zip, error: `Couldn't get the weather for ${zip}: ${networkReason(err)}. Check the zip code and that the server is online.` });
  }
});

// ── Refresh ────────────────────────────────────────────────────────────────

router.post('/refresh', async (_req, res) => {
  try {
    const settings = (await readJSON('settings.json')) ?? {};
    const config = settings.location || { zip: '33139', locationId: '33139' };
    const result = await manualRefresh(config);
    broadcast('cache-refresh', result);
    res.json(result);
  } catch (err) {
    console.error('[api] POST /refresh error:', err.message, err.stack);
    res.status(500).json({ error: 'Data refresh failed. External APIs may be temporarily unavailable.' });
  }
});

// ── Cleanup ───────────────────────────────────────────────────────────────

router.post('/cleanup', async (_req, res) => {
  try {
    const result = await runCleanup();
    res.json(result);
  } catch (err) {
    console.error('[api] POST /cleanup error:', err.message, err.stack);
    res.status(500).json({ error: 'Storage cleanup failed.' });
  }
});

// ── Security ─────────────────────────────────────────────────────────────

router.post('/security/forget-devices', async (req, res) => {
  try {
    await users.forgetTrustedDevices(req.user.id);
    // Also clear the requesting browser's own trusted-device cookie —
    // otherwise it looks trusted client-side until it happens to try again.
    res.clearCookie('tachtach_trusted_device', { path: '/' });
    res.json({ success: true });
  } catch (err) {
    console.error('[api] POST /security/forget-devices error:', err.message);
    res.status(500).json({ error: 'Failed to forget trusted devices.' });
  }
});

// ── Screen commands ────────────────────────────────────────────────────────

// One route per allow-listed command (src/shared/screenCommands.js); anything else is a 404.
for (const action of SCREEN_COMMANDS) {
  router.post(`/screen/${action}`, (_req, res) => {
    broadcastToAll('screen-command', { action });
    if (action === 'pause') setScreenState({ isPaused: true });
    if (action === 'resume') setScreenState({ isPaused: false });
    res.json({ success: true });
  });
}

// Authenticated version of screen/state (for admin panel access from remote machines)
router.get('/screen/state', (_req, res) => {
  res.json(getScreenState());
});

// (POST /api/preview, a relay of any JSON to every screen and live viewer, was removed: nothing used it. Audit L6.)

// ── Logo upload (credit line logo) ───────────────────────────────────────

const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (LOGO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(clientError('Allowed logo formats: JPEG, PNG, SVG, WebP.'));
  },
});

router.post('/logo', (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Logo too large. Maximum size is 2 MB.' });
      }
      return res.status(400).json({ error: isClientError(err) ? err.message : 'Logo upload rejected.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No logo file provided.' });

    const { writeFile: wf } = await import('fs/promises');
    // The type comes from the bytes (not the file name or the declared Content-Type); the stored extension is the sniffed one.
    const sniffed = sniffLogoType(req.file.buffer);
    if (!sniffed || !LOGO_EXTS.includes(sniffed.ext) || sniffed.mime !== req.file.mimetype) {
      return res.status(400).json({ error: 'That file is not a valid logo. Use a JPEG, PNG, WebP or plain SVG picture.' });
    }
    const ext = sniffed.ext;
    const id = uuidv4();
    const filename = `logo-${id}${ext}`;
    const uploadsDir = path.resolve(__apiDirname, '../../../data/uploads');

    // Delete any previous logo files
    try {
      const existing = await readdir(uploadsDir);
      for (const f of existing) {
        if (f.startsWith('logo-')) {
          await unlink(path.join(uploadsDir, f)).catch(() => {});
        }
      }
    } catch { /* uploads dir may not exist yet */ }

    await mkdir(uploadsDir, { recursive: true });
    await wf(path.join(uploadsDir, filename), req.file.buffer);

    const url = `/uploads/${filename}`;
    res.status(201).json({ url, filename });
  } catch (err) {
    console.error('[api] POST /logo error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save logo.' });
  }
});

router.delete('/logo', async (req, res) => {
  try {
    const uploadsDir = path.resolve(__apiDirname, '../../../data/uploads');
    const existing = await readdir(uploadsDir);
    for (const f of existing) {
      if (f.startsWith('logo-')) {
        await unlink(path.join(uploadsDir, f)).catch(() => {});
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /logo error:', err.message);
    res.status(500).json({ error: 'Failed to delete logo.' });
  }
});

// ── Image upload ──────────────────────────────────────────────────────────

router.post('/upload', (req, res, next) => {
  // Wrap multer to catch file-size and file-type errors gracefully
  upload.single('media')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 50 MB.' });
      }
      if (isClientError(err)) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: 'Upload rejected.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided. Select a file first.' });
    const type = getMediaType(req.file.mimetype);
    let result;
    if (type === 'image') {
      // Shrink into the real screen's size (1920x1080 until a screen has reported).
      const settings = (await readJSON('settings.json')) ?? {};
      result = await processImage(req.file.buffer, req.file.mimetype, uploadBox(getScreenDisplay(), settings.orientation));
    } else if (type === 'gif') {
      result = await processGif(req.file.buffer);
    } else if (type === 'video') {
      result = await processVideo(req.file.buffer, req.file.mimetype);
    } else if (type === 'pdf') {
      const settings = (await readJSON('settings.json')) ?? {};
      result = await processPdf(req.file.buffer, uploadBox(getScreenDisplay(), settings.orientation), UPLOAD_DIR);
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${req.file.mimetype}. Use JPEG, PNG, WebP, GIF, MP4, WebM, or PDF.` });
    }
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof PdfError) return res.status(err.status).json({ error: err.message });
    console.error('[api] POST /upload error:', err.message, err.stack);
    const msg = 'Image processing failed. The file may be corrupted or in an unsupported format.';
    res.status(500).json({ error: msg });
  }
});

// The library: every picture / GIF / video uploaded (newest first).
router.get('/media', async (_req, res) => {
  try {
    res.json(await listMedia());
  } catch (err) {
    console.error('[api] GET /media error:', err.message);
    res.status(500).json({ error: 'Failed to list media.' });
  }
});

router.delete('/media/:id', async (req, res) => {
  try {
    await deleteMedia(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /media error:', err.message);
    res.status(500).json({ error: 'Failed to delete media file.' });
  }
});

// Keep old route for backward compat
router.delete('/images/:id', async (req, res) => {
  try {
    await deleteMedia(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /images error:', err.message);
    res.status(500).json({ error: 'Failed to delete media file.' });
  }
});

// ── Google Photos Albums ──────────────────────────────────────────────────

const GOOGLE_ALBUM_FIELDS = ['url', 'displayMode', 'photoInterval', 'photoOrder', 'refreshInterval', 'kenBurns', 'imageDisplayMode', 'enabled', 'maxPhotos'];

router.get('/google-albums', async (_req, res) => {
  try {
    const albums = (await readJSON('google-albums.json')) ?? [];
    // Enrich with status info
    const enriched = await Promise.all(albums.map(async (album) => {
      try {
        const status = await getAlbumStatus(album.url);
        return { ...album, ...status };
      } catch {
        return album;
      }
    }));
    res.json(enriched);
  } catch (err) {
    console.error('[api] GET /google-albums error:', err.message);
    res.status(500).json({ error: 'Failed to read Google Albums config.' });
  }
});

router.post('/google-album', async (req, res) => {
  try {
    if (!req.body?.url) {
      return res.status(400).json({ error: 'Album URL is required.' });
    }
    const url = req.body.url.trim();
    if (!isGoogleAlbumUrl(url)) {
      return res.status(400).json({ error: 'Invalid Google Photos shared album URL.' });
    }

    const albumId = extractAlbumId(url);
    const newAlbum = {
      id: uuidv4(),
      ...pick(req.body, GOOGLE_ALBUM_FIELDS),
      url,
      albumId,
      createdAt: new Date().toISOString(),
      enabled: true,
    };
    let existing = null;
    await updateJSON('google-albums.json', (albums) => {
      // Check if this album is already configured
      existing = albums.find(a => extractAlbumId(a.url) === albumId);
      if (existing) return SKIP;
      albums.push(newAlbum);
      return albums;
    }, () => []);
    if (existing) {
      return res.status(409).json({ error: 'This album is already connected.', id: existing.id });
    }

    // Start initial sync in background (don't block the response)
    syncAlbum(newAlbum).catch(err => {
      console.error(`[api] Initial sync failed for ${albumId}:`, err.message);
    });

    // Start periodic sync timer
    startSyncTimer(newAlbum);

    res.status(201).json(newAlbum);
  } catch (err) {
    console.error('[api] POST /google-album error:', err.message);
    res.status(500).json({ error: 'Failed to save album configuration.' });
  }
});

router.get('/google-album/:id/status', async (req, res) => {
  try {
    const albums = (await readJSON('google-albums.json')) ?? [];
    const album = albums.find(a => a.id === req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }
    const status = await getAlbumStatus(album.url);
    res.json(status);
  } catch (err) {
    console.error('[api] GET /google-album status error:', err.message);
    res.status(500).json({ error: 'Failed to get album status.' });
  }
});

router.get('/google-album/:id/photos', async (req, res) => {
  try {
    const albums = (await readJSON('google-albums.json')) ?? [];
    const album = albums.find(a => a.id === req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }
    const photos = await getAlbumPhotos(album.url);
    res.json(photos);
  } catch (err) {
    console.error('[api] GET /google-album photos error:', err.message);
    res.status(500).json({ error: 'Failed to get album photos.' });
  }
});

router.post('/google-album/:id/sync', async (req, res) => {
  try {
    const albums = (await readJSON('google-albums.json')) ?? [];
    const album = albums.find(a => a.id === req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }
    // Sync in background
    syncAlbum(album).catch(err => {
      console.error(`[api] Manual sync failed:`, err.message);
    });
    res.json({ success: true, message: 'Sync started' });
  } catch (err) {
    console.error('[api] POST /google-album sync error:', err.message);
    res.status(500).json({ error: 'Failed to start album sync.' });
  }
});

router.put('/google-album/:id', async (req, res) => {
  try {
    const updates = pick(req.body, GOOGLE_ALBUM_FIELDS);
    delete updates.url; // the album link itself can't change (cache dirs are keyed by it)
    let prevMax, idx = -1;
    const albums = await updateJSON('google-albums.json', (list) => {
      idx = list.findIndex(a => a.id === req.params.id);
      if (idx === -1) return SKIP;
      prevMax = list[idx].maxPhotos;
      list[idx] = { ...list[idx], ...updates, id: req.params.id };
      return list;
    }, () => []);
    if (albums === SKIP) return res.status(404).json({ error: 'Album not found.' });

    // A new photo cap takes effect now, not at the next timed sync.
    if ('maxPhotos' in updates && updates.maxPhotos !== prevMax && albums[idx].enabled !== false) {
      syncAlbum(albums[idx]).catch(err => {
        console.error('[api] Re-sync after maxPhotos change failed:', err.message);
      });
    }

    // Restart sync timer with new interval
    const albumId = extractAlbumId(albums[idx].url);
    stopSyncTimer(albumId);
    if (albums[idx].enabled !== false) {
      startSyncTimer(albums[idx]);
    }

    broadcast('google-albums-update', albums);
    res.json(albums[idx]);
  } catch (err) {
    console.error('[api] PUT /google-album error:', err.message);
    res.status(500).json({ error: 'Failed to update album.' });
  }
});

router.delete('/google-album/:id', async (req, res) => {
  try {
    const album = ((await readJSON('google-albums.json')) ?? []).find(a => a.id === req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }

    // Delete cached photos
    await deleteAlbumCache(album.url);

    const albums = await updateJSON('google-albums.json', (list) => list.filter(a => a.id !== req.params.id), () => []);
    broadcast('google-albums-update', albums);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /google-album error:', err.message);
    res.status(500).json({ error: 'Failed to delete album.' });
  }
});

// ── Fonts ────────────────────────────────────────────────────────────────

router.get('/fonts', async (_req, res) => {
  try {
    const fonts = await readJSON('fonts.json');
    res.json(fonts ?? []);
  } catch (err) {
    console.error('[api] GET /fonts error:', err.message);
    res.status(500).json({ error: 'Failed to read fonts.' });
  }
});

router.post('/fonts', (req, res, next) => {
  fontUpload.single('font')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Font file too large. Maximum size is 5 MB.' });
      }
      return res.status(400).json({ error: isClientError(err) ? err.message : 'Font upload rejected.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No font file provided.' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const format = (ext === '.ttf' || ext === '.otf') ? 'truetype' : ext.slice(1); // woff, woff2, or truetype
    const id = uuidv4();
    const filename = `${id}${ext}`;

    if (!looksLikeFont(req.file.buffer)) return res.status(400).json({ error: 'That file does not look like a font (.ttf, .otf, .woff or .woff2).' });

    // Derive a display name from the original filename (strip extension); letters, digits, space and dash only,
    // because the name is written into the screen's CSS (audit L4).
    const name = cleanFontName(req.body?.name)
      || cleanFontName(path.basename(req.file.originalname, ext).replace(/[-_]+/g, ' '))
      || 'Custom Font';

    // Write font file to disk
    const { writeFile } = await import('fs/promises');
    await writeFile(path.join(FONTS_DIR, filename), req.file.buffer);

    // Update fonts.json
    const entry = { id, name, filename, format };
    const fonts = await updateJSON('fonts.json', (list) => { list.push(entry); return list; }, () => []);
    broadcast('fonts-update', fonts);

    res.status(201).json(entry);
  } catch (err) {
    console.error('[api] POST /fonts error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save font file.' });
  }
});

router.delete('/fonts/:id', async (req, res) => {
  try {
    const font = ((await readJSON('fonts.json')) ?? []).find(f => f.id === req.params.id);
    if (!font) {
      return res.status(404).json({ error: 'Font not found.' });
    }

    // Delete file from disk
    try {
      await unlink(path.join(FONTS_DIR, font.filename));
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error('[api] Font file delete error:', e.message);
      }
    }

    const fonts = await updateJSON('fonts.json', (list) => list.filter(f => f.id !== req.params.id), () => []);
    broadcast('fonts-update', fonts);

    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /fonts error:', err.message);
    res.status(500).json({ error: 'Failed to delete font.' });
  }
});

// ── RSS Feeds ────────────────────────────────────────────────────────────

router.post('/rss/preview', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Feed URL is required.' });
    }
    if (!parseFeedUrl(url)) return res.status(400).json({ error: 'Enter a web address starting with http:// or https://' });

    const result = await fetchRSSFeed(url.trim());
    res.json(result);
  } catch (err) {
    console.error('[api] POST /rss/preview error:', err.message);
    res.status(502).json({ error: `Failed to fetch feed: ${networkReason(err)}` });
  }
});

router.get('/rss/feeds', async (_req, res) => {
  try {
    const feeds = await readJSON('rss-feeds.json');
    res.json(feeds ?? []);
  } catch (err) {
    console.error('[api] GET /rss/feeds error:', err.message);
    res.status(500).json({ error: 'Failed to read RSS feeds.' });
  }
});

router.post('/rss/feeds', async (req, res) => {
  try {
    const { url, name, mapping, refreshInterval } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Feed URL is required.' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Feed name is required.' });
    }
    if (!parseFeedUrl(url)) return res.status(400).json({ error: 'Enter a web address starting with http:// or https://' });
    const allowedMappingKeys = ['primary', 'secondary', 'body', 'attribution'];
    const safeMapping = {};
    if (mapping && typeof mapping === 'object') {
      for (const key of allowedMappingKeys) {
        if (mapping[key] && RSS_FIELDS.includes(mapping[key])) {
          safeMapping[key] = mapping[key];
        }
      }
    }

    const newFeed = {
      id: uuidv4(),
      url: url.trim(),
      name: name.trim().slice(0, 100),
      mapping: safeMapping,
      refreshInterval: ['hourly', 'every6hours', 'daily'].includes(refreshInterval) ? refreshInterval : 'daily',
      createdAt: new Date().toISOString(),
      lastFetched: null,
      itemCount: 0,
    };

    await updateJSON('rss-feeds.json', (list) => { list.push(newFeed); return list; }, () => []);

    refreshRSSFeed(newFeed).catch(err => {
      console.error(`[api] Initial RSS fetch failed for ${newFeed.id}:`, err.message);
    });
    startRSSScheduler(newFeed);

    res.status(201).json(newFeed);
  } catch (err) {
    console.error('[api] POST /rss/feeds error:', err.message);
    res.status(500).json({ error: 'Failed to save RSS feed.' });
  }
});

router.put('/rss/feeds/:id', async (req, res) => {
  try {
    const updates = pick(req.body, RSS_FEED_FIELDS);
    if ('url' in updates && !(typeof updates.url === 'string' && parseFeedUrl(updates.url))) {
      return res.status(400).json({ error: 'Enter a web address starting with http:// or https://' });
    }
    if (typeof updates.url === 'string') updates.url = updates.url.trim();
    if (updates.mapping && typeof updates.mapping === 'object') {
      const allowedMappingKeys = ['primary', 'secondary', 'body', 'attribution'];
      const safeMapping = {};
      for (const key of allowedMappingKeys) {
        if (updates.mapping[key] && RSS_FIELDS.includes(updates.mapping[key])) {
          safeMapping[key] = updates.mapping[key];
        }
      }
      updates.mapping = safeMapping;
    }
    if (updates.name) updates.name = updates.name.trim().slice(0, 100);
    if (updates.refreshInterval && !['hourly', 'every6hours', 'daily'].includes(updates.refreshInterval)) {
      delete updates.refreshInterval;
    }

    let updated = null;
    const feeds = await updateJSON('rss-feeds.json', (list) => {
      const idx = list.findIndex(f => f.id === req.params.id);
      if (idx === -1) return SKIP;
      list[idx] = { ...list[idx], ...updates, id: req.params.id };
      updated = list[idx];
      return list;
    }, () => []);
    if (feeds === SKIP) return res.status(404).json({ error: 'Feed not found.' });

    stopRSSTimer(req.params.id);
    startRSSScheduler(updated);

    broadcast('rss-feeds-update', feeds);
    res.json(updated);
  } catch (err) {
    console.error('[api] PUT /rss/feeds error:', err.message);
    res.status(500).json({ error: 'Failed to update RSS feed.' });
  }
});

router.delete('/rss/feeds/:id', async (req, res) => {
  try {
    const feed = ((await readJSON('rss-feeds.json')) ?? []).find(f => f.id === req.params.id);
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found.' });
    }

    stopRSSTimer(req.params.id);
    const feeds = await updateJSON('rss-feeds.json', (list) => list.filter(f => f.id !== req.params.id), () => []);

    try {
      const { unlink: unlinkFile } = await import('fs/promises');
      const cachePath = path.resolve(__apiDirname, `../../../data/rss-cache/${req.params.id}.json`);
      await unlinkFile(cachePath);
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[api] RSS cache cleanup error:', e.message);
    }

    broadcast('rss-feeds-update', feeds);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /rss/feeds error:', err.message);
    res.status(500).json({ error: 'Failed to delete RSS feed.' });
  }
});

router.post('/rss/feeds/:id/sync', async (req, res) => {
  try {
    const feeds = (await readJSON('rss-feeds.json')) ?? [];
    const feed = feeds.find(f => f.id === req.params.id);
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found.' });
    }
    refreshRSSFeed(feed).catch(err => {
      console.error(`[api] Manual RSS sync failed:`, err.message);
    });
    res.json({ success: true, message: 'Sync started' });
  } catch (err) {
    console.error('[api] POST /rss/feeds sync error:', err.message);
    res.status(500).json({ error: 'Failed to start feed sync.' });
  }
});

router.get('/rss/cache/:feedId', async (req, res) => {
  try {
    const { readFile: rf } = await import('fs/promises');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(req.params.feedId))) return res.status(400).json({ error: 'Bad feed id.' });
    const filePath = path.resolve(__apiDirname, `../../../data/rss-cache/${req.params.feedId}.json`);
    const raw = await rf(filePath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ items: [] });
    console.error('[api] GET /rss/cache error:', err.message);
    res.status(500).json({ error: 'Failed to read RSS cache.' });
  }
});

// ── Date preview state ────────────────────────────────────────────────────
// Returns full screen state as it would appear on a given date.
// Fetches date-specific content in parallel via HTML scraping and APIs (preview only).
// The daily scheduler (fetchers/index.js) is never called here — it stays RSS-only.
// Fields that can't be fetched for arbitrary dates (dailyQuote, parshaTidbits,
// Hebrew limudim) fall back to today's cached values.

router.get('/preview-state', async (req, res) => {
  try {
    const dateStr = req.query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
    }

    const [settings, slides, announcementState, customDays, googleAlbums, schedule, rssFeeds, currentCache, scheduleDates] = await Promise.all([
      readJSON('settings.json'),
      readJSON('slides.json'),
      getStateExtras(),
      readJSON('custom-days.json'),
      readJSON('google-albums.json'),
      readJSON('schedule.json'),
      readJSON('rss-feeds.json'),
      readJSON('cache.json'),
      readJSON('schedule-dates.json'),
    ]);

    // Fetch date-sensitive data for the override date
    // settings.dataSource: 'local' calculates the date facts and reads the data pack instead of calling Hebcal / Chabad.org.
    const { sourceFor } = await import('../../fetchers/dataSource.js');
    const src = sourceFor(settings, currentCache);
    const isLocal = src.name === 'local';
    const { fetchHayomYom, fetchTanyaExcerpt,
            fetchChumashForDate, fetchTehillimForDate } = await import('../../fetchers/chabad.js');
    const { fetchTorahCalc } = await import('../../fetchers/torahcalc.js');

    const locationId = settings?.location?.locationId;
    const zip        = settings?.location?.zip;
    const dateObj    = new Date(dateStr + 'T12:00:00');
    const none       = Promise.resolve(null);

    const [
      hebrewDateResult,
      zmanimResult,
      hayomYomResult,
      tanyaExcerptResult,
      chumashResult,
      tehillimResult,
      torahCalcResult,
      parshaResult,
    ] = await Promise.allSettled([
      src.fetchHebrewDate(dateObj),
      (locationId || isLocal) ? src.fetchZmanim(locationId, dateStr) : none,
      isLocal ? none : fetchHayomYom(dateObj),
      isLocal ? none : fetchTanyaExcerpt(dateObj),
      isLocal ? none : fetchChumashForDate(dateObj),
      isLocal ? none : fetchTehillimForDate(dateObj),
      isLocal ? none : fetchTorahCalc(dateObj),
      (zip || isLocal) ? src.fetchParsha(zip, dateObj) : none,
    ]);

    const val = (r) => r.status === 'fulfilled' ? r.value : null;
    const hebrewDate   = val(hebrewDateResult);
    const zmanim       = val(zmanimResult);
    const hayomYom     = val(hayomYomResult);
    const tanyaExcerpt = val(tanyaExcerptResult);
    const chumash      = val(chumashResult);
    const tehillim     = val(tehillimResult);
    const tc           = val(torahCalcResult);
    const parsha       = val(parshaResult);

    // Compute omer from Hebrew date
    let omer = null;
    if (hebrewDate) {
      const { hebrewMonth, hebrewDay } = hebrewDate;
      if (typeof hebrewDate.omer === 'number' && hebrewDate.omer > 0) {
        omer = { count: hebrewDate.omer };
      } else if (hebrewMonth === 'Nisan' && hebrewDay >= 16) {
        omer = { count: hebrewDay - 15 };
      } else if (hebrewMonth === 'Iyyar') {
        omer = { count: 15 + hebrewDay };
      } else if (hebrewMonth === 'Sivan' && hebrewDay <= 5) {
        omer = { count: 44 + hebrewDay };
      }
    }

    // Merge: start from today's cache, override date-sensitive fields
    const previewCache = {
      ...(currentCache ?? {}),

      hebrewDate: hebrewDate
        ? { hebrew: hebrewDate.hebrew, hebrewYear: hebrewDate.hebrewYear,
            hebrewMonth: hebrewDate.hebrewMonth, hebrewDay: hebrewDate.hebrewDay }
        : (currentCache?.hebrewDate ?? null),

      omer: omer ?? null,

      zmanim: zmanim ? { today: zmanim } : (currentCache?.zmanim ?? {}),

      hayomYom: hayomYom
        ? { en: hayomYom.hayomEn, he: hayomYom.hayomHe }
        : (currentCache?.hayomYom ?? { en: '', he: '' }),

      limudim: {
        ...(currentCache?.limudim ?? {}),
        ...(chumash   ? { chumash }   : {}),
        ...(tehillim  ? { tehillim }  : {}),
        ...(tanyaExcerpt ? {
          tanyaFirstWords: tanyaExcerpt.tanyaFirstWords,
          tanyaLastWords:  tanyaExcerpt.tanyaLastWords,
        } : {}),
      },

      rambam1: tc?.rambam1
        ? { ...(currentCache?.rambam1 ?? {}),
            displayEn: tc.rambam1.displayEn, displayHe: tc.rambam1.displayHe }
        : (currentCache?.rambam1 ?? null),

      rambam3: tc?.rambam3
        ? { ...(currentCache?.rambam3 ?? {}),
            displayEn: tc.rambam3.displayEn, displayHe: tc.rambam3.displayHe }
        : (currentCache?.rambam3 ?? null),

      seferHamitzvot: tc?.seferHamitzvot
        ? { ...(currentCache?.seferHamitzvot ?? {}),
            displayEn: tc.seferHamitzvot.displayEn, displayHe: tc.seferHamitzvot.displayHe }
        : (currentCache?.seferHamitzvot ?? null),

      pirkeiAvos: tc?.pirkeiAvos
        ? tc.pirkeiAvos
        : (currentCache?.pirkeiAvos ?? null),

      parsha: parsha
        ? { name: parsha.name, hebrew: parsha.hebrew, date: parsha.date }
        : (currentCache?.parsha ?? null),
    };

    if (isLocal) {
      const { applyLocalDay } = await import('../../fetchers/index.js');
      await applyLocalDay(previewCache, { now: new Date().toISOString(), localDate: dateStr, parsha });
    }

    res.json({
      cache: previewCache,
      settings: settings ?? {},
      slides: slides ?? [],
      ...announcementState,
      customDays: customDays ?? [],
      googleAlbums: googleAlbums ?? [],
      // That date's effective schedule (its own date schedule, else the
      // weekly entries for that weekday) — the kiosk resolves it again with
      // scheduleDates, which is idempotent.
      schedule: getEffectiveSchedule(schedule, scheduleDates, dateStr),
      scheduleDates: scheduleDates ?? {},
      rssFeeds: rssFeeds ?? [],
      roster: rosterForKiosk(await readRoster()),
      chazan: await readChazanForKiosk(),
      dailyWords: await readDailyWords(), // full history, so a past date previews the word that really showed
      dailyStories: await readDailyStories(), // same: a past date previews the story that really showed
      _previewDate: dateStr,
    });
  } catch (err) {
    console.error('[api] GET /preview-state error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to build preview state.' });
  }
});

// Used by History > Undo (src/server/undoIo.js) so an undone settings change is saved exactly like a normal one.
export { saveSettings, withSettingsLock };
export const normalizeForSave = (settings) => normalizeSettings(settings).settings;

export default router;
