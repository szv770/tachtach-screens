// Admin design tokens — Direction A "Seal".
// The real values live in admin-theme.css as CSS custom properties (light + dark via
// prefers-color-scheme, overridable with <html data-theme>). `colors.*` below resolve to
// var(--…) strings so every existing inline-style component re-themes without a reload.
// Never build a colour by string concatenation (`${colors.x}88` breaks): use alpha().

export const THEME_KEY = 'tachtach-admin-theme-v2';
export const THEME_CHOICES = ['system', 'light', 'dark'];

export function getAdminThemeName() {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return THEME_CHOICES.includes(v) ? v : 'system';
  } catch { return 'system'; }
}

/** Apply 'system' | 'light' | 'dark' to <html> immediately (no reload) and remember it. */
export function applyAdminTheme(theme) {
  const t = THEME_CHOICES.includes(theme) ? theme : 'system';
  if (typeof document !== 'undefined') {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const dark = t === 'dark' || (t === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#121110' : '#F4F1EA');
    }
  }
}

export function setAdminTheme(theme) {
  try { window.localStorage.setItem(THEME_KEY, THEME_CHOICES.includes(theme) ? theme : 'system'); } catch { /* private mode */ }
  applyAdminTheme(theme);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tt-admin-theme'));
}

if (typeof document !== 'undefined') applyAdminTheme(getAdminThemeName());

/** A translucent version of a token: alpha(colors.danger, 53) -> color-mix(...). */
export function alpha(color, percent) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

// Legacy names kept so the existing components keep working; "gold" is the main
// action colour, which in Direction A is the wax-seal red (real gold = "edited").
export const colors = {
  bg: 'var(--bg)',
  text: 'var(--text)',
  dim: 'var(--text-2)',
  muted: 'var(--text-3)',
  border: 'var(--line-strong)',
  gold: 'var(--accent)',
  goldBg: 'var(--accent-soft)',
  goldBd: 'color-mix(in srgb, var(--accent) 45%, transparent)',
  surface: 'var(--surface-2)',
  surfaceHover: 'var(--sunken)',
  panel: 'var(--surface)',
  copper: 'var(--gold)',
  danger: 'var(--danger)',
  dangerBg: 'var(--danger-soft)',
  success: 'var(--ok)',
  successBg: 'var(--ok-soft)',
  // Direction A additions
  card: 'var(--surface)',
  sunken: 'var(--sunken)',
  line: 'var(--line)',
  accent: 'var(--accent)',
  accentInk: 'var(--accent-ink)',
  accentSoft: 'var(--accent-soft)',
  edited: 'var(--gold)',
  editedSoft: 'var(--gold-soft)',
  warn: 'var(--warn)',
  warnSoft: 'var(--warn-soft)',
  scrim: 'var(--scrim)',
};

export const shadows = { e1: 'var(--e1)', e2: 'var(--e2)', e3: 'var(--e3)' };
export const radii = { xs: '8px', sm: '12px', md: '16px', lg: '22px', xl: '28px', pill: '999px' };
export const motion = { fast: 'var(--t-fast)', base: 'var(--t-base)', sheet: 'var(--t-sheet)', ease: 'var(--ease)' };

// Hebrew in Rubik, English UI in Manrope, page titles in Fraunces (bundled via @fontsource-variable).
export const adminFonts = {
  hebrewPrimary: 'var(--f-he)',
  hebrewDisplay: 'var(--f-display)',
  englishBody: 'var(--f-ui)',
  englishDisplay: 'var(--f-display)',
};

export const inputStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  color: colors.text,
  padding: '8px 12px',
  fontFamily: adminFonts.hebrewPrimary,
  fontSize: '14px',
  outline: 'none',
  width: '100%',
};

export const buttonPrimary = {
  background: colors.gold,
  color: 'var(--accent-ink)',
  border: '1px solid transparent',
  borderRadius: '8px',
  padding: '8px 20px',
  fontFamily: adminFonts.englishBody,
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
};

export const buttonSecondary = {
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  padding: '8px 16px',
  fontFamily: adminFonts.englishBody,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const buttonDanger = {
  background: colors.dangerBg,
  color: colors.danger,
  border: `1px solid ${colors.danger}`,
  borderRadius: '8px',
  padding: '8px 16px',
  fontFamily: adminFonts.englishBody,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};
