// ── Classic dark — warm parchment-on-mahogany ──────────────────────────────
const dark = {
  bg: '#12100C',
  text: '#EFE3C0',
  dim: 'rgba(239,227,192,.60)',
  muted: 'rgba(239,227,192,.30)',
  gold: '#D4A84B',
  goldBg: 'rgba(212,168,75,.13)',
  goldBd: 'rgba(212,168,75,.42)',
  surface: 'rgba(255,240,195,.045)',
  copper: '#B8803A',
  framePrimary: 'rgba(212,168,75,.16)',
  frameSecondary: 'rgba(212,168,75,.32)',
};

// ── High-contrast dark — boosted readability, same feel ────────────────────
const darkHC = {
  bg: '#0D0B08',
  text: '#F5EDD5',
  dim: 'rgba(245,237,213,.78)',
  muted: 'rgba(245,237,213,.48)',
  gold: '#E8BD5A',
  goldBg: 'rgba(232,189,90,.18)',
  goldBd: 'rgba(232,189,90,.55)',
  surface: 'rgba(255,240,195,.07)',
  copper: '#CFA04E',
  framePrimary: 'rgba(232,189,90,.22)',
  frameSecondary: 'rgba(232,189,90,.42)',
};

// ── Midnight blue — cool-toned dark with strong contrast ───────────────────
const midnight = {
  bg: '#0B1120',
  text: '#E0E8F5',
  dim: 'rgba(224,232,245,.75)',
  muted: 'rgba(224,232,245,.40)',
  gold: '#7EB8E0',
  goldBg: 'rgba(126,184,224,.14)',
  goldBd: 'rgba(126,184,224,.45)',
  surface: 'rgba(126,184,224,.06)',
  copper: '#5A9CC6',
  framePrimary: 'rgba(126,184,224,.18)',
  frameSecondary: 'rgba(126,184,224,.35)',
};

// ── Sepia — warm, easy on the eyes, paper-like ─────────────────────────────
const sepia = {
  bg: '#2A2118',
  text: '#F0DFC0',
  dim: 'rgba(240,223,192,.75)',
  muted: 'rgba(240,223,192,.40)',
  gold: '#D4A84B',
  goldBg: 'rgba(212,168,75,.16)',
  goldBd: 'rgba(212,168,75,.48)',
  surface: 'rgba(212,168,75,.06)',
  copper: '#C4944A',
  framePrimary: 'rgba(212,168,75,.20)',
  frameSecondary: 'rgba(212,168,75,.38)',
};

// ── Parchment — light theme ────────────────────────────────────────────────
const parchment = {
  bg: '#F0E4C4',
  text: '#1C0E05',
  dim: 'rgba(28,14,5,.60)',
  muted: 'rgba(28,14,5,.30)',
  gold: '#8B5E00',
  goldBg: 'rgba(139,94,0,.13)',
  goldBd: 'rgba(139,94,0,.42)',
  surface: 'rgba(139,94,0,.045)',
  copper: '#6B4500',
  framePrimary: 'rgba(139,94,0,.16)',
  frameSecondary: 'rgba(139,94,0,.32)',
};

// ── Clean White — minimal modern white, blue-gray accents ─────────────────
const cleanWhite = {
  bg: '#F7F8FA',
  text: '#1A1D23',
  dim: 'rgba(26,29,35,.58)',
  muted: 'rgba(26,29,35,.25)',
  gold: '#3B6B96',
  goldBg: 'rgba(59,107,150,.10)',
  goldBd: 'rgba(59,107,150,.35)',
  surface: 'rgba(59,107,150,.04)',
  copper: '#2D5478',
  framePrimary: 'rgba(59,107,150,.14)',
  frameSecondary: 'rgba(59,107,150,.28)',
};

// ── Ivory — warm cream, dark brown text, muted gold accents ───────────────
const ivory = {
  bg: '#F5F0E6',
  text: '#2C1E0E',
  dim: 'rgba(44,30,14,.58)',
  muted: 'rgba(44,30,14,.25)',
  gold: '#9B7530',
  goldBg: 'rgba(155,117,48,.11)',
  goldBd: 'rgba(155,117,48,.38)',
  surface: 'rgba(155,117,48,.04)',
  copper: '#7A5A20',
  framePrimary: 'rgba(155,117,48,.15)',
  frameSecondary: 'rgba(155,117,48,.30)',
};

// ── Sky — light blue-white, dark navy text, teal accents ──────────────────
const sky = {
  bg: '#EDF4FA',
  text: '#0F1E33',
  dim: 'rgba(15,30,51,.58)',
  muted: 'rgba(15,30,51,.25)',
  gold: '#1A7A7A',
  goldBg: 'rgba(26,122,122,.10)',
  goldBd: 'rgba(26,122,122,.35)',
  surface: 'rgba(26,122,122,.04)',
  copper: '#14605F',
  framePrimary: 'rgba(26,122,122,.14)',
  frameSecondary: 'rgba(26,122,122,.28)',
};

const themes = {
  dark, 'dark-hc': darkHC, midnight, sepia,
  parchment, 'clean-white': cleanWhite, ivory, sky,
};

export function getTokens(theme, customTheme) {
  if (theme === 'custom' && customTheme) {
    const base = themes[customTheme.base] || dark;
    return { ...base, gold: customTheme.primary || base.gold };
  }
  return themes[theme] || dark;
}

export const fonts = {
  hebrewPrimary: "'Frank Ruhl Libre', Georgia, serif",
  hebrewDisplay: "'Noto Serif Hebrew', serif",
  englishBody: "'EB Garamond', Georgia, serif",
  englishDisplay: "'Cormorant Garamond', serif",
};

/**
 * Update the shared `fonts` object in place based on settings.
 * Because every screen component imports `fonts` by reference,
 * mutating the object ensures all components pick up the change
 * on the next render cycle.
 */
export function applyFontSettings(settings) {
  const fontSettings = settings?.fonts;
  if (!fontSettings) return;

  const hebBody = fontSettings.hebrewBody || fontSettings.hebrew || 'Frank Ruhl Libre';
  const hebHeading = fontSettings.hebrewHeading || fontSettings.hebrew || 'Frank Ruhl Libre';
  const eng = fontSettings.english || 'EB Garamond';

  fonts.hebrewPrimary = `'${hebBody}', Georgia, serif`;
  fonts.hebrewDisplay = `'${hebHeading}', serif`;
  fonts.englishBody = `'${eng}', Georgia, serif`;
  fonts.englishDisplay = `'${eng}', serif`;
}

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
