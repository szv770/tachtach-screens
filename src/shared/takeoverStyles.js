/**
 * Takeover / announcement STYLES (round 3b, 26 styles) and the per-announcement
 * Animation setting. Pure data + helpers shared by the server model (whitelist),
 * the admin composer (picker) and the kiosk (rendering). The visuals live in
 * src/screen/takeover/ and src/screen/design/announceStyles.js.
 */

export const STYLE_GROUPS = [
  { id: 'everyday', label: 'Everyday', ids: ['classic', 'grand', 'sleek', 'quiet', 'trip', 'mivtzoim', 'hype'] },
  { id: 'alerts', label: 'Alerts', ids: ['emergency', 'urgent', 'schedule', 'phone'] },
  { id: 'moments', label: 'Moments', ids: ['celebration', 'simcha', 'siyum', 'torah', 'memorial', 'welcome', 'farbrengen'] },
  { id: 'shabbos', label: 'Shabbos & Yom Tov', ids: ['shabbos', 'yomtov'] },
  { id: 'seasonal', label: 'Seasonal', ids: ['chanukah', 'purim', 'pesach', 'roshchodesh', 'lagbaomer', 'chassidic'] },
];

/** id, picker label, one-line purpose (README "Styles" table). */
export const STYLE_INFO = {
  classic: ['Classic', 'Clean default'],
  grand: ['Grand', 'Dinners, formal'],
  sleek: ['Sleek', 'Modern time notice'],
  quiet: ['Quiet', 'Gentle notices'],
  trip: ['Trip', 'Trips and buses'],
  mivtzoim: ['Mivtzoim', 'Outreach'],
  hype: ['Hype', 'Countdowns'],
  emergency: ['Emergency', 'Drills, safety'],
  urgent: ['Important', 'Calm but urgent'],
  schedule: ['Time change', 'Schedule changes'],
  phone: ['Phones away', 'Phones away'],
  celebration: ['Celebration', 'Mazel tov'],
  simcha: ['Simcha', 'Birthdays'],
  siyum: ['Siyum', 'Siyum, hadran'],
  torah: ['Torah', 'Pasuk, ma’amar'],
  memorial: ['Memorial', 'Yahrzeit'],
  welcome: ['Welcome', 'Guests, parents'],
  farbrengen: ['Farbrengen', 'Farbrengens'],
  shabbos: ['Shabbos', 'Candle lighting, havdalah'],
  yomtov: ['Yom Tov', 'Chag greetings'],
  chanukah: ['Chanukah', 'Menorah'],
  purim: ['Purim', 'Crown and hamantaschen'],
  pesach: ['Pesach', 'Four cups'],
  roshchodesh: ['Rosh Chodesh', 'Moon phases'],
  lagbaomer: ['Lag BaOmer', 'Bonfire'],
  chassidic: ['Chassidic', 'Yud-Tes Kislev and more'],
};

export const STYLE_IDS = STYLE_GROUPS.flatMap((g) => g.ids);

/** Old style names that now map onto a current one (data written by older builds). */
export const STYLE_ALIASES = { notice: 'urgent' };

/**
 * Normalise a stored style id. null / '' stay null (= "Theme": the screen's own
 * colours, rendered as Classic). Old ids keep their meaning (the 11 pre-round-3
 * styles exist under the same name); aliases map; anything unknown -> 'classic'.
 */
export function normalizeStyleId(id) {
  if (id == null || id === '') return null;
  const v = STYLE_ALIASES[id] || id;
  return STYLE_IDS.includes(v) ? v : 'classic';
}

/** The style actually drawn (null "Theme" draws Classic). */
export function renderStyleId(id) {
  return normalizeStyleId(id) || 'classic';
}

// ── Animation ───────────────────────────────────────────────────────────────

export const ANIMATIONS = ['full', 'entrance', 'off'];
export const DEFAULT_ANIMATION = 'full';
export const ANIMATION_LABEL = { full: 'Full (entrance + gentle loops)', entrance: 'Entrance only', off: 'Off (still)' };

/** Whitelist a stored look.animation (anything unknown -> 'full'). */
export function normalizeAnimation(v) {
  return ANIMATIONS.includes(v) ? v : DEFAULT_ANIMATION;
}

/**
 * Per-announcement Animation x the global settings.motion:
 *   smooth = full, minimal = entrance only, lively = full + extras (words and
 *   digits reveal one by one, bigger overshoot). The stricter of the two wins,
 *   so an item set to "Off" is still, and "Full" on a minimal screen is entrance only.
 * Returns { anim: 'full'|'entrance'|'off', lively: boolean }.
 */
export function effectiveAnimation(itemAnimation, motion) {
  const a = normalizeAnimation(itemAnimation);
  const m = motion === 'minimal' || motion === 'lively' ? motion : 'smooth';
  let anim = a;
  if (m === 'minimal' && a === 'full') anim = 'entrance';
  return { anim, lively: m === 'lively' && anim !== 'off' };
}

// ── Soft composer limits (README "Composer limits that the audit proves") ───
// Hints only; the composer never blocks on them.

export const SOFT_LIMITS = {
  titleHe: 45, titleEn: 100, place: 40, listHeading: 45, listItems: 6, quickName: 30,
  bigHe: 45, bigEn: 100, quoteHe: 90, quoteEn: 160, attribution: 60, kicker: 30,
};
