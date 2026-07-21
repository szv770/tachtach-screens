import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, unlink, readdir } from 'fs/promises';
import multer from 'multer';
import { readJSON, writeJSON } from '../storage.js';
import { broadcast, broadcastToAll } from '../sse.js';
import { getScreenState, setScreenState } from '../screenState.js';
import { setupTrackA, setupTrackB, manualRefresh } from '../scheduler.js';
import { upload, processImage, processGif, processVideo, getMediaType, deleteMedia } from '../upload.js';
import { syncAlbum, deleteAlbumCache, getAlbumStatus, getAlbumPhotos, startSyncTimer, stopSyncTimer } from '../google-photos.js';
import { extractAlbumId } from '../../fetchers/google-photos.js';
import { initCountdowns } from '../countdown.js';
import { runCleanup } from '../cleanup.js';
import { fetchRSSFeed, RSS_FIELDS } from '../../fetchers/rss.js';
import { refreshRSSFeed, refreshAllRSSFeeds, startRSSScheduler, stopRSSTimer } from '../rss-scheduler.js';
import { forgetAllTrustedDevices } from '../auth.js';

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
    else cb(new Error('Only .ttf, .otf, .woff, and .woff2 font files are allowed.'));
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

const SLIDE_FIELDS = ['type', 'template', 'titleHe', 'titleEn', 'bodyHe', 'bodyEn', 'attribution', 'label', 'fullscreen', 'imageUrl', 'mediaId', 'filename', 'blurFilename', 'mediaType', 'duration', 'textHe', 'textEn', 'enabled', 'order', 'width', 'height', 'dominantColor', 'googleAlbumId', 'displayMode', 'photoInterval', 'photoOrder', 'kenBurns', 'imageDisplayMode', 'subtitle', 'style', 'rssFeedId', 'rssDisplayMode', 'embedUrl'];
const RSS_FEED_FIELDS = ['url', 'name', 'mapping', 'refreshInterval'];
const MESSAGE_FIELDS = ['type', 'textHe', 'textEn', 'priority', 'expiresAt', 'bgColor', 'style', 'target', 'subtitle'];
const PINNED_FIELDS = ['textHe', 'textEn', 'priority', 'enabled', 'order', 'icon', 'expiresAt', 'displayMode', 'duration', 'fullscreen'];
const CUSTOM_DAY_FIELDS = ['title', 'titleHe', 'subtitle', 'date', 'recurring', 'type', 'enabled', 'hebrewMonth', 'hebrewDay', 'gregorianMonth', 'gregorianDay'];
const SCHEDULE_ENTRY_FIELDS = ['name', 'nameHe', 'time', 'endTime', 'category', 'days', 'enabled', 'alertBefore', 'order', 'countdownDisplay', 'icon'];
const SCHEDULE_CATEGORY_FIELDS = ['id', 'name', 'color', 'icon'];
const SCHEDULE_TEMPLATE_FIELDS = ['name', 'entries', 'categories'];

// ── GET /api/state — full initial payload ──────────────────────────────────

router.get('/state', async (_req, res) => {
  try {
    const [cache, settings, slides, messages, pinned, customDays, googleAlbums, schedule, scheduleTemplates, rssFeeds] = await Promise.all([
      readJSON('cache.json'),
      readJSON('settings.json'),
      readJSON('slides.json'),
      readJSON('messages.json'),
      readJSON('pinned.json'),
      readJSON('custom-days.json'),
      readJSON('google-albums.json'),
      readJSON('schedule.json'),
      readJSON('schedule-templates.json'),
      readJSON('rss-feeds.json'),
    ]);

    res.json({
      cache:      cache      ?? {},
      settings:   settings   ?? {},
      slides:     slides     ?? [],
      messages:   messages   ?? [],
      pinned:     pinned     ?? [],
      customDays: customDays ?? [],
      googleAlbums: googleAlbums ?? [],
      schedule:   schedule   ?? { entries: [], categories: [] },
      scheduleTemplates: scheduleTemplates ?? [],
      rssFeeds:   rssFeeds   ?? [],
    });
  } catch (err) {
    console.error('[api] GET /state error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to load screen state. The data files may be corrupted.' });
  }
});

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

router.put('/settings', async (req, res) => {
  try {
    const settings = req.body;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ error: 'Invalid settings data.' });
    }
    await writeJSON('settings.json', settings);
    broadcast('settings-update', settings);

    // Restart scheduler tracks if relevant settings changed
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

    res.json(settings);
  } catch (err) {
    console.error('[api] PUT /settings error:', err.message);
    res.status(500).json({ error: 'Failed to save settings. Check server disk space and permissions.' });
  }
});

// ── Slides ─────────────────────────────────────────────────────────────────

router.get('/slides', async (_req, res) => {
  try {
    const slides = await readJSON('slides.json');
    res.json(slides ?? []);
  } catch (err) {
    console.error('[api] GET /slides error:', err.message);
    res.status(500).json({ error: 'Failed to read slides.' });
  }
});

router.put('/slides', async (req, res) => {
  try {
    const slides = req.body;
    if (!Array.isArray(slides)) {
      return res.status(400).json({ error: 'Invalid slides data — expected an array.' });
    }
    // Sanitize each slide to only allowed fields (preserve id)
    const sanitized = slides.map((s) => ({ id: s?.id, ...pick(s, SLIDE_FIELDS) }));
    await writeJSON('slides.json', sanitized);
    broadcast('slides-update', sanitized);
    res.json(sanitized);
  } catch (err) {
    console.error('[api] PUT /slides error:', err.message);
    res.status(500).json({ error: 'Failed to save slides.' });
  }
});

router.post('/slides', async (req, res) => {
  try {
    const slides = (await readJSON('slides.json')) ?? [];
    const picked = pick(req.body, SLIDE_FIELDS);
    // Default enabled to true so new slides are visible immediately
    if (picked.enabled === undefined) picked.enabled = true;
    const newSlide = { id: uuidv4(), ...picked };
    slides.push(newSlide);
    await writeJSON('slides.json', slides);
    broadcast('slides-update', slides);
    res.status(201).json(newSlide);
  } catch (err) {
    console.error('[api] POST /slides error:', err.message);
    res.status(500).json({ error: 'Failed to create slide.' });
  }
});

router.delete('/slides/:id', async (req, res) => {
  try {
    let slides = (await readJSON('slides.json')) ?? [];
    // Find the slide being deleted so we can clean up its uploaded file
    const deleted = slides.find((s) => s.id === req.params.id);
    slides = slides.filter((s) => s.id !== req.params.id);
    await writeJSON('slides.json', slides);
    broadcast('slides-update', slides);

    // Clean up uploaded media file if this was a media slide
    if (deleted?.mediaId) {
      deleteMedia(deleted.mediaId).catch((e) => {
        console.error(`[api] Media cleanup failed for ${deleted.mediaId}:`, e.message);
      });
    } else if (deleted?.imageUrl) {
      // Legacy IMAGE_SLIDE — extract id from /uploads/UUID.ext
      const match = deleted.imageUrl.match(/\/uploads\/([a-f0-9-]+)\./);
      if (match) deleteMedia(match[1]).catch((e) => {
        console.error(`[api] Legacy media cleanup failed for ${match[1]}:`, e.message);
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /slides error:', err.message);
    res.status(500).json({ error: 'Failed to delete slide.' });
  }
});

// ── Messages ───────────────────────────────────────────────────────────────

router.get('/messages', async (_req, res) => {
  try {
    const messages = await readJSON('messages.json');
    res.json(messages ?? []);
  } catch (err) {
    console.error('[api] GET /messages error:', err.message);
    res.status(500).json({ error: 'Failed to read messages.' });
  }
});

router.post('/messages', async (req, res) => {
  try {
    if (!req.body?.type) {
      return res.status(400).json({ error: 'Message type is required.' });
    }
    if (!req.body?.textHe && !req.body?.textEn) {
      return res.status(400).json({ error: 'Message text (Hebrew or English) is required.' });
    }
    const messages = (await readJSON('messages.json')) ?? [];
    const newMsg = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...pick(req.body, MESSAGE_FIELDS),
    };
    messages.push(newMsg);
    await writeJSON('messages.json', messages);
    broadcast('messages-update', messages);
    res.status(201).json(newMsg);
  } catch (err) {
    console.error('[api] POST /messages error:', err.message);
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

router.delete('/messages/:id', async (req, res) => {
  try {
    let messages = (await readJSON('messages.json')) ?? [];
    messages = messages.filter((m) => m.id !== req.params.id);
    await writeJSON('messages.json', messages);
    broadcast('messages-update', messages);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /messages error:', err.message);
    res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// ── Pinned ─────────────────────────────────────────────────────────────────

router.get('/pinned', async (_req, res) => {
  try {
    const pinned = await readJSON('pinned.json');
    res.json(pinned ?? []);
  } catch (err) {
    console.error('[api] GET /pinned error:', err.message);
    res.status(500).json({ error: 'Failed to read pinned notes.' });
  }
});

router.post('/pinned', async (req, res) => {
  try {
    if (!req.body?.textHe && !req.body?.textEn) {
      return res.status(400).json({ error: 'Pinned note text (Hebrew or English) is required.' });
    }
    const pinned = (await readJSON('pinned.json')) ?? [];
    const newPin = { id: uuidv4(), ...pick(req.body, PINNED_FIELDS) };
    pinned.push(newPin);
    await writeJSON('pinned.json', pinned);
    broadcast('pinned-update', pinned);
    res.status(201).json(newPin);
  } catch (err) {
    console.error('[api] POST /pinned error:', err.message);
    res.status(500).json({ error: 'Failed to add pinned note.' });
  }
});

router.put('/pinned/:id', async (req, res) => {
  try {
    const pinned = (await readJSON('pinned.json')) ?? [];
    const idx = pinned.findIndex((p) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Pinned note not found. It may have been deleted.' });
    }
    pinned[idx] = { ...pinned[idx], ...pick(req.body, PINNED_FIELDS), id: req.params.id };
    await writeJSON('pinned.json', pinned);
    broadcast('pinned-update', pinned);
    res.json(pinned[idx]);
  } catch (err) {
    console.error('[api] PUT /pinned error:', err.message);
    res.status(500).json({ error: 'Failed to update pinned note.' });
  }
});

router.delete('/pinned/:id', async (req, res) => {
  try {
    let pinned = (await readJSON('pinned.json')) ?? [];
    pinned = pinned.filter((p) => p.id !== req.params.id);
    await writeJSON('pinned.json', pinned);
    broadcast('pinned-update', pinned);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /pinned error:', err.message);
    res.status(500).json({ error: 'Failed to delete pinned note.' });
  }
});

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
    const customDays = (await readJSON('custom-days.json')) ?? [];
    const newDay = { id: uuidv4(), ...pick(req.body, CUSTOM_DAY_FIELDS) };
    customDays.push(newDay);
    await writeJSON('custom-days.json', customDays);
    broadcast('custom-days-update', customDays);
    res.status(201).json(newDay);
  } catch (err) {
    console.error('[api] POST /custom-days error:', err.message);
    res.status(500).json({ error: 'Failed to add custom day.' });
  }
});

router.delete('/custom-days/:id', async (req, res) => {
  try {
    let customDays = (await readJSON('custom-days.json')) ?? [];
    customDays = customDays.filter((d) => d.id !== req.params.id);
    await writeJSON('custom-days.json', customDays);
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

router.put('/schedule/entries', async (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Invalid entries data — expected an array.' });
    }
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    schedule.entries = entries.map((e) => ({ id: e?.id, ...pick(e, SCHEDULE_ENTRY_FIELDS) }));
    await writeJSON('schedule.json', schedule);
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
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const picked = pick(req.body, SCHEDULE_ENTRY_FIELDS);
    if (picked.enabled === undefined) picked.enabled = true;
    const newEntry = { id: uuidv4(), ...picked };
    schedule.entries.push(newEntry);
    await writeJSON('schedule.json', schedule);
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
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    const idx = schedule.entries.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Schedule entry not found.' });
    }
    schedule.entries[idx] = { ...schedule.entries[idx], ...pick(req.body, SCHEDULE_ENTRY_FIELDS), id: req.params.id };
    await writeJSON('schedule.json', schedule);
    broadcast('schedule-update', schedule);
    initCountdowns().catch((err) => console.error('[countdown] Re-init error:', err.message));
    res.json(schedule.entries[idx]);
  } catch (err) {
    console.error('[api] PUT /schedule/entries/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update schedule entry.' });
  }
});

router.delete('/schedule/entries/:id', async (req, res) => {
  try {
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    schedule.entries = schedule.entries.filter((e) => e.id !== req.params.id);
    await writeJSON('schedule.json', schedule);
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
    const schedule = (await readJSON('schedule.json')) ?? { entries: [], categories: [] };
    schedule.categories = categories.map((c) => pick(c, SCHEDULE_CATEGORY_FIELDS));
    await writeJSON('schedule.json', schedule);
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
      entries: entries.map((e) => ({ id: uuidv4(), ...pick(e, SCHEDULE_ENTRY_FIELDS), enabled: e.enabled !== false })),
      categories: Array.isArray(categories) ? categories.map((c) => pick(c, SCHEDULE_CATEGORY_FIELDS)) : [],
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
    picked.entries = picked.entries.map((e) => pick(e, SCHEDULE_ENTRY_FIELDS));
    if (Array.isArray(picked.categories)) {
      picked.categories = picked.categories.map((c) => pick(c, SCHEDULE_CATEGORY_FIELDS));
    } else {
      picked.categories = [];
    }
    const templates = (await readJSON('schedule-templates.json')) ?? [];
    const newTemplate = {
      id: uuidv4(),
      ...picked,
      createdAt: new Date().toISOString(),
    };
    templates.push(newTemplate);
    await writeJSON('schedule-templates.json', templates);
    res.status(201).json(newTemplate);
  } catch (err) {
    console.error('[api] POST /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to save schedule template.' });
  }
});

router.put('/schedule/templates/:id', async (req, res) => {
  try {
    const templates = (await readJSON('schedule-templates.json')) ?? [];
    const idx = templates.findIndex((t) => t.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Template not found.' });
    }
    const updates = pick(req.body, SCHEDULE_TEMPLATE_FIELDS);
    // Sanitize entries and categories if provided
    if (Array.isArray(updates.entries)) {
      updates.entries = updates.entries.map((e) => pick(e, SCHEDULE_ENTRY_FIELDS));
    }
    if (Array.isArray(updates.categories)) {
      updates.categories = updates.categories.map((c) => pick(c, SCHEDULE_CATEGORY_FIELDS));
    }
    templates[idx] = { ...templates[idx], ...updates, id: req.params.id, updatedAt: new Date().toISOString() };
    await writeJSON('schedule-templates.json', templates);
    res.json(templates[idx]);
  } catch (err) {
    console.error('[api] PUT /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to update schedule template.' });
  }
});

router.delete('/schedule/templates/:id', async (req, res) => {
  try {
    let templates = (await readJSON('schedule-templates.json')) ?? [];
    const exists = templates.find((t) => t.id === req.params.id);
    if (!exists) {
      return res.status(404).json({ error: 'Template not found.' });
    }
    templates = templates.filter((t) => t.id !== req.params.id);
    await writeJSON('schedule-templates.json', templates);
    res.json({ success: true });
  } catch (err) {
    console.error('[api] DELETE /schedule/templates error:', err.message);
    res.status(500).json({ error: 'Failed to delete schedule template.' });
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
    await forgetAllTrustedDevices();
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

router.post('/screen/pause', (_req, res) => {
  broadcastToAll('screen-command', { action: 'pause' });
  setScreenState({ isPaused: true });
  res.json({ success: true });
});

router.post('/screen/resume', (_req, res) => {
  broadcastToAll('screen-command', { action: 'resume' });
  setScreenState({ isPaused: false });
  res.json({ success: true });
});

router.post('/screen/blank', (_req, res) => {
  broadcastToAll('screen-command', { action: 'blank' });
  res.json({ success: true });
});

router.post('/screen/advance', (_req, res) => {
  broadcastToAll('screen-command', { action: 'advance' });
  res.json({ success: true });
});

// Authenticated version of screen/state (for admin panel access from remote machines)
router.get('/screen/state', (_req, res) => {
  res.json(getScreenState());
});

// ── Preview ────────────────────────────────────────────────────────────────

router.post('/preview', (req, res) => {
  broadcastToAll('preview', req.body);
  res.json({ success: true });
});

// ── Logo upload (credit line logo) ───────────────────────────────────────

const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
const LOGO_EXTS = ['.jpg', '.jpeg', '.png', '.svg', '.webp'];
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (LOGO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Allowed logo formats: JPEG, PNG, SVG, WebP.'));
  },
});

router.post('/logo', (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Logo too large. Maximum size is 2 MB.' });
      }
      return res.status(400).json({ error: err.message || 'Logo upload rejected.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No logo file provided.' });

    const { writeFile: wf } = await import('fs/promises');
    const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
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
      if (err.message) {
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
      result = await processImage(req.file.buffer, req.file.mimetype);
    } else if (type === 'gif') {
      result = await processGif(req.file.buffer);
    } else if (type === 'video') {
      result = await processVideo(req.file.buffer, req.file.mimetype);
    } else {
      return res.status(400).json({ error: `Unsupported file type: ${req.file.mimetype}. Use JPEG, PNG, WebP, GIF, MP4, or WebM.` });
    }
    res.status(201).json(result);
  } catch (err) {
    console.error('[api] POST /upload error:', err.message, err.stack);
    const msg = 'Image processing failed. The file may be corrupted or in an unsupported format.';
    res.status(500).json({ error: msg });
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

const GOOGLE_ALBUM_FIELDS = ['url', 'displayMode', 'photoInterval', 'photoOrder', 'refreshInterval', 'kenBurns', 'imageDisplayMode', 'enabled'];

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
    if (!url.includes('photos.google.com/share/') && !url.includes('photos.app.goo.gl/')) {
      return res.status(400).json({ error: 'Invalid Google Photos shared album URL.' });
    }

    const albums = (await readJSON('google-albums.json')) ?? [];
    const albumId = extractAlbumId(url);

    // Check if this album is already configured
    const existing = albums.find(a => extractAlbumId(a.url) === albumId);
    if (existing) {
      return res.status(409).json({ error: 'This album is already connected.', id: existing.id });
    }

    const newAlbum = {
      id: uuidv4(),
      ...pick(req.body, GOOGLE_ALBUM_FIELDS),
      url,
      albumId,
      createdAt: new Date().toISOString(),
      enabled: true,
    };

    albums.push(newAlbum);
    await writeJSON('google-albums.json', albums);

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
    const albums = (await readJSON('google-albums.json')) ?? [];
    const idx = albums.findIndex(a => a.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Album not found.' });
    }
    albums[idx] = { ...albums[idx], ...pick(req.body, GOOGLE_ALBUM_FIELDS), id: req.params.id };
    await writeJSON('google-albums.json', albums);

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
    let albums = (await readJSON('google-albums.json')) ?? [];
    const album = albums.find(a => a.id === req.params.id);
    if (!album) {
      return res.status(404).json({ error: 'Album not found.' });
    }

    // Delete cached photos
    await deleteAlbumCache(album.url);

    albums = albums.filter(a => a.id !== req.params.id);
    await writeJSON('google-albums.json', albums);
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
      return res.status(400).json({ error: err.message || 'Font upload rejected.' });
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

    // Derive a display name from the original filename (strip extension)
    const name = req.body?.name
      || path.basename(req.file.originalname, ext).replace(/[-_]+/g, ' ').trim()
      || 'Custom Font';

    // Write font file to disk
    const { writeFile } = await import('fs/promises');
    await writeFile(path.join(FONTS_DIR, filename), req.file.buffer);

    // Update fonts.json
    const fonts = (await readJSON('fonts.json')) ?? [];
    const entry = { id, name, filename, format };
    fonts.push(entry);
    await writeJSON('fonts.json', fonts);
    broadcast('fonts-update', fonts);

    res.status(201).json(entry);
  } catch (err) {
    console.error('[api] POST /fonts error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to save font file.' });
  }
});

router.delete('/fonts/:id', async (req, res) => {
  try {
    let fonts = (await readJSON('fonts.json')) ?? [];
    const font = fonts.find(f => f.id === req.params.id);
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

    fonts = fonts.filter(f => f.id !== req.params.id);
    await writeJSON('fonts.json', fonts);
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
    try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format.' }); }

    const result = await fetchRSSFeed(url.trim());
    res.json(result);
  } catch (err) {
    console.error('[api] POST /rss/preview error:', err.message);
    res.status(502).json({ error: `Failed to fetch feed: ${err.message}` });
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
    const allowedMappingKeys = ['primary', 'secondary', 'body', 'attribution'];
    const safeMapping = {};
    if (mapping && typeof mapping === 'object') {
      for (const key of allowedMappingKeys) {
        if (mapping[key] && RSS_FIELDS.includes(mapping[key])) {
          safeMapping[key] = mapping[key];
        }
      }
    }

    const feeds = (await readJSON('rss-feeds.json')) ?? [];
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

    feeds.push(newFeed);
    await writeJSON('rss-feeds.json', feeds);

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
    const feeds = (await readJSON('rss-feeds.json')) ?? [];
    const idx = feeds.findIndex(f => f.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Feed not found.' });
    }

    const updates = pick(req.body, RSS_FEED_FIELDS);
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

    feeds[idx] = { ...feeds[idx], ...updates, id: req.params.id };
    await writeJSON('rss-feeds.json', feeds);

    stopRSSTimer(req.params.id);
    startRSSScheduler(feeds[idx]);

    broadcast('rss-feeds-update', feeds);
    res.json(feeds[idx]);
  } catch (err) {
    console.error('[api] PUT /rss/feeds error:', err.message);
    res.status(500).json({ error: 'Failed to update RSS feed.' });
  }
});

router.delete('/rss/feeds/:id', async (req, res) => {
  try {
    let feeds = (await readJSON('rss-feeds.json')) ?? [];
    const feed = feeds.find(f => f.id === req.params.id);
    if (!feed) {
      return res.status(404).json({ error: 'Feed not found.' });
    }

    stopRSSTimer(req.params.id);
    feeds = feeds.filter(f => f.id !== req.params.id);
    await writeJSON('rss-feeds.json', feeds);

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

    const [settings, slides, messages, pinned, customDays, googleAlbums, schedule, rssFeeds, currentCache] = await Promise.all([
      readJSON('settings.json'),
      readJSON('slides.json'),
      readJSON('messages.json'),
      readJSON('pinned.json'),
      readJSON('custom-days.json'),
      readJSON('google-albums.json'),
      readJSON('schedule.json'),
      readJSON('rss-feeds.json'),
      readJSON('cache.json'),
    ]);

    // Fetch date-sensitive data for the override date
    const { fetchHebrewDate, fetchParsha } = await import('../../fetchers/hebcal.js');
    const { fetchZmanim, fetchHayomYom, fetchTanyaExcerpt,
            fetchChumashForDate, fetchTehillimForDate } = await import('../../fetchers/chabad.js');
    const { fetchTorahCalc } = await import('../../fetchers/torahcalc.js');

    const locationId = settings?.location?.locationId;
    const zip        = settings?.location?.zip;
    const dateObj    = new Date(dateStr + 'T12:00:00');

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
      fetchHebrewDate(dateObj),
      locationId ? fetchZmanim(locationId, dateStr) : Promise.resolve(null),
      fetchHayomYom(dateObj),
      fetchTanyaExcerpt(dateObj),
      fetchChumashForDate(dateObj),
      fetchTehillimForDate(dateObj),
      fetchTorahCalc(dateObj),
      zip ? fetchParsha(zip, dateObj) : Promise.resolve(null),
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

    res.json({
      cache: previewCache,
      settings: settings ?? {},
      slides: slides ?? [],
      messages: messages ?? [],
      pinned: pinned ?? [],
      customDays: customDays ?? [],
      googleAlbums: googleAlbums ?? [],
      schedule: schedule ?? { entries: [], categories: [] },
      rssFeeds: rssFeeds ?? [],
      _previewDate: dateStr,
    });
  } catch (err) {
    console.error('[api] GET /preview-state error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to build preview state.' });
  }
});

export default router;
