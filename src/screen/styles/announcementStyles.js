/**
 * Colour palettes that let any announcement layout (Big words, Event, List,
 * Quick time) be shown in one of the Takeover/StyledSlide styles. Each palette
 * is a set of overrides for the screen tokens the layouts read (text, dim,
 * gold, goldBg, goldBd, muted) plus its own background, taken from the
 * style's existing Takeover look. Palettes carry their own background, so they
 * read the same on dark and light themes; `classic` (and no style) uses the
 * current theme's tokens. Fonts stay the theme fonts (no system sans).
 */

export const STYLE_PALETTES = {
  grand: {
    background: 'linear-gradient(145deg, #0C0800 0%, #1a1000 30%, #0C0800 60%, #1a1408 100%)',
    text: '#FFF8DC', dim: 'rgba(255,248,220,.72)', muted: 'rgba(255,215,0,.35)',
    gold: '#FFD700', goldBg: 'rgba(255,215,0,.10)', goldBd: 'rgba(255,215,0,.5)',
  },
  emergency: {
    background: 'linear-gradient(160deg, #450A0A 0%, #7F1D1D 55%, #450A0A 100%)',
    text: '#FFFFFF', dim: 'rgba(255,255,255,.82)', muted: 'rgba(255,255,255,.4)',
    gold: '#FECACA', goldBg: 'rgba(255,255,255,.10)', goldBd: 'rgba(255,255,255,.5)',
  },
  sleek: {
    background: '#000000',
    text: '#FFFFFF', dim: 'rgba(255,255,255,.62)', muted: 'rgba(255,255,255,.3)',
    gold: '#A5B4FC', goldBg: 'rgba(99,102,241,.16)', goldBd: 'rgba(99,102,241,.55)',
  },
  celebration: {
    background: 'linear-gradient(135deg, #FF006E 0%, #8338EC 50%, #3A86FF 100%)',
    text: '#FFFFFF', dim: 'rgba(255,255,255,.88)', muted: 'rgba(255,255,255,.5)',
    gold: '#FFE066', goldBg: 'rgba(255,255,255,.18)', goldBd: 'rgba(255,255,255,.6)',
  },
  urgent: {
    background: '#FFC107',
    text: '#111111', dim: 'rgba(0,0,0,.68)', muted: 'rgba(0,0,0,.35)',
    gold: '#000000', goldBg: 'rgba(0,0,0,.08)', goldBd: 'rgba(0,0,0,.5)',
  },
  torah: {
    background: 'linear-gradient(160deg, #0A0E1A 0%, #0F1628 30%, #121D38 60%, #0A0E1A 100%)',
    text: '#F0E6CC', dim: 'rgba(240,230,204,.72)', muted: 'rgba(212,168,75,.32)',
    gold: '#D4A84B', goldBg: 'rgba(212,168,75,.12)', goldBd: 'rgba(212,168,75,.45)',
  },
  trip: {
    background: 'linear-gradient(180deg, #0C4A6E 0%, #0369A1 45%, #0EA5E9 100%)',
    text: '#FFFFFF', dim: 'rgba(255,255,255,.86)', muted: 'rgba(255,255,255,.45)',
    gold: '#FDE68A', goldBg: 'rgba(255,255,255,.15)', goldBd: 'rgba(255,255,255,.55)',
  },
  phone: {
    background: 'linear-gradient(160deg, #0A0F1A 0%, #0F172A 40%, #1E293B 100%)',
    text: '#F8FAFC', dim: 'rgba(248,250,252,.72)', muted: 'rgba(56,189,248,.3)',
    gold: '#38BDF8', goldBg: 'rgba(56,189,248,.12)', goldBd: 'rgba(56,189,248,.5)',
  },
  memorial: {
    background: 'linear-gradient(180deg, #08060F 0%, #0D0A1A 30%, #110E22 60%, #08060F 100%)',
    text: '#E8E0D0', dim: 'rgba(232,224,208,.66)', muted: 'rgba(200,180,150,.25)',
    gold: '#C8B496', goldBg: 'rgba(200,180,150,.08)', goldBd: 'rgba(200,180,150,.35)',
  },
  hype: {
    background: 'linear-gradient(160deg, #07050F 0%, #140A2A 60%, #07050F 100%)',
    text: '#FFFFFF', dim: 'rgba(255,255,255,.72)', muted: 'rgba(168,85,247,.4)',
    gold: '#C084FC', goldBg: 'rgba(168,85,247,.15)', goldBd: 'rgba(6,182,212,.55)',
  },
};

/** Tokens + background for a style (null background = use the theme as is). */
export function styledTokens(style, tokens) {
  const p = style && STYLE_PALETTES[style];
  if (!p) return { tokens, background: null };
  const { background, ...colors } = p;
  return { tokens: { ...tokens, ...colors, bg: colors.text === '#111111' ? '#FFC107' : tokens.bg }, background };
}
