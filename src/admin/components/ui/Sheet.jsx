import React, { useEffect, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from './Icon.jsx';

/**
 * Bottom sheet (28px top radius, grabber, serif title). Closes on scrim tap, Escape, the X,
 * or by dragging the grabber down. On wide screens it floats as a centred card.
 */
export default function Sheet({ open, onClose, title, children, zIndex = 1100, maxWidth = 560, label }) {
  const [drag, setDrag] = useState(0);
  const startY = useRef(null);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900;

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (!open) return null;
  const down = (e) => { startY.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (startY.current != null) setDrag(Math.max(0, e.clientY - startY.current)); };
  const up = () => { if (drag > 90) onClose?.(); startY.current = null; setDrag(0); };

  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex, background: colors.scrim, display: 'flex',
      alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center',
    }}>
      <div role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth, maxHeight: '92dvh', overflowY: 'auto', background: colors.card, color: colors.text,
        borderRadius: wide ? 'var(--r-xl)' : 'var(--r-xl) var(--r-xl) 0 0', boxShadow: 'var(--e3)',
        padding: `8px 16px calc(24px + env(safe-area-inset-bottom))`, transform: `translateY(${drag}px)`,
        transition: startY.current == null ? 'transform var(--t-sheet) var(--ease)' : 'none', fontFamily: adminFonts.englishBody,
      }}>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          style={{ padding: '8px 0 6px', cursor: 'grab', touchAction: 'none' }} aria-hidden="true">
          <div style={{ width: 40, height: 5, borderRadius: 3, background: colors.line, margin: '0 auto', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }} />
        </div>
        {(title || onClose) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' }}>
            <h2 style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: '22px', margin: 0 }}>{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" style={{
              width: 44, height: 44, borderRadius: '50%', border: 'none', background: colors.sunken, color: colors.dim, cursor: 'pointer', display: 'grid', placeItems: 'center',
            }}><Icon name="close" size={18} /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
