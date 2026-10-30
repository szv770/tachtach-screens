import React, { useEffect, useRef } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';

/** Sunken pill track with a raised thumb on the selected option. Scrolls sideways if it must. */
export default function SegmentedControl({ options, value, onChange, ariaLabel, style, fill = false }) {
  const ref = useRef(null);
  // A row wider than the phone scrolls sideways: bring the chosen option into view (inside the row only, never the page).
  useEffect(() => {
    const row = ref.current;
    const on = row?.querySelector('[aria-pressed="true"]');
    if (!row || !on || row.scrollWidth <= row.clientWidth + 2) return;
    const left = on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2;
    row.scrollLeft = Math.max(0, left);
  }, [value]);
  return (
    <div ref={ref} role="group" aria-label={ariaLabel} className="tt-seg" style={{
      display: fill ? 'flex' : 'inline-flex', maxWidth: '100%', overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'none', position: 'relative',
      background: colors.sunken, borderRadius: 'var(--r-pill)', padding: '3px', gap: '2px', ...style,
    }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" aria-pressed={on} data-value={o.value} onClick={() => onChange?.(o.value)}
            style={{
              flex: fill ? 1 : '0 0 auto', minHeight: '38px', padding: '0 14px', borderRadius: 'var(--r-pill)', border: 'none',
              whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 700,
              background: on ? colors.card : 'transparent', color: on ? colors.text : colors.dim,
              boxShadow: on ? 'var(--e1)' : 'none', transition: 'background var(--t-fast) var(--ease)',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}
