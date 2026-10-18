import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupCheck, requireAuth, localhostOnly, localhostOrAuth, csrfProtection } from './middleware.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import screenRouter from './routes/screen.js';
import scheduleDatesRouter from './routes/schedule-dates.js';
import { ensureDefaultCategories, ensureCategoryDefaultAlerts, readScheduleDates } from './scheduleStore.js';
import announcementsRouter from './routes/announcements.js';
import dailyWordsRouter, { readDailyWords, startDailyWordRecorder } from './routes/daily-words.js';
import { forKiosk } from '../shared/dailyWords.js';
import embedProbeRouter from './routes/embed-probe.js';
import { ensureMigrated, getStateExtras } from './announcements-store.js';
import { initScheduler, setupTrackA, setupTrackB, setupTrackC } from './scheduler.js';
import { fetchAll, fetchZmanimOnly } from '../fetchers/index.js';
import { readJSON } from './storage.js';
import { getScreenState, setScreenState } from './screenState.js';
import { initGooglePhotosSync } from './google-photos.js';
import { initCountdowns, scheduleMidnightReset, getActiveCountdown } from './countdown.js';
import { scheduleCleanup } from './cleanup.js';
import { initRSSSchedulers } from './rss-scheduler.js';
import { startMivtzahScheduler } from './mivtzah-scheduler.js';
import { migrateSettingsKeys } from './settings-migrate.js';
import { ensureBuiltinSlides } from './builtin-slides.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

/**
 * Create and configure the Express application.
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // Fold legacy messages/pinned/custom text slides into announcements.json
  // (idempotent, backs up originals to data/legacy/). Readers await it.
  ensureMigrated();

  // Initialize scheduler with fetch functions
  initScheduler({ fetchZmanimOnly, fetchAll });

  // Start scheduler after a short delay (allow server to be ready)
  setTimeout(async () => {
    try {
      // Fold stray top-level zipCode/chabadLocationId/trackA/trackBTime
      // (written by older admin builds) into settings.location/.scheduler
      // before anything reads them. Idempotent. See GOTCHAS.md.
      let settings;
      try {
        settings = await migrateSettingsKeys();
      } catch (migErr) {
        console.error('[settings] Key migration failed:', migErr.message);
        settings = await readJSON('settings.json');
      }
      const config = settings?.location ?? {};

      // New built-in slide types (e.g. WEATHER) for installs whose
      // slides.json predates them (update.sh keeps the Pi's data/). Idempotent.
      try {
        await ensureBuiltinSlides();
        startDailyWordRecorder();
      } catch (bsErr) {
        console.error('[slides] Built-in slide check failed:', bsErr.message);
      }

      if (settings?.location) {
        if (settings.scheduler?.trackA !== false) {
          await setupTrackA(config);
          console.log('[scheduler] Track A started');
        }
        if (settings.scheduler?.trackBTime) {
          setupTrackB(config, settings.scheduler.trackBTime);
          console.log(`[scheduler] Track B started at ${settings.scheduler.trackBTime}`);
        }
      }

      // Track C: rolling 30-minute full refresh
      setupTrackC(config);
      console.log('[scheduler] Track C started (30-min interval)');

      // Startup fetch: refresh all data immediately on every server start
      try {
        console.log('[scheduler] Running startup data fetch...');
        await fetchAll(config);
        console.log('[scheduler] Startup data fetch complete');
      } catch (startupErr) {
        console.error('[scheduler] Startup fetch error:', startupErr.message);
      }
      // Initialize Google Photos sync timers
      try {
        const albums = await readJSON('google-albums.json');
        if (albums && albums.length > 0) {
          await initGooglePhotosSync(albums);
          console.log(`[google-photos] Initialized sync for ${albums.length} album(s)`);
        }
      } catch (gpErr) {
        console.error('[google-photos] Startup error:', gpErr.message);
      }
      // Owner's default schedule categories (added once, never removed)
      try {
        const added = await ensureDefaultCategories();
        if (added.length) console.log(`[schedule] Added default categories: ${added.map(c => c.name).join(', ')}`);
      } catch (catErr) {
        console.error('[schedule] Default categories error:', catErr.message);
      }
      // 5-minute default reminder on learning/davening categories (once, keeps owner values)
      try {
        const upd = await ensureCategoryDefaultAlerts();
        if (upd.length) console.log(`[schedule] Default 5-minute alert set on: ${upd.join(', ')}`);
      } catch (alErr) {
        console.error('[schedule] Default alerts error:', alErr.message);
      }
      // Initialize countdown alert system
      try {
        await initCountdowns();
        scheduleMidnightReset();
        console.log('[countdown] Alert system initialized');
      } catch (cdErr) {
        console.error('[countdown] Startup error:', cdErr.message);
      }
      // Initialize RSS feed schedulers
      try {
        await initRSSSchedulers();
      } catch (rssErr) {
        console.error('[rss] Startup error:', rssErr.message);
      }
      // Initialize Mivtzah leaderboard scheduler
      try {
        startMivtzahScheduler();
      } catch (mivtzahErr) {
        console.error('[mivtzah] Startup error:', mivtzahErr.message);
      }
      // Schedule storage cleanup (runs after 30s, then daily)
      scheduleCleanup();
    } catch (err) {
      console.error('[scheduler] Startup error:', err.message);
    }
  }, 2000);

  // ── 0. Trust proxy (if configured) ───────────────────────────────────
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  // ── 0b. Security headers ───────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // ── 0c. Never let an intermediary (Cloudflare Tunnel, browser bfcache) cache
  // auth-sensitive responses — a cached /login or /admin response served back
  // to a different request would look exactly like getting logged out.
  app.use(['/login', '/admin', '/api'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ── 1. Body parsing ──────────────────────────────────────────────────
  // /api/schedule/dates* and /blocks* parse their own bodies (256 kB — a
  // pasted multi-week schedule is bigger than 16 kB); see routes/schedule-dates.js.
  // /api/daily-words does too (512 kB): the whole word list is saved at once and
  // is ~20 kB, so the 16 kB cap here made every edit fail with "request entity
  // too large"; see routes/daily-words.js.
  const smallJson = express.json({ limit: '16kb' });
  app.use((req, res, next) => (
    /^\/api\/(schedule\/(dates|blocks)|daily-words)(\/|$)/.test(req.path) ? next() : smallJson(req, res, next)
  ));

  // ── 2. Cookie parsing ────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 3. Setup check (reject requests if setup.js hasn't been run) ───
  app.use(setupCheck);

  // ── 4. Rate limiter on POST /login and the TOTP verification steps ──
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // 5 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });
  app.post('/login', loginLimiter);
  app.post('/login/totp', loginLimiter);
  app.post('/login/totp-setup', loginLimiter);

  // ── 5. Auth routes (GET/POST /login, POST /logout) — before requireAuth ─
  app.use(authRouter);

  // ── 6. Guard on kiosk routes — kiosk (localhost) or a logged-in admin ─
  app.use('/screen', localhostOrAuth);
  app.use('/stream', localhostOrAuth);

  // ── 6b. SSE stream route (before static serving) ────────────────────
  app.use('/stream', screenRouter);

  // ── 6c. State endpoint — kiosk (localhost, no login) or a logged-in admin ─
  // csrfProtection is included here NOT to validate (GET is exempt) but so the
  // _csrf cookie gets issued on the admin SPA's initial data load. Without it,
  // the first mutating request after opening the admin panel always failed
  // with 403 "CSRF validation failed" (the cookie was only issued by that
  // failing response), and the change appeared to silently revert.
  app.get('/api/state', localhostOrAuth, csrfProtection, async (_req, res) => {
    try {
      const [cache, settings, slides, announcementState, customDays, googleAlbums, schedule, rssFeeds, fonts, scheduleDates, dailyWords] = await Promise.all([
        readJSON('cache.json'),
        readJSON('settings.json'),
        readJSON('slides.json'),
        getStateExtras(), // { announcements, messages, pinned } (legacy views for old builds)
        readJSON('custom-days.json'),
        readJSON('google-albums.json'),
        readJSON('schedule.json'),
        readJSON('rss-feeds.json'),
        readJSON('fonts.json'),
        readScheduleDates(),
        readDailyWords(),
      ]);
      res.json({
        cache: cache ?? {},
        settings: settings ?? {},
        slides: slides ?? [],
        ...announcementState,
        customDays: customDays ?? [],
        googleAlbums: googleAlbums ?? [],
        schedule: schedule ?? { entries: [], categories: [] },
        rssFeeds: rssFeeds ?? [],
        fonts: fonts ?? [],
        // Per-date schedule overrides (schedule-dates.json). Must be here or
        // the kiosk's state refetch would drop SSE schedule-dates-update data.
        scheduleDates: scheduleDates ?? {},
        // Daily Word list ({ order, words }); the kiosk picks today's word from it.
        dailyWords: forKiosk(dailyWords),
        // Running schedule countdown alert (or null), so a kiosk that
        // reconnects/reloads mid-countdown still shows it. Not persisted.
        countdown: getActiveCountdown(),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to read state' });
    }
  });

  // ── 6d. Localhost-only Google Photos endpoints (kiosk needs photo data without auth) ─
  app.get('/api/google-album/:id/photos', localhostOnly, async (req, res) => {
    try {
      const { getAlbumPhotos } = await import('./google-photos.js');
      const albums = (await readJSON('google-albums.json')) ?? [];
      const album = albums.find(a => a.id === req.params.id);
      if (!album) return res.status(404).json({ error: 'Album not found.' });
      const photos = await getAlbumPhotos(album.url);
      res.json(photos);
    } catch (err) {
      res.status(500).json({ error: 'Failed to get photos' });
    }
  });

  // ── 6e. Localhost-only RSS cache endpoint (kiosk needs RSS data without auth) ─
  app.get('/api/rss/cache/:feedId', localhostOnly, async (req, res) => {
    try {
      const { readFile: rf } = await import('fs/promises');
      const filePath = path.join(PROJECT_ROOT, 'data', 'rss-cache', `${req.params.feedId}.json`);
      const raw = await rf(filePath, 'utf-8');
      res.json(JSON.parse(raw));
    } catch (err) {
      if (err.code === 'ENOENT') return res.json({ items: [] });
      res.status(500).json({ error: 'Failed to read RSS cache' });
    }
  });

  // ── 6f. Localhost-only screen state endpoints (kiosk reports slide changes; preview reads on connect) ─
  app.post('/api/screen/report', localhostOnly, (req, res) => {
    const { slideIndex, slideId, isPaused } = req.body || {};
    setScreenState({ slideIndex, slideId, isPaused });
    res.json({ success: true });
  });

  app.get('/api/screen/state', localhostOnly, (_req, res) => {
    res.json(getScreenState());
  });

  // ── 7. Static files & SPA serving ────────────────────────────────────
  const hasDist = fs.existsSync(DIST_DIR);

  if (hasDist) {
    // Serve built assets
    app.use('/assets', express.static(path.join(DIST_DIR, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Serve files Vite copied from public/ (e.g. grain.png) at the dist
    // root. Registered after the more specific mounts above/below so it
    // only catches requests nothing else claims first.
    app.use(express.static(DIST_DIR, { maxAge: '7d' }));

    // Serve uploaded fonts
    app.use('/fonts', express.static(path.join(PROJECT_ROOT, 'data/fonts'), {
      maxAge: '30d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }));

    // Serve uploaded images with safe content-type restrictions
    app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'data/uploads'), {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
      },
    }));

    // Serve Google Photos cached images
    app.use('/google-photos', express.static(path.join(PROJECT_ROOT, 'data/google-photos'), {
      maxAge: '1d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
      },
    }));

    // Kiosk screen SPA (also handles /error page — same SPA, pathname detected client-side)
    app.get('/screen', (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'src/screen/index.html'));
    });
    app.get('/error', (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'src/screen/index.html'));
    });

    // Admin SPA (behind auth, mounted below)
    // /admin and /admin/<section> (e.g. /admin/daily-word): one SPA, the section comes from the URL.
    app.get(['/admin', /^\/admin\/[a-z0-9-]+\/?$/], requireAuth, csrfProtection, (_req, res) => {
      res.sendFile(path.join(DIST_DIR, 'src/admin/index.html'));
    });
  } else {
    // Serve uploaded fonts (dev mode)
    app.use('/fonts', express.static(path.join(PROJECT_ROOT, 'data/fonts'), {
      maxAge: '30d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Access-Control-Allow-Origin', '*');
      },
    }));

    // Serve uploaded images (dev mode) with safe content-type restrictions
    app.use('/uploads', express.static(path.join(PROJECT_ROOT, 'data/uploads'), {
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'");
      },
    }));

    // Serve Google Photos cached images (dev mode)
    app.use('/google-photos', express.static(path.join(PROJECT_ROOT, 'data/google-photos'), {
      maxAge: '1d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
      },
    }));

    // Development — no built files
    const devMsg = 'Run `npm run build` first, or use the Vite dev server on port 5173.';

    app.get('/screen', (_req, res) => {
      res.status(503).json({ error: devMsg });
    });

    app.get(['/admin', /^\/admin\/[a-z0-9-]+\/?$/], (_req, res) => {
      res.status(503).json({ error: devMsg });
    });
  }

  // ── 8. Auth + CSRF on /admin and /api/* ──────────────────────────────
  const apiMutationLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,                  // 60 mutating requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { error: 'Too many requests. Please slow down.' },
  });
  app.use('/api', requireAuth, csrfProtection, apiMutationLimiter);

  // ── 9. API routes ────────────────────────────────────────────────────
  // Announcements first: it also answers the legacy /messages, /pinned and
  // custom-slide shapes (translated) before routes/api.js sees them.
  app.use('/api', announcementsRouter);
  app.use('/api', dailyWordsRouter);
  app.use('/api', embedProbeRouter);
  app.use('/api/schedule', scheduleDatesRouter); // schedule by date (own 256 kB body limit)
  app.use('/api', apiRouter);

  // ── 10. 404 handler ──────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── 11. Global error handler — catch unhandled errors ──────────────
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[server] Unhandled error:', err.message, err.stack);

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 50 MB.' });
    }

    // JSON parse error from express.json()
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request data. Check the format and try again.' });
    }

    res.status(err.status || 500).json({
      error: err.expose ? err.message : 'An unexpected error occurred. Please try again.',
    });
  });

  return app;
}
