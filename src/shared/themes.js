/**
 * Screen themes — the single registry (kiosk, admin picker, server migration).
 *
 * Every theme is defined by FIVE base values only (bg, text, dim, muted, gold
 * = the accent). Everything else the display paints with is derived:
 *   - design roles (src/screen/design/roles.js): --raised, --hi, --onAccent …
 *     as CSS color-mix() of these, so all themes and the day/night crossfade
 *     work with no per-theme tuning (docs/design/2026-10-14-mockups-r2/README.md §1)
 *   - the legacy token keys older components and the admin still read
 *     (goldBg, goldBd, surface, copper, framePrimary, frameSecondary), via
 *     legacyTokens() below.
 *
 * Families are what the admin shows (Dark / Light). The display picks light
 * vs dark derivation by luminance, not by the family label.
 *
 * History: `sepia` used to be a dark brown page filed under Light. Since
 * 2026-10-14 `sepia` is a true light sepia and the old look is `walnut`
 * (Dark). migrateThemeSettings() maps old settings once (themeVersion 2).
 */

export const THEMES = [
  // ── Dark ──────────────────────────────────────────────────────────────────
  { id: 'dark', name: 'Classic Dark', family: 'dark', note: 'Warm cream on near-black, gold accent',
    bg: '#12100C', text: '#EFE3C0', dim: 'rgba(239,227,192,.60)', muted: 'rgba(239,227,192,.30)', gold: '#D4A84B' },
  { id: 'dark-hc', name: 'Dark High-Contrast', family: 'dark', note: 'Brighter text for far viewing',
    bg: '#0D0B08', text: '#F5EDD5', dim: 'rgba(245,237,213,.78)', muted: 'rgba(245,237,213,.48)', gold: '#E8BD5A' },
  { id: 'midnight', name: 'Midnight', family: 'dark', note: 'Deep navy, sky-blue accent',
    bg: '#0B1120', text: '#E0E8F5', dim: 'rgba(224,232,245,.75)', muted: 'rgba(224,232,245,.40)', gold: '#7EB8E0' },
  { id: 'graphite', name: 'Graphite', family: 'dark', note: 'Neutral near-black, amber accent',
    bg: '#111214', text: '#ECEDEF', dim: 'rgba(236,237,239,.64)', muted: 'rgba(236,237,239,.32)', gold: '#F0B44C' },
  { id: 'walnut', name: 'Walnut', family: 'dark', note: 'Dark brown wood, cream text (the old "Sepia")',
    bg: '#2A2118', text: '#F0DFC0', dim: 'rgba(240,223,192,.75)', muted: 'rgba(240,223,192,.40)', gold: '#D4A84B' },
  { id: 'forest', name: 'Forest', family: 'dark', note: 'Deep green-black, brass accent',
    bg: '#0E1613', text: '#E6EEE8', dim: 'rgba(230,238,232,.66)', muted: 'rgba(230,238,232,.32)', gold: '#D7B46A' },
  { id: 'ocean', name: 'Ocean', family: 'dark', note: 'Blue-black, teal accent',
    bg: '#08141C', text: '#DDEBF2', dim: 'rgba(221,235,242,.68)', muted: 'rgba(221,235,242,.34)', gold: '#4FC3C9' },
  { id: 'plum', name: 'Plum', family: 'dark', note: 'Aubergine, honey accent',
    bg: '#150E18', text: '#EFE5F1', dim: 'rgba(239,229,241,.66)', muted: 'rgba(239,229,241,.32)', gold: '#E6B262' },
  { id: 'slate', name: 'Slate', family: 'dark', note: 'Cool blue-grey, periwinkle accent',
    bg: '#151A21', text: '#E5EAF0', dim: 'rgba(229,234,240,.66)', muted: 'rgba(229,234,240,.32)', gold: '#93B4FF' },
  { id: 'onyx', name: 'Onyx', family: 'dark', note: 'True black (OLED), sunflower accent',
    bg: '#000000', text: '#F2F2F0', dim: 'rgba(242,242,240,.64)', muted: 'rgba(242,242,240,.32)', gold: '#FFC857' },

  // ── Light ─────────────────────────────────────────────────────────────────
  { id: 'parchment', name: 'Parchment', family: 'light', note: 'Warm parchment, dark brown accent',
    bg: '#F0E4C4', text: '#1C0E05', dim: 'rgba(28,14,5,.60)', muted: 'rgba(28,14,5,.30)', gold: '#8B5E00' },
  { id: 'sepia', name: 'Sepia', family: 'light', note: 'Light sepia paper, umber accent',
    bg: '#EADCC2', text: '#2A1E10', dim: 'rgba(42,30,16,.62)', muted: 'rgba(42,30,16,.30)', gold: '#8A5A1A' },
  { id: 'clean-white', name: 'Clean White', family: 'light', note: 'Minimal white, steel-blue accent',
    bg: '#F7F8FA', text: '#1A1D23', dim: 'rgba(26,29,35,.58)', muted: 'rgba(26,29,35,.25)', gold: '#3B6B96' },
  { id: 'ivory', name: 'Ivory', family: 'light', note: 'Warm cream, muted gold accent',
    bg: '#F5F0E6', text: '#2C1E0E', dim: 'rgba(44,30,14,.58)', muted: 'rgba(44,30,14,.25)', gold: '#9B7530' },
  { id: 'sky', name: 'Sky', family: 'light', note: 'Blue-white, teal accent',
    bg: '#EDF4FA', text: '#0F1E33', dim: 'rgba(15,30,51,.58)', muted: 'rgba(15,30,51,.25)', gold: '#1A7A7A' },
  { id: 'stone', name: 'Stone', family: 'light', note: 'Warm grey-white, deep green accent',
    bg: '#ECEBE6', text: '#1B1C1E', dim: 'rgba(27,28,30,.60)', muted: 'rgba(27,28,30,.28)', gold: '#2F6B53' },
  { id: 'sage', name: 'Sage', family: 'light', note: 'Soft green-grey, slate-blue accent',
    bg: '#E6ECE5', text: '#18241D', dim: 'rgba(24,36,29,.60)', muted: 'rgba(24,36,29,.28)', gold: '#2E6386' },
  { id: 'linen', name: 'Linen', family: 'light', note: 'Off-white linen, terracotta accent',
    bg: '#F4EFE7', text: '#231C17', dim: 'rgba(35,28,23,.60)', muted: 'rgba(35,28,23,.28)', gold: '#A8492A' },
  { id: 'rose', name: 'Rose', family: 'light', note: 'Blush white, berry accent',
    bg: '#F6ECEB', text: '#2B1A1D', dim: 'rgba(43,26,29,.60)', muted: 'rgba(43,26,29,.28)', gold: '#9E3653' },
  { id: 'lavender', name: 'Lavender', family: 'light', note: 'Pale lilac, indigo accent',
    bg: '#EEEDF6', text: '#1D1B2E', dim: 'rgba(29,27,46,.60)', muted: 'rgba(29,27,46,.28)', gold: '#4F43A8' },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
export const DEFAULT_THEME = 'dark';
export const DEFAULT_DAY_THEME = 'sky';
export const DEFAULT_NIGHT_THEME = 'midnight';

/** Themes grouped for pickers: [{ family, label, themes }]. */
export function themeFamilies() {
  return [
    { family: 'dark', label: 'Dark', themes: THEMES.filter((t) => t.family === 'dark') },
    { family: 'light', label: 'Light', themes: THEMES.filter((t) => t.family === 'light') },
  ];
}

// ── colour math (no DOM; shared with the server) ─────────────────────────────

function parseHex(h) {
  const s = String(h || '').trim().replace('#', '');
  const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
const toHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

export function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const c = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Light derivation is chosen by luminance, never by family label. */
export function isLightBg(bg) { return luminance(bg) > 0.4; }

function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  if (!A || !B) return a;
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

/**
 * The five base values for a theme id (custom → base theme with the admin's
 * accent). Unknown ids fall back to the default dark theme.
 */
export function baseTheme(id, customTheme) {
  if (id === 'custom' && customTheme) {
    const base = THEME_BY_ID[migrateThemeId(customTheme.base)] || THEME_BY_ID[DEFAULT_THEME];
    const gold = parseHex(customTheme.primary) ? customTheme.primary : base.gold;
    return { ...base, id: 'custom', name: 'Custom', gold };
  }
  return THEME_BY_ID[id] || THEME_BY_ID[DEFAULT_THEME];
}

/**
 * Legacy token object ({bg,text,dim,muted,gold,goldBg,goldBd,surface,copper,
 * framePrimary,frameSecondary}) — what `getTokens()` has always returned.
 * Kept for the admin and any component not yet on the design roles.
 */
export function legacyTokens(theme) {
  const g = parseHex(theme.gold) || [212, 168, 75];
  const t = parseHex(theme.text) || [239, 227, 192];
  const light = isLightBg(theme.bg);
  return {
    bg: theme.bg,
    text: theme.text,
    dim: theme.dim,
    muted: theme.muted,
    gold: theme.gold,
    goldBg: rgba(g, light ? 0.11 : 0.13),
    goldBd: rgba(g, light ? 0.38 : 0.42),
    surface: rgba(light ? g : t, light ? 0.04 : 0.045),
    copper: mix(theme.gold, light ? '#000000' : '#000000', 0.18),
    framePrimary: rgba(g, light ? 0.15 : 0.16),
    frameSecondary: rgba(g, light ? 0.30 : 0.32),
  };
}

/**
 * Base design roles for a theme — the 8 registered, crossfadable CSS custom
 * properties (README §1). onAccent is bg or white, whichever reads better on
 * the accent; the surface lifts toward text on dark pages, toward white on
 * light ones.
 */
export function baseRoles(theme) {
  const light = isLightBg(theme.bg);
  const onAccent = contrast(theme.gold, theme.bg) >= contrast(theme.gold, '#FFFFFF') ? theme.bg : '#FFFFFF';
  return {
    light,
    vars: {
      '--bg': theme.bg,
      '--text': theme.text,
      '--dim': theme.dim,
      '--muted': theme.muted,
      '--accent': theme.gold,
      '--onAccent': onAccent,
      '--lift': light ? '#FFFFFF' : theme.text,
      '--liftPct': light ? '72%' : '6%',
    },
  };
}

/** Best-effort theme id for a legacy tokens object (admin preview callers). */
export function themeIdForTokens(tokens) {
  if (!tokens?.bg) return DEFAULT_THEME;
  const bg = String(tokens.bg).toUpperCase();
  const gold = String(tokens.gold || '').toUpperCase();
  const hit = THEMES.find((t) => t.bg.toUpperCase() === bg && t.gold.toUpperCase() === gold)
    || THEMES.find((t) => t.bg.toUpperCase() === bg);
  return hit ? hit.id : DEFAULT_THEME;
}

// ── settings migration (server runs it once; pure + idempotent) ──────────────

/** Old theme id → current id. Only meaningful for pre-themeVersion-2 data. */
export function migrateThemeId(id) {
  return THEME_BY_ID[id] || id === 'custom' ? id : (id ? DEFAULT_THEME : id);
}

export const THEME_SETTINGS_VERSION = 2;

/**
 * One-time settings migration for the screen redesign (2026-10-14):
 *  - `sepia` (the old dark-brown look) → `walnut`, in theme, themeAuto
 *    day/night and customTheme.base, so existing screens keep their look;
 *  - hebrewFontScale was tuned for the old small type (owner: 1.4); it is
 *    now a global multiplier for every Hebrew size, so it is mapped
 *    1 + (old − 1) × 0.25, clamped 0.9–1.15 (1.4 → 1.1);
 *  - layout.railSide is seeded from the old clockSide.
 * Guarded by settings.themeVersion so it runs once; the admin saves the whole
 * object back, so the flag survives.
 * @returns {{ settings: object, changed: boolean }}
 */
export function migrateThemeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { settings, changed: false };
  if ((settings.themeVersion || 0) >= THEME_SETTINGS_VERSION) return { settings, changed: false };
  const out = { ...settings };
  const sep = (v) => (v === 'sepia' ? 'walnut' : v);
  if (out.theme) out.theme = sep(out.theme);
  if (out.themeAuto && typeof out.themeAuto === 'object') {
    out.themeAuto = { ...out.themeAuto };
    if (out.themeAuto.dayTheme) out.themeAuto.dayTheme = sep(out.themeAuto.dayTheme);
    if (out.themeAuto.nightTheme) out.themeAuto.nightTheme = sep(out.themeAuto.nightTheme);
  }
  if (out.customTheme && typeof out.customTheme === 'object' && out.customTheme.base) {
    out.customTheme = { ...out.customTheme, base: sep(out.customTheme.base) };
  }
  const s = Number(out.hebrewFontScale);
  if (Number.isFinite(s) && s !== 1) {
    out.hebrewFontScale = Math.round(Math.min(1.15, Math.max(0.9, 1 + (s - 1) * 0.25)) * 100) / 100;
  }
  if (!out.layout || typeof out.layout !== 'object') out.layout = {};
  else out.layout = { ...out.layout };
  if (!out.layout.railSide) out.layout.railSide = out.clockSide === 'right' ? 'right' : 'left';
  out.themeVersion = THEME_SETTINGS_VERSION;
  return { settings: out, changed: true };
}
