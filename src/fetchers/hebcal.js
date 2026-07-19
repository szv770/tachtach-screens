import fetch from "node-fetch";

const UA = "Mozilla/5.0 (compatible; TachTach-Screens/1.0)";

/**
 * Fetch Hebrew date from Hebcal converter API.
 * @param {Date} [date] — defaults to today
 * @returns {Promise<{hebrew: string, hebrewYear: number, hebrewMonth: string, hebrewDay: number, events: string[]}|null>}
 */
export async function fetchHebrewDate(date) {
  try {
    const d = date || new Date();
    const gd = d.getDate();
    const gm = d.getMonth() + 1;
    const gy = d.getFullYear();

    const url = `https://www.hebcal.com/converter?cfg=json&gd=${gd}&gm=${gm}&gy=${gy}&g2h=1`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // Remove the "ב" prefix from the month name in the Hebrew date string
    // e.g. "ו׳ בְּאִיָיר" → "ו׳ אִיָיר"
    // The ב may carry niqqud marks (shva, dagesh, etc.) in the range U+0590–U+05CF
    let hebrew = data.hebrew || "";
    hebrew = hebrew.replace(/\s+ב[\u0590-\u05CF]*(?=[א-ת])/, ' ');

    return {
      hebrew,
      hebrewYear: data.hy || 0,
      hebrewMonth: data.hm || "",
      hebrewDay: data.hd || 0,
      events: data.events || [],
      omer: typeof data.omer === 'number' ? data.omer : null,
    };
  } catch (err) {
    console.error("[hebcal] fetchHebrewDate failed:", err.message);
    return null;
  }
}

/**
 * Fetch upcoming parsha from Hebcal.
 * @param {string} zip — US ZIP code
 * @returns {Promise<{name: string, hebrew: string, date: string}|null>}
 */
export async function fetchParsha(zip, date) {
  try {
    const now = date || new Date();
    const nextWeekDate = new Date(now);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);

    const fmt = (d) => d.toISOString().slice(0, 10);
    const today = fmt(now);
    const nextWeek = fmt(nextWeekDate);

    const url = `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&nx=on&ss=on&mf=off&c=off&geo=zip&zip=${zip}&M=on&s=on&start=${today}&end=${nextWeek}`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const items = data.items || [];
    const parashat = items.find(item => item.category === "parashat");
    if (!parashat) return null;

    return {
      name: parashat.title || "",
      hebrew: parashat.hebrew || "",
      date: parashat.date || "",
    };
  } catch (err) {
    console.error("[hebcal] fetchParsha failed:", err.message);
    return null;
  }
}

/**
 * Fetch the Omer count if we are in the Omer season.
 * Uses the Hebrew date to determine if 16 Nisan <= today <= 5 Sivan.
 * @returns {Promise<{count: number}|null>}
 */
export async function fetchOmer() {
  try {
    const hebDate = await fetchHebrewDate();
    if (!hebDate) return null;

    // Prefer Hebcal's own omer count (included in converter API response)
    if (typeof hebDate.omer === 'number' && hebDate.omer > 0) {
      return { count: hebDate.omer };
    }

    // Fallback: calculate from Hebrew date
    const { hebrewMonth, hebrewDay } = hebDate;
    let count = null;

    if (hebrewMonth === "Nisan" && hebrewDay >= 16) {
      count = hebrewDay - 15;
    } else if (hebrewMonth === "Iyyar") {
      count = 15 + hebrewDay;
    } else if (hebrewMonth === "Sivan" && hebrewDay <= 5) {
      count = 44 + hebrewDay;
    }

    if (count === null) return null;
    return { count };
  } catch (err) {
    console.error("[hebcal] fetchOmer failed:", err.message);
    return null;
  }
}
