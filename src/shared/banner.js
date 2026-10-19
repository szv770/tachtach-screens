/**
 * Banner display rules. Pure (no DOM) so the kiosk, the admin and the tests agree.
 *
 * Each banner is Still (never moves; long text shrinks to fit) or Scrolling (a
 * continuous right-to-left ticker) with a speed. A banner left on "Same as
 * default" follows `settings.banner.mode` / `.speed`, which default to Still / Normal.
 */
export const BANNER_MODES = ['still', 'scroll'];
export const BANNER_SPEEDS = ['slow', 'normal', 'fast'];
export const SPEED_PX_PER_SEC = { slow: 70, normal: 110, fast: 170 };
/** Smallest a Still banner may shrink to before it is clipped (fraction of full size). */
export const STILL_MIN_SCALE = 0.5;

export const modeOrDefault = (v, fallback = 'still') => (BANNER_MODES.includes(v) ? v : (BANNER_MODES.includes(fallback) ? fallback : 'still'));

/**
 * What the banner row does. `rows` = [{ bannerMode?, bannerSpeed? }] (several banners share one row:
 * if any of them scrolls, the row scrolls, at the first scrolling banner's speed).
 * `motion` = settings.motion: 'minimal' turns scrolling into still.
 */
export function bannerPlan(rows, settings = {}, motion = 'smooth') {
  const list = rows || [];
  const defMode = modeOrDefault(settings?.mode, 'still');
  const defSpeed = BANNER_SPEEDS.includes(settings?.speed) ? settings.speed : 'normal';
  const scrolling = list.find((r) => modeOrDefault(r.bannerMode, defMode) === 'scroll');
  const wantsScroll = !!scrolling && motion !== 'minimal';
  const speed = BANNER_SPEEDS.includes(scrolling?.bannerSpeed) ? scrolling.bannerSpeed : defSpeed;
  return { mode: wantsScroll ? 'scroll' : 'still', speed, pxPerSec: SPEED_PX_PER_SEC[speed] };
}

/**
 * Geometry of the seamless loop. `contentW` = one copy of the text, `boxW` = the visible width.
 * The track holds `copies` copies spaced `period` apart and slides left by exactly one period,
 * so the last frame equals the first and there is no jump.
 */
export function tickerGeometry(contentW, boxW, pxPerSec) {
  const gap = Math.max(160, Math.round(boxW * 0.2));
  const period = Math.max(1, Math.round(contentW + gap));
  const copies = Math.max(2, Math.ceil(boxW / period) + 1);
  const seconds = Math.max(6, Math.round((period / Math.max(20, pxPerSec)) * 10) / 10);
  return { gap, period, copies, seconds };
}

/** Scale (0.5..1) that makes a Still banner fit one line. */
export function stillScale(contentW, availW) {
  if (!(contentW > 0) || !(availW > 0)) return 1;
  return Math.max(STILL_MIN_SCALE, Math.min(1, availW / contentW));
}
