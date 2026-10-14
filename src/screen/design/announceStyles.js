/**
 * Announcement STYLES as panel role overrides (R2 README §7).
 *
 * THIS IS THE SEAM for the takeover/announcement style redesign: one entry
 * per style, each a plain object of CSS custom properties applied on the
 * page panel (ui.jsx <Panel look=…>). Layouts (BigWords, EventCard, ListCard,
 * QuickTime, …) paint only with the panel roles below, so a new style is just
 * a new entry here — no layout code changes — and a new layout works with
 * every style.
 *
 * Panel roles: --panel (surface colour) --panelBg (optional gradient)
 * --panelRing (optional inset box-shadow) --ink --inkDim --fill --fillInk
 * --accentText --accent --onAccent --f-disp-he --f-disp-en --disp-w
 * --tile-w --qt-w --tileRing.
 *
 * All static (no infinite animation). `light` variants keep contrast on the
 * light theme family. The old Takeover.jsx keyframes (emergencyPulse,
 * hypeGlow, celebrationConfetti, …) are retired on the display.
 */

const SERIF_HE = "var(--f-th)";
const SERIF_EN = "var(--f-te)";

const STYLES = {
  classic: () => ({}),

  sleek: () => ({
    '--fill': 'var(--ink)', '--fillInk': 'var(--panel)', '--accentText': 'var(--ink)',
    '--disp-w': 500, '--tile-w': 400, '--qt-w': 200,
  }),

  grand: (light) => {
    const accent = light ? '#8A6516' : '#D2AA55';
    return {
      '--f-disp-he': SERIF_HE, '--f-disp-en': SERIF_EN, '--disp-w': 600,
      '--accent': accent, '--onAccent': light ? '#FFFFFF' : '#1A1408',
      '--fill': accent, '--fillInk': light ? '#FFFFFF' : '#1A1408', '--accentText': accent,
      '--panelRing': `inset 0 0 0 2px color-mix(in srgb, ${accent} 55%, transparent), inset 0 0 0 12px var(--panel), inset 0 0 0 13px color-mix(in srgb, ${accent} 30%, transparent)`,
    };
  },

  celebration: () => ({
    '--panel': 'var(--accent)', '--ink': 'var(--onAccent)',
    '--inkDim': 'color-mix(in srgb, var(--onAccent) 72%, transparent)',
    '--fill': 'var(--onAccent)', '--fillInk': 'var(--accent)', '--accentText': 'var(--onAccent)', '--disp-w': 800,
    '--panelBg': 'linear-gradient(150deg, color-mix(in srgb, #FFFFFF 14%, var(--accent)) 0%, var(--accent) 55%, color-mix(in srgb, #000000 18%, var(--accent)) 100%)',
  }),

  urgent: (light) => {
    const accent = light ? '#B4600A' : '#F2A33A';
    return {
      '--accent': accent, '--onAccent': light ? '#FFFFFF' : '#1E1405',
      '--fill': accent, '--fillInk': light ? '#FFFFFF' : '#1E1405', '--accentText': accent,
      '--panel': `color-mix(in srgb, ${accent} 7%, var(--raised))`,
      '--panelRing': `inset 0 0 0 6px ${accent}`,
    };
  },

  emergency: () => ({
    '--panel': '#B42318', '--ink': '#FFFFFF', '--inkDim': 'rgba(255,255,255,.8)',
    '--fill': '#FFFFFF', '--fillInk': '#B42318', '--accentText': '#FFFFFF', '--disp-w': 800,
  }),

  torah: (light) => {
    const accent = light ? '#7A5520' : '#C99A4E';
    return {
      '--f-disp-he': SERIF_HE, '--f-disp-en': SERIF_EN, '--disp-w': 600,
      '--accent': accent, '--onAccent': light ? '#FFFFFF' : '#1C1206',
      '--fill': accent, '--fillInk': light ? '#FFFFFF' : '#1C1206', '--accentText': accent,
      '--panel': light ? 'color-mix(in srgb, #E8D4A8 55%, var(--raised))' : 'color-mix(in srgb, #C9A46A 11%, var(--raised))',
    };
  },

  trip: (light) => {
    const accent = light ? '#1E7A52' : '#4CB386';
    return {
      '--accent': accent, '--onAccent': light ? '#FFFFFF' : '#06180F',
      '--fill': accent, '--fillInk': light ? '#FFFFFF' : '#06180F', '--accentText': accent,
      '--panel': `color-mix(in srgb, ${accent} 8%, var(--raised))`,
    };
  },

  phone: () => ({
    '--fill': 'transparent', '--fillInk': 'var(--accent)', '--accentText': 'var(--accent)', '--tile-w': 600,
    '--tileRing': 'inset 0 0 0 4px var(--accent)',
  }),

  memorial: (light) => ({
    '--f-disp-he': SERIF_HE, '--f-disp-en': SERIF_EN, '--disp-w': 500,
    '--fill': 'transparent', '--fillInk': 'var(--ink)', '--accentText': 'var(--inkDim)', '--tile-w': 400, '--qt-w': 300,
    '--tileRing': 'inset 0 0 0 2px var(--line)',
    '--panel': light ? 'color-mix(in srgb, var(--text) 5%, var(--raised))' : 'color-mix(in srgb, #000000 22%, var(--raised))',
  }),

  hype: (light) => {
    const accent = light ? '#D9381A' : '#FF5B3A';
    return {
      '--accent': accent, '--onAccent': '#FFFFFF',
      '--fill': accent, '--fillInk': '#FFFFFF', '--accentText': accent, '--disp-w': 800,
      '--panelBg': `linear-gradient(120deg, color-mix(in srgb, ${accent} 26%, var(--raised)) 0%, var(--raised) 58%)`,
    };
  },
};

/** Old style names that map onto a current one. */
const ALIASES = { notice: 'urgent' };

export const STYLE_IDS = Object.keys(STYLES);

/** CSS custom properties for a style on the given theme family. */
export function styleVars(style, light = false) {
  const id = ALIASES[style] || style;
  const f = STYLES[id];
  return f ? f(light) : {};
}
