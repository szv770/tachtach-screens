/**
 * Gathers the plain facts the health check needs (src/shared/health.js judges them).
 * Read-only, nothing here writes. Relative names only; no secrets, no absolute paths.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { readdir, stat, statfs, readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { X509Certificate } from 'crypto';
import { readJSON } from './storage.js';
import { getScreenState } from './screenState.js';
import { getKioskClientCount, getKioskLastSeenAt } from './sse.js';
import { getAlbumStatus } from './google-photos.js';
import { pdfToolsAvailable } from './pdf.js';
import { isLocalTlsEnabled } from './localTls.js';
import { subscriptionCount } from './push.js';
import { buildHealth } from '../shared/health.js';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'data');

/** What the Home card and the health page both read: is a real screen connected, and what is it on. */
export function screenStatus() {
  const s = getScreenState();
  const clients = getKioskClientCount();
  return {
    online: clients > 0,
    clients,
    lastSeenAt: getKioskLastSeenAt() ? new Date(getKioskLastSeenAt()).toISOString() : null,
    reportedAt: s.reportedAt ? new Date(s.reportedAt).toISOString() : null,
    slideId: s.slideId ?? null,
    slideIndex: s.slideIndex ?? 0,
    paused: !!s.isPaused,
    display: s.display ? { width: s.display.width, height: s.display.height, orientation: s.display.orientation } : null,
  };
}

let dirMemo = { mtime: null, v: null };
// Uploads are write-once, so the folder's own modified time says when to look again (a Fix that clears files shows at once).
async function uploadsInfo() {
  const dir = path.join(DATA, 'uploads');
  let mtime = null;
  try { mtime = (await stat(dir)).mtimeMs; } catch { /* no uploads dir yet */ }
  if (dirMemo.v && mtime !== null && dirMemo.mtime === mtime) return dirMemo.v;
  let bytes = 0; let count = 0;
  try {
    for (const f of await readdir(dir)) {
      try { const st = await stat(path.join(dir, f)); if (st.isFile()) { bytes += st.size; count++; } } catch { /* vanished */ }
    }
  } catch { /* no uploads dir yet */ }
  dirMemo = { mtime, v: { bytes, count } };
  return dirMemo.v;
}

async function backupsInfo() {
  let count = 0; let newest = 0;
  try {
    for (const f of await readdir(DATA)) {
      if (!f.endsWith('.bak')) continue;
      try { const st = await stat(path.join(DATA, f)); count++; newest = Math.max(newest, st.mtimeMs); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { count, newestAt: newest ? new Date(newest).toISOString() : null };
}

async function certInfo() {
  if (!isLocalTlsEnabled()) return { enabled: false };
  try {
    const x = new X509Certificate(await readFile(path.join(DATA, 'tls', 'localhost.crt')));
    return { enabled: true, notAfter: new Date(x.validTo).toISOString() };
  } catch { return { enabled: true, notAfter: null }; }
}

let ntpMemo = { at: 0, v: null };
async function ntpSynced() {
  if (Date.now() - ntpMemo.at < 5 * 60_000) return ntpMemo.v;
  let v = null;
  try {
    const { stdout } = await run('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'], { timeout: 3000 });
    v = stdout.trim() === 'yes' ? true : stdout.trim() === 'no' ? false : null;
  } catch { /* not systemd / not installed: unknown */ }
  ntpMemo = { at: Date.now(), v };
  return v;
}

async function diskInfo() {
  try {
    const s = await statfs(DATA);
    return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) };
  } catch { return null; }
}

/** @param {{ userId: string, clientNow?: number }} who */
export async function collectHealth({ userId, clientNow } = {}) {
  const now = Date.now();
  const [cache, settings, feeds, albums, up, bak, cert, disk, poppler, ntp, pushCount] = await Promise.all([
    readJSON('cache.json').catch(() => null),
    readJSON('settings.json').catch(() => null),
    readJSON('rss-feeds.json').catch(() => []),
    readJSON('google-albums.json').catch(() => []),
    uploadsInfo(), backupsInfo(), certInfo(), diskInfo(),
    pdfToolsAvailable().catch(() => null), ntpSynced(),
    userId ? subscriptionCount(userId).catch(() => 0) : 0,
  ]);
  const c = cache || {};
  const albumRows = await Promise.all((Array.isArray(albums) ? albums : []).map(async (a) => {
    const st = await getAlbumStatus(a.url).catch(() => ({}));
    return { id: a.id, name: a.name || a.title || '', status: st.status || 'not_synced', photoCount: st.photoCount || 0, lastSync: st.lastSync || null, error: st.error || null };
  }));
  const tz = settings?.location?.timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const skew = Number.isFinite(clientNow) ? now - clientNow : null;
  const facts = {
    screen: screenStatus(),
    cache: {
      today,
      zmanimFetchedAt: c.zmanim?.fetchedAt || null,
      hayomYom: c.hayomYom ? { fetchedAt: c.hayomYom.fetchedAt, forDate: c.hayomYom.forDate } : null,
      limudim: c.limudim ? { fetchedAt: c.limudim.fetchedAt } : null,
      hebrewDate: c.hebrewDate ? { fetchedAt: c.hebrewDate.fetchedAt, forDate: c.hebrewDate.forDate } : null,
      weather: c.weather ? { fetchedAt: c.weather.fetchedAt } : null,
      weatherEnabled: settings?.weather?.enabled !== false,
    },
    feeds: (Array.isArray(feeds) ? feeds : []).map((f) => ({ id: f.id, name: f.name, lastFetched: f.lastFetched || null, itemCount: f.itemCount, refreshInterval: f.refreshInterval })),
    albums: albumRows,
    disk, uploadsBytes: up.bytes, uploadsCount: up.count,
    process: { uptimeSec: Math.round(process.uptime()), node: process.versions.node },
    tls: cert,
    push: { subscribedHere: pushCount },
    backups: bak,
    poppler,
    clock: { skewMs: skew, ntpSynced: ntp },
  };
  return buildHealth(facts, now);
}
