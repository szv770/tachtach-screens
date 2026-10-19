import React, { useState, useId } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from './Icon.jsx';

/**
 * Settings row that opens in place. Default CLOSED; the closed header always shows a
 * one-line summary of the current value. `edited` adds the gold "changed" dot.
 * `id` is the search anchor (GlobalSearch opens it before scrolling to it).
 */
export default function Collapsible({ title, summary, children, defaultOpen = false, edited = false, id, icon, style }) {
  const [open, setOpen] = useState(defaultOpen);
  const uid = useId();
  return (
    <section id={id} className="tt-coll" style={{
      background: colors.card, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)',
      border: `1px solid ${edited ? 'var(--gold)' : 'var(--line)'}`, overflow: 'hidden', ...style,
    }}>
      <button
        type="button" aria-expanded={open} aria-controls={`${uid}-b`} onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', width: '100%', minHeight: '64px',
          padding: '10px 16px', background: edited ? 'var(--gold-soft)' : 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left', color: colors.text, fontFamily: adminFonts.englishBody,
        }}
      >
        {icon && <span style={{ color: colors.dim, display: 'grid' }}><Icon name={icon} size={20} /></span>}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, letterSpacing: '-.01em' }}>
            {title}
            {edited && <span title="Edited" aria-label="Edited" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
          </span>
          {summary != null && summary !== '' && (
            <span style={{ display: 'block', fontSize: '13px', color: colors.dim, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
          )}
        </span>
        <Icon name="chevdown" size={20} style={{ color: colors.muted, transition: 'transform var(--t-base) var(--ease)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <div id={`${uid}-b`} role="region" className="tt-coll-body" data-open={open ? 'true' : 'false'}>
        <div>
          <div style={{ padding: '4px 16px 16px', borderTop: `1px solid ${colors.line}` }}>{open ? children : null}</div>
        </div>
      </div>
    </section>
  );
}
