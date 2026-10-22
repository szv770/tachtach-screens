import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { readJSON, writeJSON } from './storage.js';
import { userForRequest, localhostOrAuth, localhostOnly } from './middleware.js';
import { normalizeIp } from './clientIp.js';
import { getViewerClientCount } from './sse.js';
import { buildCsp } from './csp.js';

/**
 * Live view: a read-only copy of the screen for anyone holding the "live word"
 * (https://host/live/<word>, or type the word at https://host/live).
 *
 * Fail closed:
 *  - Off by default. While off, /live/<word> is the same 404 as a wrong word.
 *  - Holding the word sets an httpOnly cookie (HMAC of the word under a server secret in
 *    data/live.json); only that cookie opens the viewer GET allow-list wired in app.js
 *    (/stream, /api/state, kiddush shown, google-album photos, rss cache). Never a write route.
 *  - /api/state for viewers is the screen's own state minus token/secret-looking keys (birthday names ARE shown, by owner choice).
 *  - Changing the word or switching off kills every viewer's cookie at once.
 *  - Wrong words are rate-limited per IP; the word is compared in constant time.
 * Admin config: GET/PUT /api/system/live, POST /api/system/live/new-word (admins only: /api/system).
 */

const FILE = 'live.json';
const COOKIE = 'tt_live';
const COOKIE_MAX_AGE = 7 * 24 * 3600 * 1000;
const WORD_RE = /^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$/;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_SCREEN = path.resolve(__dirname, '../../dist/src/screen/index.html');

const ADJ = ['blue', 'green', 'golden', 'bright', 'quiet', 'happy', 'sunny', 'calm', 'brave', 'swift', 'warm', 'royal'];
const NOUN = ['maple', 'river', 'garden', 'candle', 'harbor', 'meadow', 'orchard', 'falcon', 'lantern', 'valley', 'willow', 'anchor'];
const pick = (a) => a[crypto.randomInt(a.length)];
export const randomWord = () => `${pick(ADJ)}-${pick(NOUN)}-${crypto.randomInt(1000, 10000)}`;

export function validateWord(raw) {
  const w = String(raw ?? '').trim().toLowerCase();
  if (w.length < 4 || w.length > 40) return { error: 'The word must be 4 to 40 characters.' };
  if (!WORD_RE.test(w)) return { error: 'Use only letters, numbers and dashes (no spaces).' };
  return { word: w };
}

async function readConfig() {
  const raw = (await readJSON(FILE)) || {};
  const cfg = {
    enabled: raw.enabled === true,
    // Touch: may people poke the main screen (e.g. scroll/tap the Charidy page on the TV), and may live viewers swipe/tap their own copy?
    touchScreen: raw.touchScreen !== false,
    touchLive: raw.touchLive !== false,
    word: typeof raw.word === 'string' ? raw.word : '',
    secret: typeof raw.secret === 'string' && raw.secret.length >= 32 ? raw.secret : '',
  };
  if (!cfg.secret || !cfg.word) {
    cfg.secret = cfg.secret || crypto.randomBytes(32).toString('hex');
    cfg.word = cfg.word || randomWord();
    await writeJSON(FILE, cfg);
  }
  return cfg;
}
const saveConfig = (cfg) => writeJSON(FILE, cfg);
const view = (cfg) => ({ enabled: cfg.enabled, word: cfg.word, touchScreen: cfg.touchScreen, touchLive: cfg.touchLive, viewers: getViewerClientCount() });

/** Touch switches as the screen and live viewers see them (part of /api/state as `touch`). */
export async function getTouchFlags() {
  try { const cfg = await readConfig(); return { screen: cfg.touchScreen, live: cfg.touchLive }; } catch { return { screen: true, live: true }; }
}

const tokenFor = (cfg) => crypto.createHmac('sha256', cfg.secret).update(`live:${cfg.word}`).digest('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const wordMatches = (cfg, w) => cfg.enabled && safeEq(cfg.word, String(w || '').trim().toLowerCase());

/** True when the request carries a valid live-view cookie and the live link is on. */
export async function isViewer(req) {
  const c = req.cookies?.[COOKIE];
  if (!c || typeof c !== 'string') return false;
  try { const cfg = await readConfig(); return cfg.enabled && safeEq(tokenFor(cfg), c); } catch { return false; }
}

/** Wrap a kiosk-only guard so a live viewer also passes (the request is tagged req.liveViewer). */
export const orViewer = (guard) => async (req, res, next) => {
  if (await isViewer(req)) { req.liveViewer = true; return next(); }
  return guard(req, res, next);
};
export const stateGate = orViewer(localhostOrAuth);
export const kioskGate = orViewer(localhostOnly);

const SECRETISH = /(token|secret|passw|apikey|api_key|webhook|vapid|private)/i;
function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) if (!SECRETISH.test(k)) out[k] = scrub(val);
    return out;
  }
  return v;
}
/**
 * What a live viewer gets of /api/state: exactly what the real screen gets (owner decision 2026-10-21:
 * the live view is the same as the Pi, birthday names included), minus anything that looks like a credential.
 */
export function viewerState(state) {
  return scrub(state);
}

// ── Pages ────────────────────────────────────────────────────────────────────
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function formPage(note) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Watch the screen</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#12100C;color:#EFE3C0;font-family:Georgia,'Times New Roman',serif;padding:24px}
main{max-width:420px;width:100%;text-align:center}img{width:72px;height:72px;border-radius:18px}h1{font-size:30px;margin:18px 0 8px}p{color:#CDBF9A;line-height:1.5;margin:0 0 22px}
input{width:100%;font-size:22px;padding:14px 16px;border-radius:14px;border:1px solid #6b5d3a;background:#1c1912;color:#EFE3C0;text-align:center}
button{margin-top:14px;width:100%;font-size:20px;font-weight:700;padding:14px;border-radius:14px;border:0;background:#D9B857;color:#1a1608;cursor:pointer}.note{color:#ff9d8a;margin-top:14px}</style></head>
<body><main><img src="/icons/logo-mark.png" alt=""><h1>Watch the screen</h1><p>Type the word you were given to see what is on the screen right now.</p>
<form method="get" action="/live"><input name="w" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="the word" aria-label="the word" autofocus><button type="submit">Watch</button></form>${note ? `<div class="note">${esc(note)}</div>` : ''}</main></body></html>`;
}
function sendFormPage(res, status, note) {
  res.status(status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' }).send(formPage(note));
}
function sendViewer(res) {
  if (!fs.existsSync(DIST_SCREEN)) return res.status(503).type('text').send('Run `npm run build` first.');
  res.set({ 'Content-Security-Policy': buildCsp('screen'), 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
  return res.sendFile(DIST_SCREEN);
}

const wrongWordLimiter = rateLimit({
  keyGenerator: (req) => normalizeIp(req.ip),
  windowMs: 10 * 60 * 1000, max: 20, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => sendFormPage(res, 429, 'Too many tries. Please wait a few minutes.'),
});

/** Public routes: /live (type the word; admins go straight in) and /live/:word. */
export const liveRouter = Router();
liveRouter.get('/live', async (req, res) => {
  if (await userForRequest(req)) return sendViewer(res); // a signed-in admin needs no word
  const w = typeof req.query.w === 'string' ? req.query.w.trim().toLowerCase() : '';
  if (w) return res.redirect(302, `/live/${encodeURIComponent(w)}`);
  return sendFormPage(res, 200);
});
liveRouter.get('/live/:word', wrongWordLimiter, async (req, res) => {
  const cfg = await readConfig();
  if (!wordMatches(cfg, req.params.word)) return sendFormPage(res, 404, 'That word is not right, or the live view is switched off.');
  res.cookie(COOKIE, tokenFor(cfg), { httpOnly: true, sameSite: 'lax', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: COOKIE_MAX_AGE, path: '/' });
  return sendViewer(res);
});

/** Admin API (mounted at /api/system/live, behind requireAuth + enforceRole; /api/system is admin-only). */
export const liveAdminRouter = Router();
liveAdminRouter.get('/', async (_req, res) => res.json(view(await readConfig())));
liveAdminRouter.put('/', async (req, res) => {
  const cfg = await readConfig();
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (body.word !== undefined) {
    const v = validateWord(body.word);
    if (v.error) return res.status(400).json({ error: v.error });
    cfg.word = v.word;
  }
  if (body.enabled !== undefined) cfg.enabled = body.enabled === true;
  if (body.touchScreen !== undefined) cfg.touchScreen = body.touchScreen === true;
  if (body.touchLive !== undefined) cfg.touchLive = body.touchLive === true;
  await saveConfig(cfg);
  res.json(view(cfg));
});
liveAdminRouter.post('/new-word', async (_req, res) => {
  const cfg = await readConfig();
  cfg.word = randomWord();
  await saveConfig(cfg);
  res.json(view(cfg));
});
