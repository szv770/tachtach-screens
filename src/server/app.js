import 'dotenv/config';
import express from 'express';
import './asyncErrors.js';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { TRUST_PROXY_SETTING, normalizeIp } from './clientIp.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { setupCheck, requireAuth, enforceRole, logActivity, localhostOnly, localhostOrAuth, csrfProtection } from './middleware.js';
import teamRouter from './routes/team.js';
import systemUpdateRouter from './routes/systemUpdate.js';
import { createDataPackRouter } from './routes/dataPack.js';
import { refreshAfterPack } from './packRefresh.js';
import pushRouter from './routes/push.js';
import statusRouter from './routes/status.js';
import historyRouter from './routes/history.js';
import { startPushMonitor, sendPush } from './push.js';
import { startUpdateMonitor } from './systemUpdate.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import screenRouter from './routes/screen.js';
import { liveRouter, liveAdminRouter, stateGate, kioskGate, viewerState, getTouchFlags, viewerStateLimiter, viewerStreamLimiter } from './live.js';
import { homePage, HOME_CSP } from './homePage.js';
import { cspMiddleware } from './csp.js';
import { publicErrorMessage } from './safeError.js';
import scheduleDatesRouter from './routes/schedule-dates.js';
import { ensureDefaultCategories, ensureCategoryDefaultAlerts, ensureCategoryKinds, readScheduleDates } from './scheduleStore.js';
import announcementsRouter from './routes/announcements.js';
import quickTemplatesRouter from './routes/quick-templates.js';
import savedLettersRouter from './routes/saved-letters.js';
import { kiddushLevanaRouter, startKiddushLevana, readShown as readKlShown } from './kiddush-levana.js';
import freezeRouter from './routes/freeze.js';
import freeze from './freeze.js';
import dailyWordsRouter, { readDailyWords, startDailyWordRecorder } from './routes/daily-words.js';
import { forKiosk } from '../shared/dailyWords.js';
import dailyStoriesRouter, { readDailyStories, startDailyStoryRecorder } from './routes/daily-stories.js';
import { forKiosk as storiesForKiosk } from '../shared/dailyStories.js';
import rosterRouter, { readRoster } from './routes/roster.js';
import chazanRouter from './routes/chazan.js';
import { readForKiosk as readChazanForKiosk } from './chazanStore.js';
import { forKiosk as rosterForKiosk } from '../shared/roster.js';
import embedProbeRouter from './routes/embed-probe.js';
import { ensureMigrated, getStateExtras } from './announcements-store.js';
import { initScheduler, setupTrackA, setupTrackB, setupTrackC } from './scheduler.js';
import { fetchAll, fetchZmanimOnly } from '../fetchers/index.js';
import { readJSON } from './storage.js';
import { broadcastToPreview } from './sse.js';
import { getScreenState, setScreenState, getScreenDisplay, followPayload } from './screenState.js';
import { initGooglePhotosSync } from './google-photos.js';
import { initCountdowns, scheduleMidnightReset, getActiveCountdown } from './countdown.js';
import { scheduleCleanup } from './cleanup.js';
import { initRSSSchedulers } from './rss-scheduler.js';
import { startMivtzahScheduler } from './mivtzah-scheduler.js';
import { migrateSettingsKeys } from './settings-migrate.js';
import { ensureBuiltinSlides } from './builtin-slides.js';
import { isWindowsReservedName } from './platform.js';

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
        startDailyStoryRecorder();
        await freeze.init(); // re-arms a freeze that survived a restart
        startKiddushLevana();
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
      // Category kinds (Seder / Davening / Break / Meal / Other): fills only a missing kind
      try {
        const k = await ensureCategoryKinds();
        if (k.length) console.log(`[schedule] Category kind filled on: ${k.join(', ')}`);
      } catch (kErr) {
        console.error('[schedule] Category kinds error:', kErr.message);
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
      // Phone alerts: screen offline / zmanim stale (src/server/push.js)
      try {
        await startPushMonitor();
      } catch (pushErr) {
        console.error('[push] Startup error:', pushErr.message);
      }
      // Phone alert when a software update (asked for from the admin) finishes
      try {
        await startUpdateMonitor({ send: (m) => sendPush(m) });
      } catch (updErr) {
        console.error('[update] Startup error:', updErr.message);
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
    // Only the loopback hop (cloudflared) may supply X-Forwarded-For; LAN peers' headers are ignored (audit N2).
    app.set('trust proxy', TRUST_PROXY_SETTING);
  }

  app.disable('x-powered-by');

  // ── 0b. Security headers ───────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (_req.headers['x-forwarded-proto'] === 'https' || _req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cspMiddleware); // Content-Security-Policy for /admin, /screen, /login, /invite, /signin

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
  // /api/slides (the whole rotation is saved at once: 45+ slides passed 16 kB) and /api/announcements (letters up to 12,000 characters) get 256 kB parsers on their own routes.
  // The weekly schedule, its entries, categories and saved templates are big too (a 3-group yeshiva day is ~90 blocks > 16 kB: "That request is too large"); they get 256 kB parsers (routes/schedule-dates.js, routes/api.js).
  // /api/daily-words does too (256 kB, the client no longer sends the archive): the whole word list is saved at once and
  // is ~20 kB, so the 16 kB cap here made every edit fail with "request entity
  // too large"; see routes/daily-words.js.
  const smallJson = express.json({ limit: '16kb' });
  app.use((req, res, next) => (
    /^\/api\/(schedule\/(dates|blocks|weekly|entries|templates?|categories)|daily-words|daily-stories|roster|chazan|saved-letters|slides|announcements)(\/|$)/.test(req.path) ? next() : smallJson(req, res, next)
  ));

  // ── 2. Cookie parsing ────────────────────────────────────────────────
  app.use(cookieParser());

  // ── 3. Setup check (reject requests if setup.js hasn't been run) ───
  app.use(setupCheck);

  // ── 4. Rate limiter on POST /login and the TOTP verification steps ──
  const limiterKey = (req) => normalizeIp(req.ip);
  const loginLimiter = rateLimit({
    keyGenerator: limiterKey,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 40,                   // per IP: a whole school can share one address; real brute-force limits are in routes/auth.js
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  });
  app.post('/login', loginLimiter);
  app.post('/login/totp', loginLimiter);
  app.post('/login/totp-setup', loginLimiter);
  app.post('/invite/:token', loginLimiter);
  app.post('/signin/:token', loginLimiter);

  // ── 5. Auth routes (GET/POST /login, POST /logout) — before requireAuth ─
  app.use(authRouter);

  // ── 6. Guard on kiosk routes — kiosk (localhost) or a logged-in admin ─
  app.use('/screen', localhostOrAuth);
  app.use('/stream', stateGate); // kiosk, a logged-in admin, or a live-view watcher (src/server/live.js)
  app.use('/stream', viewerStreamLimiter); // viewers only: reconnect storms / stream floods
  app.use(liveRouter); // public /live (type the word) and /live/:word (read-only copy of the screen)

  // ── 6b. SSE stream route (before static serving) ────────────────────
  app.use('/stream', screenRouter);

  // ── 6c. State endpoint — kiosk (localhost, no login) or a logged-in admin ─
  // csrfProtection is included here NOT to validate (GET is exempt) but so the
  // _csrf cookie gets issued on the admin SPA's initial data load. Without it,
  // the first mutating request after opening the admin panel always failed
  // with 403 "CSRF validation failed" (the cookie was only issued by that
  // failing response), and the change appeared to silently revert.
  app.get('/api/state', stateGate, viewerStateLimiter, csrfProtection, async (req, res) => {
    try {
      const [cache, settings, slides, announcementState, customDays, googleAlbums, schedule, rssFeeds, fonts, scheduleDates, dailyWords, roster, chazan, dailyStories] = await Promise.all([
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
        readRoster(),
        readChazanForKiosk(),
        readDailyStories(),
      ]);
      const body = {
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
        // Daily Story list ({ order, stories }); the kiosk picks today's story from it.
        dailyStories: storiesForKiosk(dailyStories),
        // The roster (bochurim + birthday settings); the kiosk works out who has a birthday today.
        roster: rosterForKiosk(roster),
        // The chazan rotation (rules + names + computed days); the kiosk runs the same pure engine on it.
        chazan,
        // Running schedule countdown alert (or null), so a kiosk that
        // reconnects/reloads mid-countdown still shows it. Not persisted.
        countdown: getActiveCountdown(),
        // Real size of the kiosk (reported over the localhost-only /api/screen/report), or null
        // until a screen has reported. The admin's Media page turns it into "best size".
        screenDisplay: getScreenDisplay(),
        // Freeze / Blank screen: { active: null | { mode, message, style, until, source }, emergency }.
        freeze: freeze.getKioskView(),
        // Touch switches (admin > Health > Live link): the TV can ignore touch, live viewers can swipe/tap their own copy.
        touch: await getTouchFlags(),
      };
      res.json(req.liveViewer ? viewerState(body) : body); // live viewers get the allow-listed copy (src/server/live.js)
    } catch (err) {
      res.status(500).json({ error: 'Failed to read state' });
    }
  });

  // Kiosk: which one-time Kiddush Levana takeovers were already shown (so a refresh never repeats them).
  app.get('/api/kiddush-levana/shown', stateGate, async (_req, res) => {
    try { res.json(await readKlShown()); } catch { res.json({}); }
  });

  // ── 6d. Localhost-only Google Photos endpoints (kiosk needs photo data without auth) ─
  app.get('/api/google-album/:id/photos', kioskGate, async (req, res) => {
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
  app.get('/api/rss/cache/:feedId', kioskGate, async (req, res) => {
    try {
      const { readFile: rf } = await import('fs/promises');
      // Feed ids are plain tokens; anything with a dot or slash (..%2Fusers) is refused.
      // CON/NUL/COM1... are devices on Windows (docs/windows/AUDIT.md A15); real ids are never those.
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(req.params.feedId)) || isWindowsReservedName(req.params.feedId)) return res.status(400).json({ error: 'Bad feed id.' });
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
    const { slideIndex, slideId, isPaused, display, durationMs, slides, held, heldBy, overlay, elapsedMs } = req.body || {};
    setScreenState({ slideIndex, slideId, isPaused, display, durationMs, slides, held, heldBy, overlay, elapsedMs });
    // A slide report (not a display-size one) is what the admin Live Preview follows.
    if (typeof slideIndex === 'number' || slideId !== undefined) broadcastToPreview('screen-slide', followPayload());
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

    // The service worker script must never sit behind a long cache — the
    // browser's own update check is what notices a new version, and a stale
    // cached copy would silently block that for days.
    app.get('/sw.js', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST_DIR, 'sw.js'));
    });

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
    keyGenerator: limiterKey,
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60,                  // 60 mutating requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    message: { error: 'Too many requests. Please slow down.' },
  });
  app.use('/api', requireAuth, csrfProtection, apiMutationLimiter, enforceRole, logActivity);

  // ── 9. API routes ────────────────────────────────────────────────────
  // Announcements first: it also answers the legacy /messages, /pinned and
  // custom-slide shapes (translated) before routes/api.js sees them.
  app.use('/api/system/live', liveAdminRouter); // admin-only (the /api/system area): public live view on/off + its word
  app.use('/api/system/data-pack', createDataPackRouter({ afterInstall: refreshAfterPack })); // admin-only: the offline data pack (upload / build on this Pi / status)
  app.use('/api', teamRouter);
  app.use('/api', systemUpdateRouter); // admin-only software update (writes one request file; a root unit does the work)
  app.use('/api', pushRouter);
  app.use('/api', statusRouter); // /screen/status + /health (read-only)
  app.use('/api', historyRouter); // /history + undo
  app.use('/api', announcementsRouter);
  app.use('/api', quickTemplatesRouter);
  app.use('/api', savedLettersRouter);
  app.use('/api', kiddushLevanaRouter);
  app.use('/api', freezeRouter);
  app.use('/api', dailyWordsRouter);
  app.use('/api', dailyStoriesRouter);
  app.use('/api', rosterRouter);
  app.use('/api', chazanRouter);
  app.use('/api', embedProbeRouter);
  app.use('/api/schedule', scheduleDatesRouter); // schedule by date (own 256 kB body limit)
  app.use('/api', apiRouter);

  // ── 9b. Public homepage: what a visitor sees at the bare address (static text, sign-in + live links only)
  app.get('/', (_req, res) => {
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': HOME_CSP, 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' }).send(homePage());
  });

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

    // Never echo err.message (can carry paths / internals): fixed text per status.
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: publicErrorMessage(status) });
  });

  return app;
}
