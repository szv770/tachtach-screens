/**
 * Legacy token API, kept for the admin and any component not yet on the
 * design roles. The theme registry now lives in src/shared/themes.js (dark +
 * light families, ~20 sub-themes); the redesigned screen paints with CSS
 * custom properties set by src/screen/design/DesignRoot.jsx instead.
 */
import { THEMES, baseTheme, legacyTokens } from '../../shared/themes.js';

const themes = Object.fromEntries(THEMES.map((t) => [t.id, legacyTokens(t)]));
const dark = themes.dark;

export function getTokens(theme, customTheme) {
  return legacyTokens(baseTheme(theme, customTheme));
}

/**
 * Font stacks for components that still read `fonts.*`. They resolve to the
 * font-role CSS variables (settings.fontRoles, src/shared/fontRoles.js), so
 * they follow whatever the admin assigned — with the approved defaults as the
 * fallback outside a DesignRoot (e.g. the admin).
 */
export const fonts = {
  hebrewPrimary: "var(--f-he, 'Rubik Variable', 'Rubik', sans-serif)",
  hebrewDisplay: "var(--f-he-d, 'Rubik Variable', 'Rubik', sans-serif)",
  englishBody: "var(--f-en, 'Manrope Variable', 'Manrope', sans-serif)",
  englishDisplay: "var(--f-en-d, 'Manrope Variable', 'Manrope', sans-serif)",
  numerals: "var(--f-num, 'Manrope Variable', 'Manrope', sans-serif)",
  torahHebrew: "var(--f-th, 'Frank Ruhl Libre Variable', 'Frank Ruhl Libre', serif)",
  torahEnglish: "var(--f-te, 'EB Garamond Variable', 'EB Garamond', serif)",
};

/**
 * Kept for callers (admin preview). Fonts are now resolved per role by
 * DesignRoot from settings.fontRoles; nothing to mutate here any more.
 */
export function applyFontSettings() {}

export const slideTransition = {
  initial: { opacity: 0, scale: 1.014 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.986 },
  transition: { duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const animations = {
  slideIn: {
    initial: { opacity: 0, scale: 1.014 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.986 },
    transition: { duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  fadeUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  pageTurn: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function ornamentDivider(tokens, symbol = '\u2726') {
  return { symbol, gradientColor: tokens.muted, accentColor: tokens.gold };
}

export default dark;
