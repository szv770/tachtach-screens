import React from 'react';
import { F } from '../design/ui.jsx';

/**
 * Rail clock (R2 §3): 136 px, weight 700, small dim AM/PM. The digits fade in
 * softly on each minute change (motion smooth/lively; CSS one-shot, keyed on
 * the minute — no infinite blinking colon any more).
 */
export default function Clock({ formatted, ampm, compact = false, size, align }) {
  const px = size || (compact ? 96 : 136);
  return (
    <div className="tt-num" style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 0.8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', direction: 'ltr', flex: 'none' }}>
      <span key={formatted} className="tt-tick" style={{ fontSize: px, fontWeight: 700, letterSpacing: '-.045em', fontFamily: F.num }}>{formatted}</span>
      <span style={{ fontSize: Math.round(px * 0.206), fontWeight: 600, color: 'var(--dim)', margin: `${Math.round(px * 0.03)}px 0 0 12px`, fontFamily: F.num }}>{ampm}</span>
    </div>
  );
}
