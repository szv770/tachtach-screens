/**
 * Menu slide fit model (pure, so it can be tested at the extremes without a browser).
 *
 * The Today view never drops or cuts a dish (allergy safety, spec 05 section 4.1). Dish text starts at the first tier and
 * shrinks (all cards together) to the floor; if the longest card still does not fit, fewer meal cards go on a page
 * (the rest follow on the next page); if one meal alone still does not fit, its dishes are shared over several pages.
 * The slide measures the real boxes (src/screen/components/slides/MenuSlide.jsx) and asks `nextFit` for the next step.
 */

/** Dish text sizes in canvas px, largest first; the last is the floor (spec 4.1: 38 down to 28). */
export const TIERS = Object.freeze([38, 34, 31, 28]);
/** How many pages one meal's dishes may be shared over, step by step (20 is one dish a page: always fits). */
export const PART_STEPS = Object.freeze([2, 3, 4, 6, 8, 12, 20]);
export const COLUMNS = Object.freeze({ landscape: 4, portrait: 3 });
export const PAGE_SECONDS = 9;
export const WEEK_SECONDS = 8;
export const MIN_TODAY_SECONDS = 12;

/** @returns {Array<Array<{ meal: object, items: object[], part: number, parts: number }>>} pages of cards */
export function planPages(meals, { group, parts = 1 }) {
  const list = (meals || []).filter((m) => m?.items?.length);
  if (!list.length) return [];
  if (parts > 1) {
    const pages = [];
    for (const meal of list) {
      const n = Math.min(parts, meal.items.length);
      const per = Math.ceil(meal.items.length / n);
      for (let i = 0; i < n; i++) pages.push([{ meal, items: meal.items.slice(i * per, (i + 1) * per), part: i + 1, parts: n }]);
    }
    return pages;
  }
  const g = Math.max(1, Math.floor(group) || 1);
  const pages = [];
  // balanced pages: 5 meals at a group of 4 = 3 + 2, not 4 + 1
  const n = Math.ceil(list.length / g);
  const size = Math.ceil(list.length / n);
  for (let i = 0; i < list.length; i += size) pages.push(list.slice(i, i + size).map((meal) => ({ meal, items: meal.items, part: 1, parts: 1 })));
  return pages;
}

/** Start of the search: the biggest text, as many cards per page as the shape allows. */
export const startFit = (mealCount, portrait) => ({ tier: 0, group: Math.max(1, Math.min(mealCount, portrait ? COLUMNS.portrait : COLUMNS.landscape)), parts: 1, compact: false });

/** The step after "this does not fit": smaller text, then fewer cards per page, then dishes over pages. Null = nothing left. */
export function nextFit(s) {
  if (s.parts > 1) { const nx = PART_STEPS.find((p) => p > s.parts); return nx ? { ...s, parts: nx } : null; }
  // before the text shrinks, the tag chips shrink to their short code (a legend under the cards spells them out)
  if (!s.compact) return { ...s, compact: true };
  if (s.tier < TIERS.length - 1) return { ...s, tier: s.tier + 1, compact: false };
  if (s.group > 1) return { tier: 0, group: s.group - 1, parts: 1, compact: false };
  return { tier: 0, group: 1, parts: PART_STEPS[0], compact: false };
}

/** Seconds the Today pages need together (one page = 9 s, never under 12 s), plus the week page. */
export function todaySeconds(pageCount) { return Math.max(MIN_TODAY_SECONDS, pageCount * PAGE_SECONDS); }

/** Week view text sizes (canvas px): 30 down to the 26 floor, then fewer dishes per cell ("+N more"). */
export const WEEK_TIERS = Object.freeze([30, 28, 26]);
/** Lines one dish name may take in a Week cell as the very last resort (0 = no limit). The Week view is an overview: Today shows every dish whole. */
export const WEEK_CLAMPS = Object.freeze([0, 4, 3, 2, 1]);
export const startWeekFit = (cap) => ({ tier: 0, cap: Math.max(1, Math.min(8, Math.floor(cap) || 3)), clamp: 0 });
export function nextWeekFit(s) {
  if (s.tier < WEEK_TIERS.length - 1) return { ...s, tier: s.tier + 1 };
  if (s.cap > 1) return { ...s, cap: s.cap - 1 };
  const i = WEEK_CLAMPS.indexOf(s.clamp || 0);
  return i < WEEK_CLAMPS.length - 1 ? { ...s, clamp: WEEK_CLAMPS[i + 1] } : null;
}
/** The dishes a Week cell shows and how many were left out. */
export function weekCell(items, cap) {
  const list = items || [];
  if (list.length <= cap) return { shown: list, more: 0 };
  // "+1 more" would take a whole line to say what one dish says: show it instead
  const keep = list.length - cap === 1 ? cap + 1 : cap;
  return { shown: list.slice(0, keep), more: list.length - keep };
}
