import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupCheck, requireAuth, localhostOnly, csrfProtection } from './middleware.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import screenRouter from './routes/screen.js';
import { initScheduler, setupTrackA, setupTrackB, setupTrackC } from './scheduler.js';
import { fetchAll, fetchZmanimOnly } from '../fetchers/index.js';
import { readJSON } from './storage.js';
import { getScreenState, setScreenState } from './screenState.js';
import { initGooglePhotosSync } from './google-photos.js';
import { initCountdowns, scheduleMidnightReset } from './countdown.js';
import { scheduleCleanup } from './cleanup.js';
import { initRSSSchedulers } from './rss-scheduler.js';
import { startMivtzahScheduler } from './mivtzah-scheduler.js';

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

  // Initialize scheduler with fetch functions
  initScheduler({ fetchZmanimOnly, fetchAll });

  // Start scheduler after a short delay (allow server to be ready)
  setTimeout(async () => {
    try {
      const settings = await readJSON('settings.json');
      const config = settings?.location ?? {};

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

  // ── 1. Body parsing ──────────────────────────────────────────────────
  app.use(express.json({ limit: '16kb' }));

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

  // ── 6. Localhost-only guard on kiosk routes ──────────────────────────
  app.use('/screen', localhostOnly);
  app.use('/stream', localhostOnly);

  // ── 6b. SSE stream route (before static serving) ────────────────────
  app.use('/stream', screenRouter);

  // ── 6c. Localhost-only state endpoint (kiosk needs data without auth) ─
  app.get('/api/state', localhostOnly, async (_req, res) => {
    try {
      const [cache, settings, slides, messages, pinned, customDays, googleAlbums, schedule, rssFeeds] = await Promise.all([
        readJSON('cache.json'),
        readJSON('settings.json'),
        readJSON('slides.json'),
        readJSON('messages.json'),
        readJSON('pinned.json'),
        readJSON('custom-days.json'),
        readJSON('google-albums.json'),
        readJSON('schedule.json'),
        readJSON('rss-feeds.json'),
      ]);
      res.json({
        cache: cache ?? {},
        settings: settings ?? {},
        slides: slides ?? [],
        messages: messages ?? [],
        pinned: pinned ?? [],
        customDays: customDays ?? [],
        googleAlbums: googleAlbums ?? [],
        schedule: schedule ?? { entries: [], categories: [] },
        rssFeeds: rssFeeds ?? [],
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
    app.get('/admin', requireAuth, csrfProtection, (_req, res) => {
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

    app.get('/admin', (_req, res) => {
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
