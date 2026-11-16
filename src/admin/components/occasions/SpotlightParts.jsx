import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import { TYPES } from '../../../shared/spotlight.js';
import { small } from './occKit.jsx';

/** Tiny line drawings of the 8 countdown kinds (currentColor, no images): a hint of what each looks like. */
export function KindThumb({ id, size = 56 }) {
  const w = size; const h = Math.round(size * 0.64);
  const s = { width: w, height: h, display: 'block', flex: 'none' };
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' };
  const body = {
    flip: <>{[6, 19, 32, 45].map((x) => <g key={x}><rect x={x} y="6" width="9" height="22" rx="1.5" {...p} /><path d={`M${x} 17H${x + 9}`} {...p} /></g>)}</>,
    ring: <><circle cx="28" cy="18" r="13" {...p} strokeDasharray="1.4 2.6" strokeWidth="3" /><circle cx="28" cy="18" r="6" {...p} /></>,
    journey: <><path d="M5 26C16 26 16 10 28 10S40 26 51 26" {...p} /><circle cx="5" cy="26" r="2" fill="currentColor" /><circle cx="28" cy="10" r="2" fill="currentColor" /><circle cx="51" cy="26" r="2.6" {...p} /></>,
    glow: <><circle cx="28" cy="18" r="7" fill="currentColor" opacity=".9" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d="M28 6V9" {...p} transform={`rotate(${a} 28 18)`} />)}</>,
    calendar: <>{[0, 1, 2, 3, 4].map((c) => [0, 1, 2].map((r) => <rect key={`${c}${r}`} x={6 + c * 9.5} y={5 + r * 9.5} width="7" height="7" rx="1.2" {...p} fill={c + r * 5 < 6 ? 'currentColor' : 'none'} opacity={c + r * 5 < 6 ? 0.45 : 1} />))}</>,
    meter: <><rect x="5" y="14" width="46" height="8" rx="4" {...p} /><rect x="5" y="14" width="30" height="8" rx="4" fill="currentColor" opacity=".7" /></>,
    sleeps: <>{[0, 1, 2, 3].map((i) => <path key={i} d={`M${10 + i * 13} 10a7 7 0 1 0 6 11a6 6 0 0 1-6-11z`} {...p} fill={i === 0 ? 'currentColor' : 'none'} />)}</>,
    odometer: <>{[8, 22, 36].map((x) => <g key={x}><rect x={x} y="6" width="11" height="24" rx="2" {...p} /><path d={`M${x + 3} 15h5M${x + 3} 21h5`} {...p} opacity=".6" /></g>)}</>,
  }[id];
  return <svg viewBox="0 0 56 36" style={s} aria-hidden="true">{body}</svg>;
}

/** One switch-able tile: a drawing, the kind's name and what it is. */
export function KindTile({ id, on, onToggle, disabled, note, testId }) {
  const t = TYPES[id];
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onToggle} data-testid={testId || `spot-kind-${id}`}
      style={{ minHeight: '96px', padding: '10px', borderRadius: 'var(--r-md)', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', display: 'grid', gap: '6px', alignContent: 'start', minWidth: 0,
        border: `1.5px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : colors.card, color: on ? colors.accent : colors.dim, fontFamily: adminFonts.englishBody, opacity: disabled ? 0.7 : 1 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <KindThumb id={id} />
        <span aria-hidden="true" style={{ fontSize: '16px', fontWeight: 700 }}>{on ? '✓' : ''}</span>
      </span>
      <span style={{ fontSize: '14px', fontWeight: 700, color: colors.text }}>{t.label}</span>
      {note && <span style={{ ...small, fontSize: '12px' }}>{note}</span>}
    </button>
  );
}
export const KIND_NOTE = Object.freeze({
  flip: 'Days, hours, minutes, seconds on cards', ring: 'A ring of ticks lit by the way gone', journey: 'A big number and a path with stops', glow: 'One giant glowing number',
  calendar: 'The days left as a calendar', meter: 'A bar filling, "71% of the way"', sleeps: 'One moon for every night left', odometer: 'Digits that roll over',
});

/** Up / down arrows + remove for a list row (44 px targets). */
export const arrowBtn = { minWidth: '44px', minHeight: '44px', padding: 0, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-sm)', background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: '15px' };
