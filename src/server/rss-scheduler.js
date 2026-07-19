import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchRSSFeed } from '../fetchers/rss.js';
import { readJSON, writeJSON } from './storage.js';
import { broadcast } from './sse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RSS_CACHE_DIR = path.resolve(__dirname, '../../data/rss-cache');

// Ensure cache directory exists
await mkdir(RSS_CACHE_DIR, { recursive: true });

// Active timers keyed by feed ID
const timers = new Map();

// Interval map in milliseconds
const INTERVALS = {
  hourly: 60 * 60 * 1000,
  every6hours: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};

/**
 * Fetch a single RSS feed, cache its items, and update the feed metadata.
 * @param {object} feed - Feed config object with id, url, mapping, etc.
 */
export async function refreshRSSFeed(feed) {
  try {
    const result = await fetchRSSFeed(feed.url);
    const cacheData = {
      items: result.items,
      feedTitle: result.feedTitle,
      availableFields: result.availableFields,
      fetchedAt: new Date().toISOString(),
    };

    // Write cache file
    const cachePath = path.join(RSS_CACHE_DIR, `${feed.id}.json`);
    await writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8');

    // Update feed metadata (lastFetched, itemCount)
    const feeds = (await readJSON('rss-feeds.json')) ?? [];
    const idx = feeds.findIndex(f => f.id === feed.id);
    if (idx !== -1) {
      feeds[idx].lastFetched = cacheData.fetchedAt;
      feeds[idx].itemCount = result.items.length;
      await writeJSON('rss-feeds.json', feeds);
    }

    // Broadcast update so the kiosk screen refreshes
    broadcast('rss-update', { feedId: feed.id, ...cacheData });

    console.log(`[rss-scheduler] Refreshed feed "${feed.name}" — ${result.items.length} items`);
    return cacheData;
  } catch (err) {
    console.error(`[rss-scheduler] Failed to refresh feed "${feed.name}":`, err.message);
    throw err;
  }
}

/**
 * Refresh all saved RSS feeds.
 */
export async function refreshAllRSSFeeds() {
  const feeds = (await readJSON('rss-feeds.json')) ?? [];
  const results = await Promise.allSettled(feeds.map(f => refreshRSSFeed(f)));
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  console.log(`[rss-scheduler] Refreshed ${succeeded}/${feeds.length} feeds`);
}

/**
 * Start a periodic refresh timer for a feed.
 * @param {object} feed
 */
export function startRSSScheduler(feed) {
  stopRSSTimer(feed.id);
  const ms = INTERVALS[feed.refreshInterval] || INTERVALS.daily;
  const timer = setInterval(() => {
    refreshRSSFeed(feed).catch(() => {});
  }, ms);
  timers.set(feed.id, timer);
}

/**
 * Stop the periodic refresh timer for a feed.
 * @param {string} feedId
 */
export function stopRSSTimer(feedId) {
  const existing = timers.get(feedId);
  if (existing) {
    clearInterval(existing);
    timers.delete(feedId);
  }
}

/**
 * Initialize all RSS feed timers on server startup.
 */
export async function initRSSSchedulers() {
  const feeds = (await readJSON('rss-feeds.json')) ?? [];
  for (const feed of feeds) {
    startRSSScheduler(feed);
  }
  if (feeds.length > 0) {
    console.log(`[rss-scheduler] Started timers for ${feeds.length} feed(s)`);
    // Do an initial refresh of any feeds not fetched in the last interval
    for (const feed of feeds) {
      const ms = INTERVALS[feed.refreshInterval] || INTERVALS.daily;
      const lastFetched = feed.lastFetched ? new Date(feed.lastFetched).getTime() : 0;
      if (Date.now() - lastFetched > ms) {
        refreshRSSFeed(feed).catch(() => {});
      }
    }
  }
}
