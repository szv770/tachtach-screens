import fetch from "node-fetch";

const UA = "Mozilla/5.0 (compatible; TachTach-Screens/1.0)";

/**
 * Fetch daily learning data from TorahCalc API.
 * @param {Date} [date] — defaults to today (no date param sent to API)
 * @returns {Promise<{pirkeiAvos, rambam1, rambam3, seferHamitzvot}|null>}
 */
export async function fetchTorahCalc(date) {
  try {
    let url = "https://www.torahcalc.com/api/dailylearning";
    if (date) {
      const yyyy = date.getFullYear();
      const mm   = String(date.getMonth() + 1).padStart(2, '0');
      const dd   = String(date.getDate()).padStart(2, '0');
      url += `?date=${yyyy}-${mm}-${dd}`;
    }
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const d = data?.data;

    return {
      pirkeiAvos: d?.pirkeiAvot
        ? { name: d.pirkeiAvot.name || '', hebrewName: d.pirkeiAvot.hebrewName || '' }
        : null,
      rambam1: d?.dailyRambam
        ? { displayEn: d.dailyRambam.name || '', displayHe: d.dailyRambam.hebrewName || '' }
        : null,
      rambam3: d?.dailyRambam3
        ? { displayEn: d.dailyRambam3.name || '', displayHe: d.dailyRambam3.hebrewName || '' }
        : null,
      seferHamitzvot: d?.dailySeferHamitzvos
        ? { displayEn: d.dailySeferHamitzvos.name || '', displayHe: d.dailySeferHamitzvos.hebrewName || '' }
        : null,
    };
  } catch (err) {
    console.error("[torahcalc] fetchTorahCalc failed:", err.message);
    return null;
  }
}
