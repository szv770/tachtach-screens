import fetch from "node-fetch";

const SUPABASE_URL = process.env.MIVTZAH_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.MIVTZAH_SUPABASE_ANON_KEY;

/**
 * Fetch the Mivtzah program leaderboard from Supabase RPC.
 * Returns an array of { full_name, short_code, level, total_points } sorted by
 * total_points DESC, or null on any failure (so callers can keep stale data).
 *
 * @returns {Promise<Array<object>|null>}
 */
export async function fetchMivtzahLeaderboard() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("[mivtzah] MIVTZAH_SUPABASE_URL or MIVTZAH_SUPABASE_ANON_KEY not configured — skipping fetch");
    return null;
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/rpc/kiosk_get_leaderboard`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[mivtzah] Supabase RPC returned HTTP ${resp.status}: ${body}`);
      return null;
    }

    const data = await resp.json();
    if (!Array.isArray(data)) {
      console.error("[mivtzah] Unexpected response shape — expected array, got:", typeof data);
      return null;
    }

    return data;
  } catch (err) {
    console.error("[mivtzah] fetchMivtzahLeaderboard failed:", err.message);
    return null;
  }
}
