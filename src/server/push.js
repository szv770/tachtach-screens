/**
 * Web-push alerts to the admins' phones (the installed admin PWA).
 *
 * Self-hosted: the VAPID key pair is generated on first use and kept, with the
 * subscriptions, in data/push.json (gitignored — it holds the private key).
 * No outside service or account is involved beyond the browser's own push
 * service (Apple/Google/Mozilla), which only relays the encrypted message.
 *
 * Monitors (startPushMonitor): the screen has been off the server's live
 * stream for a few minutes (and again when it is back), and the zmanim have
 * stopped refreshing. If the server itself (the Pi) is off nothing can be
 * sent from here — that is inherent to a self-hosted sender.
 */
import webpush from 'web-push';
import { readJSON, writeJSON } from './storage.js';

const FILE = 'push.json';
const MAX_SUBS_PER_USER = 10;

export const OFFLINE_AFTER_MS = 5 * 60 * 1000;
export const STALE_ZMANIM_MS = 12 * 60 * 60 * 1000;
const CHECK_EVERY_MS = 60 * 1000;

async function load() {
  const d = (await readJSON(FILE).catch(() => null)) || {};
  return { vapid: d.vapid || null, subscriptions: Array.isArray(d.subscriptions) ? d.subscriptions : [] };
}
const save = (d) => writeJSON(FILE, d);

let configured = false;
async function vapid() {
  const d = await load();
  if (!d.vapid) {
    d.vapid = webpush.generateVAPIDKeys();
    await save(d);
  }
  if (!configured) {
    webpush.setVapidDetails(process.env.PUSH_CONTACT || 'mailto:tachtach@example.com', d.vapid.publicKey, d.vapid.privateKey);
    configured = true;
  }
  return d.vapid;
}

export async function getPublicKey() {
  return (await vapid()).publicKey;
}

/** Accepts only a well-formed browser PushSubscription. */
export function validSubscription(s) {
  return !!s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
    && !!s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
}

export async function subscribe(userId, sub, ua = '') {
  const d = await load();
  d.subscriptions = d.subscriptions.filter((x) => x.endpoint !== sub.endpoint);
  d.subscriptions.push({
    endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    userId, ua: String(ua).slice(0, 200), createdAt: new Date().toISOString(),
  });
  const mine = d.subscriptions.filter((x) => x.userId === userId);
  if (mine.length > MAX_SUBS_PER_USER) {
    const drop = new Set(mine.slice(0, mine.length - MAX_SUBS_PER_USER).map((x) => x.endpoint));
    d.subscriptions = d.subscriptions.filter((x) => !drop.has(x.endpoint));
  }
  await vapid();
  await save(d);
}

export async function unsubscribe(userId, endpoint) {
  const d = await load();
  const before = d.subscriptions.length;
  d.subscriptions = d.subscriptions.filter((x) => !(x.endpoint === endpoint && x.userId === userId));
  if (d.subscriptions.length !== before) await save(d);
}

export async function subscriptionCount(userId) {
  return (await load()).subscriptions.filter((x) => x.userId === userId).length;
}

/** Send to every subscription (or only userId's). Dead endpoints (404/410) are dropped. */
export async function sendPush({ title, body, tag, url = '/admin' }, { userId } = {}) {
  await vapid();
  const d = await load();
  const targets = d.subscriptions.filter((x) => !userId || x.userId === userId);
  const payload = JSON.stringify({ title, body, tag, url });
  const dead = new Set();
  let sent = 0;
  await Promise.all(targets.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.add(s.endpoint);
      else console.warn(`[push] send failed (${err.statusCode || err.message})`);
    }
  }));
  if (dead.size) {
    const fresh = await load();
    fresh.subscriptions = fresh.subscriptions.filter((x) => !dead.has(x.endpoint));
    await save(fresh);
  }
  return { sent, total: targets.length };
}

// ── Monitors ────────────────────────────────────────────────────────────────

/**
 * Pure: given the previous state, whether any screen is connected and the
 * time, return the next state and what (if anything) to announce.
 * state: { offlineSince: ms|null, alerted: bool }
 */
export function evaluateScreen(state, connected, now, afterMs = OFFLINE_AFTER_MS) {
  if (connected) {
    return { state: { offlineSince: null, alerted: false }, action: state.alerted ? 'back' : null };
  }
  const since = state.offlineSince ?? now;
  if (!state.alerted && now - since >= afterMs) return { state: { offlineSince: since, alerted: true }, action: 'offline' };
  return { state: { offlineSince: since, alerted: state.alerted }, action: null };
}

/** Pure: stale-data check. state: { alerted: bool }; fetchedAt: ISO string or null. */
export function evaluateZmanim(state, fetchedAt, now, afterMs = STALE_ZMANIM_MS) {
  const age = fetchedAt ? now - Date.parse(fetchedAt) : null;
  const stale = age !== null && Number.isFinite(age) && age >= afterMs;
  if (!stale) return { state: { alerted: false }, action: null };
  return { state: { alerted: true }, action: state.alerted ? null : 'stale' };
}

let timer = null;
export async function startPushMonitor() {
  if (timer) return;
  // Lazy: sse.js starts a heartbeat interval on import (keeps tests alive).
  const { getKioskClientCount } = await import('./sse.js');
  // The grace period starts at server start: the kiosk needs a moment to reconnect.
  let screen = { offlineSince: Date.now(), alerted: false };
  let zmanim = { alerted: false };
  timer = setInterval(async () => {
    try {
      const now = Date.now();
      const s = evaluateScreen(screen, getKioskClientCount() > 0, now);
      screen = s.state;
      if (s.action === 'offline') {
        await sendPush({ title: 'Screen offline', body: 'The screen has not been connected for a few minutes.', tag: 'screen-offline' });
      } else if (s.action === 'back') {
        await sendPush({ title: 'Screen is back online', body: 'The screen reconnected.', tag: 'screen-offline' });
      }
      const cache = await readJSON('cache.json').catch(() => null);
      const z = evaluateZmanim(zmanim, cache?.zmanim?.fetchedAt || null, now);
      zmanim = z.state;
      if (z.action === 'stale') {
        await sendPush({ title: 'Zmanim are out of date', body: 'The zmanim have not refreshed in over 12 hours.', tag: 'zmanim-stale' });
      }
    } catch (err) {
      console.warn('[push] monitor error:', err.message);
    }
  }, CHECK_EVERY_MS);
  timer.unref?.();
}
