/**
 * Health check: a PURE aggregator. The server gathers plain facts (src/server/health.js), this turns
 * them into rows an admin can read: a status, one plain sentence, how to fix it, and (only where a safe
 * action already exists) a Fix button descriptor. No I/O, no secrets, no absolute paths.
 *
 *   status  'ok' | 'warn' | 'bad' | 'info'   (info = nothing to judge, just something worth knowing)
 *   fix     { action, label, needs }          needs = the capability the existing endpoint needs
 *
 * Fix actions (the admin maps each to an API call that already exists):
 *   refresh-data  POST /api/refresh        screen.control
 *   sync-album    POST /api/google-album/:id/sync   feeds.edit
 *   sync-feed     POST /api/rss/feeds/:id/sync      feeds.edit
 *   cleanup       POST /api/cleanup        settings.change
 *   push-test     POST /api/push/test      (any signed-in person)
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const THRESHOLDS = Object.freeze({
  screenOfflineWarnMs: 5 * MIN,       // matches push.js OFFLINE_AFTER_MS
  zmanimWarnMs: 6 * HOUR,
  zmanimBadMs: 12 * HOUR,             // matches push.js STALE_ZMANIM_MS
  dailyDataWarnMs: 30 * HOUR,         // Hayom Yom, daily study: should refresh once a day
  dailyDataBadMs: 54 * HOUR,
  weatherWarnMs: 6 * HOUR,
  weatherBadMs: 24 * HOUR,
  albumWarnMs: 3 * DAY,
  feedGrace: 2,                       // a feed is late after this many of its own intervals
  diskWarnBytes: 1024 ** 3,           // 1 GB
  diskBadBytes: 300 * 1024 ** 2,
  uploadsWarnBytes: 2 * 1024 ** 3,
  certWarnMs: 30 * DAY,
  backupWarnMs: 7 * DAY,
  clockWarnMs: 2 * MIN,
  clockBadMs: 10 * MIN,
  uptimeFreshMs: 2 * MIN,
});

export const FEED_INTERVAL_MS = { hourly: HOUR, every6hours: 6 * HOUR, daily: DAY };

const ts = (v) => { const n = typeof v === 'number' ? v : Date.parse(v || ''); return Number.isFinite(n) ? n : null; };

export function ago(ms) {
  if (ms == null || !Number.isFinite(ms)) return 'never';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

export function bytesLabel(n) {
  if (n == null || !Number.isFinite(n)) return 'unknown';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
}

export function durationLabel(ms) {
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${Math.max(0, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} days ${h % 24} h`;
}

const row = (id, group, label, status, summary, extra = {}) => ({ id, group, label, status, summary, ...extra });
const REFRESH = { action: 'refresh-data', label: 'Refresh data now', needs: 'screen.control' };

/** Age-based judgement shared by the "did this source refresh lately" rows. */
function judgeAge(at, now, warnMs, badMs) {
  const t = ts(at);
  if (t == null) return { status: 'bad', age: null };
  const age = Math.max(0, now - t);
  return { status: age >= badMs ? 'bad' : age >= warnMs ? 'warn' : 'ok', age };
}

/**
 * @param {object} f  facts gathered by the server (see src/server/health.js)
 * @param {number} now epoch ms
 */
export function buildHealth(f = {}, now = Date.now()) {
  const T = THRESHOLDS;
  const checks = [];

  // ── Screen ──
  const sc = f.screen || {};
  const seen = ts(sc.lastSeenAt);
  if (sc.online) {
    const n = sc.clients || 1;
    checks.push(row('screen-online', 'Screen', 'Screen connected', 'ok', `${n === 1 ? 'The screen is' : `${n} screens are`} connected right now.`));
  } else {
    const off = seen != null ? now - seen : null;
    checks.push(row('screen-online', 'Screen', 'Screen connected', off != null && off < T.screenOfflineWarnMs ? 'warn' : 'bad',
      seen != null ? `No screen is connected. Last seen ${ago(off)}.` : 'No screen has connected since the server started.',
      { help: 'Check the TV is on and the screen box is powered. The screen reconnects by itself; if it does not within a few minutes, restart the box.' }));
  }
  if (sc.online && sc.reportedAt) {
    const quiet = now - ts(sc.reportedAt);
    checks.push(row('screen-reporting', 'Screen', 'Screen is reporting slides', quiet > 30 * MIN && !sc.paused ? 'warn' : 'ok',
      quiet > 30 * MIN && !sc.paused ? `The screen has not reported a slide change for ${durationLabel(quiet)}.` : `Last slide report ${ago(quiet)}${sc.paused ? ' (paused)' : ''}.`,
      quiet > 30 * MIN && !sc.paused ? { help: 'The page may be stuck. Use "Refresh screen" on Home.' } : {}));
  }

  // ── Data freshness ──
  const c = f.cache || {};
  const z = judgeAge(c.zmanimFetchedAt, now, T.zmanimWarnMs, T.zmanimBadMs);
  checks.push(row('zmanim', 'Data', 'Zmanim (daily times)', z.status,
    z.age == null ? 'The zmanim have never been fetched.' : `Refreshed ${ago(z.age)}.`,
    z.status === 'ok' ? {} : { help: 'The screen is showing old times. Check the server is online, then refresh.', fix: REFRESH }));

  const today = c.today;
  const daily = [
    ['hayom-yom', 'Hayom Yom', c.hayomYom, true],
    ['daily-study', 'Daily study (Chitas, Rambam)', c.limudim, false],
    ['parsha', 'Parsha and Hebrew date', c.hebrewDate, true],
  ];
  for (const [id, label, item, usesForDate] of daily) {
    const j = judgeAge(item?.fetchedAt, now, T.dailyDataWarnMs, T.dailyDataBadMs);
    let status = j.status;
    let summary = j.age == null ? `${label} has never been fetched.` : `Refreshed ${ago(j.age)}.`;
    if (usesForDate && today && item?.forDate && item.forDate !== today && status === 'ok') {
      status = 'warn'; summary = `${label} is still showing an earlier day (${item.forDate}).`;
    }
    checks.push(row(id, 'Data', label, status, summary,
      status === 'ok' ? {} : { help: 'The website this comes from may have blocked or timed out. Refreshing tries again; the old text stays on screen meanwhile.', fix: REFRESH }));
  }
  if (c.weatherEnabled !== false) {
    const j = judgeAge(c.weather?.fetchedAt, now, T.weatherWarnMs, T.weatherBadMs);
    checks.push(row('weather', 'Data', 'Weather', j.status, j.age == null ? 'Weather has never been fetched.' : `Refreshed ${ago(j.age)}.`,
      j.status === 'ok' ? {} : { help: 'Check the zip code under Look & Settings > Location, and use Test there.', fix: REFRESH }));
  } else {
    checks.push(row('weather', 'Data', 'Weather', 'info', 'Weather is turned off.'));
  }

  // ── Feeds and albums ──
  for (const feed of f.feeds || []) {
    const every = FEED_INTERVAL_MS[feed.refreshInterval] || DAY;
    const j = judgeAge(feed.lastFetched, now, every * T.feedGrace, every * T.feedGrace * 2);
    const name = feed.name || 'News feed';
    checks.push(row(`feed-${feed.id}`, 'Feeds and photos', `News feed: ${name}`, j.status,
      j.age == null ? `"${name}" has never been fetched.` : `Last updated ${ago(j.age)}${feed.itemCount != null ? `, ${feed.itemCount} items` : ''}.`,
      j.status === 'ok' ? {} : { help: 'The feed address may have changed or the site is down.', fix: { action: 'sync-feed', id: feed.id, label: 'Fetch it now', needs: 'feeds.edit' } }));
  }
  for (const a of f.albums || []) {
    const name = a.name || 'Photo album';
    const lastSync = ts(a.lastSync);
    let status = 'ok'; let summary = `${a.photoCount ?? 0} photos, synced ${ago(lastSync == null ? null : now - lastSync)}.`; let help;
    if (a.status === 'error') { status = 'bad'; summary = `The last sync failed${a.error ? `: ${String(a.error).slice(0, 120)}` : '.'}`; help = 'Check the shared album link still works, then sync again.'; }
    else if (a.status === 'syncing') { status = 'info'; summary = 'Syncing right now.'; }
    else if (lastSync == null) { status = 'warn'; summary = 'Never synced.'; }
    else if (now - lastSync > T.albumWarnMs) { status = 'warn'; summary = `Last synced ${ago(now - lastSync)}.`; }
    checks.push(row(`album-${a.id}`, 'Feeds and photos', `Photo album: ${name}`, status, summary,
      status === 'ok' || status === 'info' ? {} : { help, fix: { action: 'sync-album', id: a.id, label: 'Sync it now', needs: 'feeds.edit' } }));
  }

  // ── This computer ──
  const d = f.disk;
  if (d && d.freeBytes != null) {
    const status = d.freeBytes < T.diskBadBytes ? 'bad' : d.freeBytes < T.diskWarnBytes ? 'warn' : 'ok';
    checks.push(row('disk', 'This computer', 'Disk space', status, `${bytesLabel(d.freeBytes)} free${d.totalBytes ? ` of ${bytesLabel(d.totalBytes)}` : ''}.`,
      status === 'ok' ? {} : { help: 'Clearing old uploads and backups frees space. If it stays low, delete pictures you no longer show.', fix: { action: 'cleanup', label: 'Clear old uploads', needs: 'settings.change' } }));
  } else {
    checks.push(row('disk', 'This computer', 'Disk space', 'info', 'Disk space could not be read on this computer.'));
  }
  if (f.uploadsBytes != null) {
    const big = f.uploadsBytes >= T.uploadsWarnBytes;
    checks.push(row('uploads', 'This computer', 'Uploaded pictures and videos', big ? 'warn' : 'ok', `${bytesLabel(f.uploadsBytes)} used by uploads${f.uploadsCount != null ? ` (${f.uploadsCount} files)` : ''}.`,
      big ? { help: 'That is a lot. Delete what you no longer show under Media.', fix: { action: 'cleanup', label: 'Clear old uploads', needs: 'settings.change' } } : {}));
  }
  if (f.process) {
    const up = (f.process.uptimeSec || 0) * 1000;
    checks.push(row('uptime', 'This computer', 'Server running', up < T.uptimeFreshMs ? 'info' : 'ok', `Up for ${durationLabel(up)} (Node ${f.process.node || '?'}).`,
      up < T.uptimeFreshMs ? { help: 'The server just started, so some numbers above may still be catching up.' } : {}));
  }
  if (f.clock) {
    const skew = f.clock.skewMs;
    let status = 'ok'; let summary = 'The server clock agrees with this device.';
    if (skew == null) { status = 'info'; summary = 'Could not compare clocks.'; }
    else if (Math.abs(skew) >= T.clockBadMs) { status = 'bad'; summary = `The server clock is ${durationLabel(Math.abs(skew))} ${skew > 0 ? 'ahead of' : 'behind'} this device.`; }
    else if (Math.abs(skew) >= T.clockWarnMs) { status = 'warn'; summary = `The server clock is ${durationLabel(Math.abs(skew))} ${skew > 0 ? 'ahead of' : 'behind'} this device.`; }
    if (f.clock.ntpSynced === false && status === 'ok') { status = 'warn'; summary = 'The server says its clock is not synchronised with the internet.'; }
    checks.push(row('clock', 'This computer', 'Clock', status, summary,
      status === 'ok' || status === 'info' ? {} : { help: f.platform === 'win32' ? 'Zmanim and the schedule depend on the right time. Make sure the screen computer is online, that Windows has "Set time automatically" on, and that the Windows time zone matches Look & Settings > Location.' : 'Zmanim and the schedule depend on the right time. Make sure the server is online (it sets its clock from the internet) and the time zone is right under Look & Settings > Location.' }));
  }
  if (f.tls && f.tls.enabled) {
    const end = ts(f.tls.notAfter);
    if (end == null) checks.push(row('tls', 'This computer', 'Screen security certificate', 'info', 'The certificate date could not be read.'));
    else {
      const left = end - now;
      const status = left <= 0 ? 'bad' : left < T.certWarnMs ? 'warn' : 'ok';
      checks.push(row('tls', 'This computer', 'Screen security certificate', status,
        left <= 0 ? 'The screen\'s local certificate has expired.' : `Valid for ${Math.floor(left / DAY)} more days.`,
        status === 'ok' ? {} : { help: f.platform === 'win32' ? 'Only web-page slides are affected. An admin can delete C:\\TachTach\\data\\tls on the screen computer and restart the TachTach Server task to make a new one.' : 'Only web-page slides are affected. An admin can delete data/tls on the server and restart the server to make a new one.' }));
    }
  } else if (f.tls) {
    checks.push(row('tls', 'This computer', 'Screen security certificate', 'info', 'The local secure address is off, so web-page slides from sites that need https may not show.'));
  }
  if (f.backups) {
    const t = ts(f.backups.newestAt);
    if (!f.backups.count) checks.push(row('backups', 'This computer', 'Backups of your settings', 'info', 'No backup copies yet. They appear after the first change.'));
    else {
      const stale = t != null && now - t > T.backupWarnMs;
      checks.push(row('backups', 'This computer', 'Backups of your settings', stale ? 'warn' : 'ok',
        `${f.backups.count} backup file${f.backups.count === 1 ? '' : 's'}, newest ${ago(t == null ? null : now - t)}.`,
        stale ? { help: 'Backups are made whenever a setting is saved, so an old one just means nothing has changed. If you expect changes, check disk space above.' } : {}));
    }
  }
  if (f.poppler != null) {
    checks.push(row('poppler', 'This computer', 'PDF slides (poppler-utils)', f.poppler ? 'ok' : 'warn',
      f.poppler ? 'Installed. PDFs can be turned into slides.' : 'Not installed, so uploaded PDFs cannot become slides.',
      f.poppler ? {} : { help: f.platform === 'win32' ? 'On the screen computer, run deploy\\windows\\install.ps1 again as administrator (it installs the PDF tool).' : 'On the server, run: sudo apt install poppler-utils' }));
  }

  // ── Alerts and security ──
  if (f.push) {
    const on = (f.push.subscribedHere || 0) > 0;
    checks.push(row('push', 'Alerts', 'Phone alerts for you', on ? 'ok' : 'info',
      on ? 'This account gets alerts on at least one phone.' : 'Alerts are off for your account. Turn them on under My account to hear when the screen goes offline.',
      on ? { fix: { action: 'push-test', label: 'Send a test alert', needs: null } } : { go: 'account' }));
  }
  checks.push(row('audit', 'Alerts', 'Software updates', 'info', 'Dependency security checks are not run live here. Run "npm audit" on the server after updating, and see docs/security for the last review.'));

  const counts = { ok: 0, warn: 0, bad: 0, info: 0 };
  for (const k of checks) counts[k.status]++;
  const overall = counts.bad ? 'bad' : counts.warn ? 'warn' : 'ok';
  return { overall, counts, checks, generatedAt: new Date(now).toISOString() };
}

/** Plain headline for the top of the page / Home tile. */
export function healthHeadline(h) {
  if (!h) return 'Not checked yet';
  const { bad, warn } = h.counts;
  if (bad) return `${bad} thing${bad === 1 ? '' : 's'} need${bad === 1 ? 's' : ''} attention${warn ? `, ${warn} to watch` : ''}`;
  if (warn) return `${warn} thing${warn === 1 ? '' : 's'} to watch`;
  return 'Everything looks fine';
}
