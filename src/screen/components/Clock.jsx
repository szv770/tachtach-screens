import React from 'react';
import { F } from '../design/ui.jsx';

/**
 * Rail clock (R2 §3, owner polish 2026-10-14): heavy tabular lining numerals
 * in the numerals font role, tight tracking, and the AM/PM set as small
 * letter-spaced caps on the digits' baseline — the same treatment as every
 * other time on the screen (board, schedule), so "12:41 PM" reads as one
 * word instead of a number with a stray label floating above it.
 * The digits fade in softly on each minute change (motion smooth/lively;
 * one-shot CSS keyed on the minute, never a blinking colon).
 */
export default function Clock({ formatted, ampm, compact = false, size, align }) {
  const px = size || (compact ? 96 : 132);
  return (
    <div
      className="tt-num"
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        direction: 'ltr', flex: 'none', lineHeight: 0.8, whiteSpace: 'nowrap', fontFamily: F.num,
        // optical: pull the heavy digits onto the rail's left edge
        marginLeft: align === 'right' ? 0 : -Math.round(px * 0.035),
      }}
    >
      <span key={formatted} className="tt-tick" style={{ fontSize: px, fontWeight: 800, letterSpacing: '-.055em', color: 'var(--text)' }}>{formatted}</span>
      {ampm && (
        <span style={{ fontSize: Math.round(px * 0.2), fontWeight: 700, letterSpacing: '.06em', color: 'var(--dim)', marginLeft: Math.round(px * 0.1) }}>{ampm}</span>
      )}
    </div>
  );
}
