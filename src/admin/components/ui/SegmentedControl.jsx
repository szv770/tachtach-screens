import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';

/** Sunken pill track with a raised thumb on the selected option. Scrolls sideways if it must. */
export default function SegmentedControl({ options, value, onChange, ariaLabel, style, fill = false }) {
  return (
    <div role="group" aria-label={ariaLabel} className="tt-seg" style={{
      display: fill ? 'flex' : 'inline-flex', maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none',
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
