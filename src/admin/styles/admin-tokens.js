// Admin design tokens — mirrors screen palette with admin-specific additions

const darkColors = {
  bg: '#12100C',
  text: '#EFE3C0',
  dim: 'rgba(239,227,192,.82)',
  muted: 'rgba(239,227,192,.50)',
  border: 'rgba(239,227,192,.16)',
  gold: '#D4A84B',
  goldBg: 'rgba(212,168,75,.16)',
  goldBd: 'rgba(212,168,75,.52)',
  surface: 'rgba(255,240,195,.08)',
  surfaceHover: 'rgba(255,240,195,.14)',
  panel: '#161310',
  copper: '#C89040',
  danger: '#E04040',
  dangerBg: 'rgba(224,64,64,.15)',
  success: '#5CBF60',
  successBg: 'rgba(76,175,80,.15)',
};

const lightColors = {
  bg: '#F5F3EF',
  text: '#1C1A17',
  dim: 'rgba(28,26,23,.55)',
  muted: 'rgba(28,26,23,.22)',
  border: 'rgba(28,26,23,.12)',
  gold: '#9B7520',
  goldBg: 'rgba(155,117,32,.10)',
  goldBd: 'rgba(155,117,32,.35)',
  surface: 'rgba(0,0,0,.04)',
  surfaceHover: 'rgba(0,0,0,.07)',
  panel: '#EFECE6',
  copper: '#7A5A1A',
  danger: '#C4342D',
  dangerBg: 'rgba(196,52,45,.08)',
  success: '#2E7D32',
  successBg: 'rgba(46,125,50,.08)',
};

// Read admin theme preference from localStorage
function getAdminTheme() {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('tachtach-admin-theme') || 'dark';
  }
  return 'dark';
}

export function setAdminTheme(theme) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('tachtach-admin-theme', theme);
    window.location.reload();
  }
}

export function getAdminThemeName() {
  return getAdminTheme();
}

export const colors = getAdminTheme() === 'light' ? lightColors : darkColors;

// Expose the theme on <html> so admin.css can theme via CSS variables and
// pseudo-class states (hover/focus) that inline styles can't express.
if (typeof document !== 'undefined') {
  document.documentElement.dataset.adminTheme = getAdminTheme();
}

export const adminFonts = {
  hebrewPrimary: "'Frank Ruhl Libre', Georgia, serif",
  hebrewDisplay: "'Noto Serif Hebrew', serif",
  englishBody: "'EB Garamond', Georgia, serif",
  englishDisplay: "'Cormorant Garamond', serif",
};

export const inputStyle = {
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  color: colors.text,
  padding: '8px 12px',
  fontFamily: adminFonts.hebrewPrimary,
  fontSize: '14px',
  outline: 'none',
  width: '100%',
  colorScheme: getAdminTheme() === 'light' ? 'light' : 'dark',
};

export const buttonPrimary = {
  background: colors.gold,
  color: getAdminTheme() === 'light' ? '#FFFDF6' : colors.bg,
  border: '1px solid transparent',
  borderRadius: '6px',
  padding: '8px 20px',
  fontFamily: adminFonts.hebrewPrimary,
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: '0.02em',
  boxShadow: '0 1px 3px rgba(0,0,0,.25)',
};

export const buttonSecondary = {
  background: 'transparent',
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  padding: '8px 16px',
  fontFamily: adminFonts.hebrewPrimary,
  fontSize: '14px',
  cursor: 'pointer',
};

export const buttonDanger = {
  background: colors.dangerBg,
  color: colors.danger,
  border: `1px solid ${colors.danger}`,
  borderRadius: '6px',
  padding: '8px 16px',
  fontFamily: adminFonts.hebrewPrimary,
  fontSize: '14px',
  cursor: 'pointer',
};
