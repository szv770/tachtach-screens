import fetch from "node-fetch";
import { SEFER_HE, hNum } from "../shared/constants.js";

const UA = "Mozilla/5.0 (compatible; TachTach-Screens/1.0)";

/**
 * Fetch daily study calendar from Sefaria.
 * Extracts Daily Rambam (1ch), Daily Rambam (3ch), Tanya Yomi, and Parsha.
 * @returns {Promise<{rambam1: object, rambam3: object, tanyaYomi: object, parsha: object|null}|null>}
 */
export async function fetchDailyStudy() {
  try {
    const url = "https://www.sefaria.org/api/calendars?diaspora=1&custom=ashkenazi";
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const items = data.calendar_items || [];
    const find = (title) => items.find(i => i.title?.en === title);

    const r1 = find("Daily Rambam");
    const r3 = find("Daily Rambam (3 Chapters)");
    const ty = find("Tanya Yomi");
    const parshaItem = find("Parashat Hashavua");

    const extract = (item) => {
      if (!item) return null;
      return {
        title_url: item.url || "",
        ref: item.ref || "",
        heRef: item.heRef || "",
        description: item.description?.en || "",
      };
    };

    // Extract parsha from Sefaria
    let parsha = null;
    if (parshaItem) {
      parsha = {
        name: parshaItem.displayValue?.en || "",
        hebrew: parshaItem.displayValue?.he || "",
        date: parshaItem.date || "",
      };
    }

    return {
      rambam1: extract(r1),
      rambam3: extract(r3),
      tanyaYomi: extract(ty),
      parsha,
    };
  } catch (err) {
    console.error("[sefaria] fetchDailyStudy failed:", err.message);
    return null;
  }
}

/**
 * Parse all chapter numbers from a Sefaria Mishneh Torah ref string.
 * Handles single-tractate ("Mishneh Torah, Sotah 4") and
 * multi-tractate ("Mishneh Torah, Sotah 4, Forbidden Intercourse 1-2") refs.
 * Returns an array of chapter numbers in reading order.
 */
function parseChaptersFromRef(ref) {
  const body = ref.replace(/^Mishneh Torah,\s*/i, '');
  const segments = body.split(/,\s*/);
  const chapNums = [];
  for (const seg of segments) {
    const match = seg.match(/(\d+)(?:[–\-](\d+))?$/);
    if (match) {
      const from = parseInt(match[1]);
      const to = match[2] ? parseInt(match[2]) : from;
      for (let i = from; i <= to; i++) chapNums.push(i);
    }
  }
  return chapNums;
}

/**
 * Fetch detailed Rambam text metadata from Sefaria.
 * @param {string} ref — Sefaria text reference (e.g. "Mishneh Torah, Rest on a Holiday 1")
 * @returns {Promise<{sefer: string, seferHe: string, hilchos: string, heRef: string, chapters: string[]}|null>}
 */
export async function fetchRambamDetails(ref) {
  try {
    const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?context=0&pad=0&commentary=0`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const categories = data.categories || [];
    const seferName = categories[2] || "";
    const seferHe = SEFER_HE[seferName] || seferName;
    const hilchos = data.book || "";
    const heRef = data.heRef || "";

    const chaptersArabic = parseChaptersFromRef(ref);
    const chapters = chaptersArabic.map(hNum);

    return { sefer: seferName, seferHe, hilchos, heRef, chapters, chaptersArabic };
  } catch (err) {
    console.error("[sefaria] fetchRambamDetails failed:", err.message);
    return null;
  }
}
