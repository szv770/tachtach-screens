import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealth, healthHeadline, THRESHOLDS, ago, bytesLabel } from '../src/shared/health.js';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const H = 3600 * 1000;
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const by = (h, id) => h.checks.find((c) => c.id === id);

const GOOD = () => ({
  screen: { online: true, clients: 1, reportedAt: iso(60000), lastSeenAt: iso(0) },
  cache: { today: '2026-10-19', zmanimFetchedAt: iso(H), hayomYom: { fetchedAt: iso(H), forDate: '2026-10-19' }, limudim: { fetchedAt: iso(H) }, hebrewDate: { fetchedAt: iso(H), forDate: '2026-10-19' }, weather: { fetchedAt: iso(H) } },
  feeds: [{ id: 'f1', name: 'News', lastFetched: iso(H), refreshInterval: 'daily', itemCount: 9 }],
  albums: [{ id: 'a1', name: 'Trip', status: 'ready', photoCount: 40, lastSync: iso(H) }],
  disk: { freeBytes: 20 * 1024 ** 3, totalBytes: 30 * 1024 ** 3 }, uploadsBytes: 1e8, uploadsCount: 4,
  process: { uptimeSec: 86400, node: '22' }, tls: { enabled: true, notAfter: iso(-400 * 24 * H) },
  push: { subscribedHere: 1 }, backups: { count: 5, newestAt: iso(H) }, poppler: true, clock: { skewMs: 1000, ntpSynced: true },
});

test('all good: overall ok, no fix buttons', () => {
  const h = buildHealth(GOOD(), NOW);
  assert.equal(h.overall, 'ok');
  assert.equal(h.counts.bad + h.counts.warn, 0);
  assert.equal(healthHeadline(h), 'Everything looks fine');
  // only the phone test button exists when healthy
  assert.deepEqual(h.checks.filter((c) => c.fix).map((c) => c.fix.action), ['push-test']);
});

test('screen offline is bad with last-seen, and recent drop is only a warning', () => {
  const f = GOOD(); f.screen = { online: false, lastSeenAt: iso(40 * 60000) };
  assert.equal(by(buildHealth(f, NOW), 'screen-online').status, 'bad');
  f.screen = { online: false, lastSeenAt: iso(60000) };
  assert.equal(by(buildHealth(f, NOW), 'screen-online').status, 'warn');
  f.screen = { online: false, lastSeenAt: null };
  assert.match(by(buildHealth(f, NOW), 'screen-online').summary, /since the server started/);
});

test('zmanim freshness uses the same 12 hour line as the phone alert', () => {
  assert.equal(THRESHOLDS.zmanimBadMs, 12 * H);
  const f = GOOD();
  f.cache.zmanimFetchedAt = iso(7 * H);
  assert.equal(by(buildHealth(f, NOW), 'zmanim').status, 'warn');
  f.cache.zmanimFetchedAt = iso(13 * H);
  const z = by(buildHealth(f, NOW), 'zmanim');
  assert.equal(z.status, 'bad');
  assert.equal(z.fix.action, 'refresh-data');
  assert.equal(z.fix.needs, 'screen.control');
  f.cache.zmanimFetchedAt = null;
  assert.equal(by(buildHealth(f, NOW), 'zmanim').status, 'bad');
});

test('hayom yom still on yesterday is a warning even if fetched recently', () => {
  const f = GOOD(); f.cache.hayomYom.forDate = '2026-10-18';
  assert.equal(by(buildHealth(f, NOW), 'hayom-yom').status, 'warn');
});

test('weather off is info, not a failure', () => {
  const f = GOOD(); f.cache.weatherEnabled = false; f.cache.weather = null;
  assert.equal(by(buildHealth(f, NOW), 'weather').status, 'info');
});

test('feeds: late after two intervals, bad after four; fix targets that feed', () => {
  const f = GOOD(); f.feeds[0].lastFetched = iso(60 * H);
  let r = by(buildHealth(f, NOW), 'feed-f1');
  assert.equal(r.status, 'warn');
  assert.deepEqual(r.fix, { action: 'sync-feed', id: 'f1', label: 'Fetch it now', needs: 'feeds.edit' });
  f.feeds[0].lastFetched = iso(120 * H);
  assert.equal(by(buildHealth(f, NOW), 'feed-f1').status, 'bad');
});

test('albums: error status is bad and carries a trimmed message; syncing is info', () => {
  const f = GOOD(); f.albums[0] = { id: 'a1', name: 'Trip', status: 'error', error: 'x'.repeat(500) };
  const r = by(buildHealth(f, NOW), 'album-a1');
  assert.equal(r.status, 'bad');
  assert.ok(r.summary.length < 200);
  assert.equal(r.fix.action, 'sync-album');
  f.albums[0] = { id: 'a1', status: 'syncing' };
  assert.equal(by(buildHealth(f, NOW), 'album-a1').status, 'info');
});

test('disk thresholds and cleanup fix needs settings.change', () => {
  const f = GOOD(); f.disk.freeBytes = 600 * 1024 ** 2;
  let r = by(buildHealth(f, NOW), 'disk');
  assert.equal(r.status, 'warn');
  assert.equal(r.fix.needs, 'settings.change');
  f.disk.freeBytes = 100 * 1024 ** 2;
  assert.equal(by(buildHealth(f, NOW), 'disk').status, 'bad');
  f.disk = null;
  assert.equal(by(buildHealth(f, NOW), 'disk').status, 'info');
});

test('clock skew and unsynchronised NTP', () => {
  const f = GOOD();
  f.clock = { skewMs: 5 * 60000, ntpSynced: true };
  assert.equal(by(buildHealth(f, NOW), 'clock').status, 'warn');
  f.clock = { skewMs: -20 * 60000 };
  assert.match(by(buildHealth(f, NOW), 'clock').summary, /behind/);
  assert.equal(by(buildHealth(f, NOW), 'clock').status, 'bad');
  f.clock = { skewMs: 0, ntpSynced: false };
  assert.equal(by(buildHealth(f, NOW), 'clock').status, 'warn');
  f.clock = { skewMs: null };
  assert.equal(by(buildHealth(f, NOW), 'clock').status, 'info');
});

test('certificate: expired, expiring, fine, and off', () => {
  const f = GOOD();
  f.tls = { enabled: true, notAfter: iso(H) };
  assert.equal(by(buildHealth(f, NOW), 'tls').status, 'bad');
  f.tls = { enabled: true, notAfter: iso(-10 * 24 * H) };
  assert.equal(by(buildHealth(f, NOW), 'tls').status, 'warn');
  f.tls = { enabled: false };
  assert.equal(by(buildHealth(f, NOW), 'tls').status, 'info');
});

test('poppler missing warns with the install command, phone alerts off is info', () => {
  const f = GOOD(); f.poppler = false; f.push = { subscribedHere: 0 };
  const h = buildHealth(f, NOW);
  assert.equal(by(h, 'poppler').status, 'warn');
  assert.match(by(h, 'poppler').help, /apt install poppler-utils/);
  assert.equal(by(h, 'push').status, 'info');
  assert.equal(by(h, 'push').go, 'account');
});

test('overall is the worst status; headline counts', () => {
  const f = GOOD(); f.cache.zmanimFetchedAt = iso(20 * H); f.poppler = false;
  const h = buildHealth(f, NOW);
  assert.equal(h.overall, 'bad');
  assert.equal(healthHeadline(h), '1 thing needs attention, 1 to watch');
});

test('never leaks paths or secrets and empty input does not throw', () => {
  const h = buildHealth({}, NOW);
  assert.ok(h.checks.length >= 3);
  assert.doesNotMatch(JSON.stringify(buildHealth(GOOD(), NOW)), /\/home\/|\/data\/|password|secret/i);
});

test('label helpers', () => {
  assert.equal(ago(null), 'never');
  assert.equal(ago(10 * 60000), '10 min ago');
  assert.equal(ago(5 * H), '5 hours ago');
  assert.equal(bytesLabel(1.5 * 1024 ** 3), '1.5 GB');
});

test('Health warns when no time zone is set, and is silent when it is (or when the fact is absent)', () => {
  const off = buildHealth({ ...GOOD(), config: { timezoneSet: false } }, NOW);
  const row = off.checks.find((c) => c.id === 'timezone');
  assert.equal(row.status, 'warn');
  assert.match(row.summary, /New York/);
  assert.equal(buildHealth({ ...GOOD(), config: { timezoneSet: true } }, NOW).checks.some((c) => c.id === 'timezone'), false);
  assert.equal(buildHealth(GOOD(), NOW).checks.some((c) => c.id === 'timezone'), false);
});
