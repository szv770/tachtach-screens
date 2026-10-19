// What size should pictures be for THIS screen? Pure helpers (no DOM, no Node APIs) so the
// server, the admin and the tests share them. The kiosk reports its real viewport to the
// server (POST /api/screen/report, localhost only); the admin reads it back inside /api/state.
//
//   display = { width, height, dpr, orientation, canvas: { width, height }, reportedAt }
//   width x height are DEVICE pixels (CSS viewport x devicePixelRatio): what the panel really shows.

const MIN_PX = 200;
const MAX_PX = 16384;
const FALLBACK_LANDSCAPE = { width: 1920, height: 1080 };
const FALLBACK_PORTRAIT = { width: 1080, height: 1920 };

const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
const inRange = (n) => n >= MIN_PX && n <= MAX_PX;

/** Clean a report from the kiosk. Returns null (ignore it) unless the numbers are sane. */
export function sanitizeDisplay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const width = int(raw.width);
  const height = int(raw.height);
  if (!inRange(width) || !inRange(height)) return null;
  const dprN = Number(raw.dpr);
  const dpr = Number.isFinite(dprN) && dprN >= 0.5 && dprN <= 8 ? Math.round(dprN * 100) / 100 : 1;
  const out = { width, height, dpr, orientation: height > width ? 'portrait' : 'landscape' };
  const cw = int(raw.canvas?.width);
  const ch = int(raw.canvas?.height);
  if (inRange(cw) && inRange(ch)) out.canvas = { width: cw, height: ch };
  return out;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** "16:9", "9:16", "16:10", "4:3" ... or a decimal like "1.85:1" when it is not a tidy shape. */
export function ratioLabel(width, height) {
  const r = width / height;
  const known = [[16, 9], [9, 16], [16, 10], [10, 16], [4, 3], [3, 4], [3, 2], [2, 3], [21, 9], [9, 21], [1, 1], [5, 4], [4, 5]];
  for (const [a, b] of known) if (Math.abs(r - a / b) < 0.02) return `${a}:${b}`;
  const g = gcd(width, height);
  const a = width / g;
  const b = height / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  return r >= 1 ? `${(Math.round(r * 100) / 100)}:1` : `1:${(Math.round((1 / r) * 100) / 100)}`;
}

/**
 * The size to aim for. `display` = what the kiosk last reported (or null); `orientation` = the
 * saved setting, used only when no screen has reported yet.
 */
export function recommendedSize(display, orientation) {
  const d = display && inRange(display.width) && inRange(display.height) ? display : null;
  if (d) {
    return {
      width: d.width, height: d.height, orientation: d.height > d.width ? 'portrait' : 'landscape',
      ratio: ratioLabel(d.width, d.height), source: 'measured', reportedAt: d.reportedAt || null,
    };
  }
  const base = orientation === 'portrait' ? FALLBACK_PORTRAIT : FALLBACK_LANDSCAPE;
  return { ...base, orientation: base.height > base.width ? 'portrait' : 'landscape', ratio: ratioLabel(base.width, base.height), source: 'default', reportedAt: null };
}

/** Margin to keep key content away from the edges (TV overscan, cropping). */
export const SAFE_MARGIN_PERCENT = 5;

/** Pixel size of a "safe area" for the recommended size, e.g. 3456x1944 for 3840x2160. */
export function safeArea(rec, percent = SAFE_MARGIN_PERCENT) {
  const k = 1 - (2 * percent) / 100;
  return { width: Math.round(rec.width * k), height: Math.round(rec.height * k) };
}

/** "3840x2160" with a real multiplication sign. */
export const sizeText = (w, h) => `${w}×${h}`;

/**
 * The box uploaded pictures are shrunk into (never enlarged). Measured screens get their own
 * size (capped at 4K); until a screen reports we keep the long-standing 1920x1080 box
 * (1080x1920 for a portrait setting).
 */
export function uploadBox(display, orientation) {
  const rec = recommendedSize(display, orientation);
  return { width: Math.min(rec.width, 3840), height: Math.min(rec.height, 3840) };
}

/**
 * Non-blocking advice about an image's pixel size. Returns null when it is fine, else
 * { level: 'info', kind: 'small' | 'shape', message }.
 * - small: shown at its best fit it would have to be enlarged more than ~1.5x (soft / pixelated).
 * - shape: its shape is very different from the screen's (bars or cropping).
 */
export function imageAdvice(imgW, imgH, rec) {
  const w = Number(imgW);
  const h = Number(imgH);
  if (!(w > 0) || !(h > 0) || !rec) return null;
  const scale = Math.min(rec.width / w, rec.height / h);
  if (scale > 1.5) {
    return { level: 'info', kind: 'small', message: `This picture is small (${sizeText(w, h)}) for a ${sizeText(rec.width, rec.height)} screen, so it may look soft. A larger original looks sharper.` };
  }
  const shape = (w / h) / (rec.width / rec.height);
  if (shape > 1.6 || shape < 1 / 1.6) {
    const mine = w / h > 1 ? 'wide' : 'tall';
    const screen = rec.width / rec.height > 1 ? 'wide' : 'tall';
    return { level: 'info', kind: 'shape', message: `This picture is ${mine} and your screen is ${screen}, so it will show with bars at the sides (Fit) or be cropped (Fill).` };
  }
  return null;
}
