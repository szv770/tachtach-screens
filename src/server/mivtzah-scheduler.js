import { fetchMivtzahLeaderboard } from "../fetchers/mivtzah.js";
import { readJSON, writeJSON } from "./storage.js";
import { broadcast } from "./sse.js";

const INTERVAL_MS = 60 * 1000; // 60 seconds
const CACHE_FILE = "cache.json";

let _timer = null;

/**
 * Run one leaderboard fetch cycle:
 * - Calls Supabase RPC
 * - If successful, merges result into data/cache.json under the `mivtzah` key
 * - Broadcasts a cache-refresh SSE event so connected screens update immediately
 */
async function tick() {
  const result = await fetchMivtzahLeaderboard();
  if (result === null) {
    // Fetch failed — keep stale data, no broadcast
    return;
  }

  try {
    const existing = (await readJSON(CACHE_FILE)) || {};
    const mivtzah = {
      leaderboard: result,
      fetchedAt: new Date().toISOString(),
    };
    const updated = { ...existing, mivtzah };
    await writeJSON(CACHE_FILE, updated);
    broadcast("cache-refresh", updated);
    console.log(`[mivtzah-scheduler] Leaderboard updated — ${result.length} bochurim`);
  } catch (err) {
    console.error("[mivtzah-scheduler] Failed to write cache:", err.message);
  }
}

/**
 * Start the Mivtzah leaderboard scheduler.
 * - Does an immediate fetch on startup (no 60-second wait for first data)
 * - Then polls every 60 seconds
 * - If env vars are missing, logs a warning and does NOT start
 */
export function startMivtzahScheduler() {
  const url = process.env.MIVTZAH_SUPABASE_URL;
  const key = process.env.MIVTZAH_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn("[mivtzah-scheduler] MIVTZAH_SUPABASE_URL or MIVTZAH_SUPABASE_ANON_KEY is not set — leaderboard scheduler will not start");
    return;
  }

  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }

  // Immediate startup fetch
  tick().catch((err) => console.error("[mivtzah-scheduler] Startup fetch error:", err.message));

  // Recurring interval
  _timer = setInterval(() => {
    tick().catch((err) => console.error("[mivtzah-scheduler] Tick error:", err.message));
  }, INTERVAL_MS);

  console.log("[mivtzah-scheduler] Started — polling every 60 seconds");
}
