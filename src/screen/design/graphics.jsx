import React from 'react';
import { useDesign } from './DesignRoot.jsx';

/**
 * Pi-safe graphics: static inline SVG, painted once, no animation, no
 * filters/blend modes. Monochrome line art (currentColor) so every theme and
 * style colours it. The `graphics` setting (rich / subtle / off) decides
 * which decorative pieces show; informational icons (weather) always do.
 */

const CLOUD = 'M23 52h25a9 9 0 0 0 .5-18 13 13 0 0 0-24.5 3.5A7.3 7.3 0 0 0 23 52z';

function Sun({ cx = 32, cy = 32, r = 10, rays = true }) {
  const R1 = r + 6, R2 = r + 11;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} />
      {rays && Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <path key={i} d={`M${(cx + R1 * Math.cos(a)).toFixed(1)} ${(cy + R1 * Math.sin(a)).toFixed(1)}L${(cx + R2 * Math.cos(a)).toFixed(1)} ${(cy + R2 * Math.sin(a)).toFixed(1)}`} />;
      })}
    </g>
  );
}

const Moon = ({ x = 0, y = 0, s = 1 }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} d="M40 14a18 18 0 1 0 14 26 15 15 0 0 1-14-26z" />
);

/** Weather glyph by icon key (src/shared/weatherCodes.js). */
export function WeatherIcon({ icon = 'partly', size = 60, fill = 'var(--bg)', strokeWidth = 3.2, style }) {
  const cloudUp = <path d={CLOUD} transform="translate(-4 -12)" fill={fill} />;
  let body;
  switch (icon) {
    case 'clear': body = <Sun cx={32} cy={32} r={11} />; break;
    case 'clear-night': body = <Moon x={-2} y={2} s={1} />; break;
    case 'partly':
      body = (<><circle cx="24" cy="24" r="9" /><path d="M24 6v4M8.5 12.5l2.8 2.8M6 28h4M39.5 12.5l-2.8 2.8" /><path d={CLOUD} fill={fill} /></>);
      break;
    case 'partly-night':
      body = (<><path d="M28 8a14 14 0 1 0 10 20 11 11 0 0 1-10-20z" /><path d={CLOUD} fill={fill} /></>);
      break;
    case 'fog':
      body = (<>{cloudUp}<path d="M14 50h36M20 57h28" /></>);
      break;
    case 'drizzle':
      body = (<>{cloudUp}<path d="M24 50v3M34 50v3M44 50v3M29 57v3M39 57v3" /></>);
      break;
    case 'rain':
      body = (<>{cloudUp}<path d="M24 48l-3 9M34 48l-3 9M44 48l-3 9" /></>);
      break;
    case 'snow':
      body = (<>{cloudUp}<path d="M24 50v8M20 54h8M38 50v8M34 54h8" /></>);
      break;
    case 'storm':
      body = (<>{cloudUp}<path d="M34 44l-6 9h8l-6 9" /></>);
      break;
    case 'cloudy':
    default:
      body = <path d={CLOUD} transform="translate(-4 -6)" fill={fill} />;
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', display: 'block', ...style }} aria-hidden="true">
      {body}
    </svg>
  );
}

/** Candle (candle lighting). */
export function CandleIcon({ size = 30, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d="M12 3.2c1.3 1.5 1.9 2.6 1.9 3.6a1.9 1.9 0 0 1-3.8 0c0-1 .6-2.1 1.9-3.6z" />
      <rect x="9" y="11" width="6" height="10" rx="1.2" />
    </svg>
  );
}

/** Two Shabbos candles — the Erev Shabbos / Shabbos / Yom Tov mark. */
export function ShabbosMark({ size = 34, style }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d="M10 4.5c1.1 1.3 1.6 2.2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.8.5-1.7 1.6-3zM22 4.5c1.1 1.3 1.6 2.2 1.6 3a1.6 1.6 0 0 1-3.2 0c0-.8.5-1.7 1.6-3z" />
      <rect x="7.6" y="12" width="4.8" height="14" rx="1" />
      <rect x="19.6" y="12" width="4.8" height="14" rx="1" />
      <path d="M4 28h24" />
    </svg>
  );
}

/** Small eight-point ornament (Yom Tov / special day). */
export function Ornament({ size = 22, style }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d="M12 1.5l2.1 5.1 5.3-2-2 5.3 5.1 2.1-5.1 2.1 2 5.3-5.3-2L12 22.5l-2.1-5.1-5.3 2 2-5.3L1.5 12l5.1-2.1-2-5.3 5.3 2z" opacity=".9" />
    </svg>
  );
}

/** Progress ring (static per render): fraction 0–1 of the ring is drawn. */
export function ProgressRing({ size = 112, stroke = 6, fraction = 0, track = 'color-mix(in srgb, currentColor 24%, transparent)', color = 'currentColor', style }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, ...style }} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(c * f).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

// ── Background artwork (per theme) + day-phase sky tint ─────────────────────

const MOTIF = {
  midnight: 'stars', ocean: 'stars', slate: 'stars', onyx: 'stars',
  dark: 'lattice', 'dark-hc': 'lattice', graphite: 'arcs', plum: 'lattice', walnut: 'paper',
  forest: 'hills', stone: 'hills', sage: 'hills',
  parchment: 'paper', sepia: 'paper', ivory: 'paper', linen: 'paper',
  sky: 'arcs', 'clean-white': 'arcs', rose: 'lattice', lavender: 'lattice', custom: 'arcs',
};

// deterministic pseudo-random (same stars every render / every boot)
function rnd(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }

function Motif({ kind, w, h }) {
  const ink = 'var(--text)';
  switch (kind) {
    case 'stars': {
      const r = rnd(7);
      const dots = Array.from({ length: 70 }, () => [r() * w, r() * h, r() < 0.15 ? 2.2 : 1.3]);
      return (
        <g fill={ink}>
          {dots.map(([x, y, s], i) => <circle key={i} cx={x.toFixed(0)} cy={y.toFixed(0)} r={s} opacity={0.55 + (i % 3) * 0.15} />)}
          <path d={`M${w - 230} 120a70 70 0 1 0 54 112 58 58 0 0 1-54-112z`} opacity="0.7" />
        </g>
      );
    }
    case 'hills':
      return (
        <g fill={ink}>
          <path d={`M0 ${h}V${h - 150}C${w * 0.18} ${h - 240} ${w * 0.32} ${h - 120} ${w * 0.5} ${h - 170}S${w * 0.82} ${h - 260} ${w} ${h - 160}V${h}z`} opacity="0.55" />
          <path d={`M0 ${h}V${h - 70}C${w * 0.2} ${h - 130} ${w * 0.42} ${h - 40} ${w * 0.62} ${h - 90}S${w * 0.9} ${h - 120} ${w} ${h - 80}V${h}z`} opacity="0.85" />
        </g>
      );
    case 'paper':
      return (
        <g stroke={ink} strokeWidth="1.5" fill="none">
          {Array.from({ length: Math.ceil(h / 46) }, (_, i) => <path key={i} d={`M0 ${30 + i * 46}H${w}`} opacity="0.6" />)}
          <path d={`M96 0V${h}`} opacity="0.9" />
        </g>
      );
    case 'lattice': {
      const s = 64, lines = [];
      for (let x = -h; x < w + h; x += s) {
        lines.push(<path key={`a${x}`} d={`M${x} 0L${x + h} ${h}`} />);
        lines.push(<path key={`b${x}`} d={`M${x} ${h}L${x + h} 0`} />);
      }
      return <g stroke={ink} strokeWidth="1.2" fill="none" opacity="0.6">{lines}</g>;
    }
    case 'arcs':
    default:
      return (
        <g stroke={ink} strokeWidth="2" fill="none">
          {[260, 420, 600, 800, 1020].map((r, i) => <circle key={r} cx={-40} cy={h + 40} r={r} opacity={0.9 - i * 0.12} />)}
        </g>
      );
  }
}

const PHASE_TINT = {
  dawn: '#F2A68A', day: '#9CC9F0', dusk: '#E58A5A', night: '#5A6FD6',
};

/**
 * Static page background art behind the rail and around the panel.
 * rich = motif + day-phase sky tint; subtle = fainter motif; off = nothing.
 * The SVG is drawn once (no animation), at a very low ink percentage.
 */
export function BackgroundArt({ width = 1600, height = 900 }) {
  const { graphics, themeId, phase, light } = useDesign();
  if (graphics === 'off') return null;
  const kind = MOTIF[themeId] || 'arcs';
  const op = graphics === 'rich' ? (light ? 0.04 : 0.05) : (light ? 0.025 : 0.028);
  const tint = graphics === 'rich' ? PHASE_TINT[phase] : null;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
      {tint && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, color-mix(in srgb, ${tint} ${light ? 11 : 7}%, transparent) 0%, transparent 50%)`,
        }} />
      )}
      <svg width="100%" height="100%" viewBox={`0 0 ${Math.round(width)} ${Math.round(height)}`} preserveAspectRatio="xMinYMax slice" style={{ position: 'absolute', inset: 0, opacity: op }}>
        <Motif kind={kind} w={Math.round(width)} h={Math.round(height)} />
      </svg>
    </div>
  );
}
