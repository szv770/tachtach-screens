/**
 * The small "..." button on a schedule block (week view card, by-date row). Opens a sheet with the
 * block's actions (Edit, Set group times..., Copy this day to..., Change only this day, Delete) so rows
 * stay clean on a phone. `items` = [{ key, label, hint?, danger?, onClick }]; nothing renders when empty.
 */
import React, { useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Sheet from '../ui/Sheet.jsx';

export default function BlockMenu({ name, items, style }) {
  const [open, setOpen] = useState(false);
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <>
      <button type="button" aria-label={`More options for ${name || 'this block'}`} aria-haspopup="dialog" data-testid="block-menu"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{ width: 44, height: 44, minWidth: 44, border: `1px solid ${colors.line}`, background: colors.card, color: colors.dim, borderRadius: 'var(--r-sm)', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: '22px', lineHeight: 1, fontWeight: 700, flexShrink: 0, ...style }}>
        <span aria-hidden="true">{'⋯'}</span>
      </button>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={name || 'Block'} maxWidth={420} label="Block options">
          <div role="menu" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            {list.map((it) => (
              <button key={it.key} type="button" role="menuitem" data-testid={`menu-${it.key}`}
                onClick={() => { setOpen(false); it.onClick(); }}
                style={{ minHeight: '52px', textAlign: 'left', padding: '8px 14px', borderRadius: 'var(--r-sm)', border: `1px solid ${it.danger ? colors.danger : colors.line}`, background: 'transparent', cursor: 'pointer', fontFamily: adminFonts.englishBody, color: it.danger ? colors.danger : colors.text }}>
                <span style={{ display: 'block', fontSize: '15px', fontWeight: 700 }}>{it.label}</span>
                {it.hint && <span style={{ display: 'block', fontSize: '12px', color: colors.dim, marginTop: '2px' }}>{it.hint}</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
