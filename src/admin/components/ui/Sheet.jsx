import React, { useEffect, useRef, useState } from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';
import Icon from './Icon.jsx';
import { lockScroll } from './scrollLock.js';

/**
 * Bottom sheet (28px top radius, grabber, serif title). Closes on scrim tap, Escape, the X,
 * or by dragging the grabber down. On wide screens it floats as a centred card.
 */
export default function Sheet({ open, onClose, title, children, zIndex = 1100, maxWidth = 560, label }) {
  const [drag, setDrag] = useState(0);
  const startY = useRef(null);
  const dialogRef = useRef(null);
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900;

  useEffect(() => {
    if (!open) return undefined;
    const unlock = lockScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab / screen-reader focus inside the topmost sheet (it is aria-modal).
      const all = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')];
      const d = dialogRef.current;
      if (!d || all[all.length - 1] !== d) return;
      const f = [...d.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const first = f[0]; const last = f[f.length - 1];
      if (!d.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Move focus into the sheet when it opens and give it back to whatever opened it when it closes.
  useEffect(() => {
    if (!open) return undefined;
    const before = typeof document !== 'undefined' ? document.activeElement : null;
    const d = dialogRef.current;
    if (d && !d.contains(document.activeElement)) d.focus({ preventScroll: true });
    return () => { try { if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true }); } catch { /* ignore */ } };
  }, [open]);

  if (!open) return null;
  const down = (e) => { startY.current = e.clientY; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (startY.current != null) setDrag(Math.max(0, e.clientY - startY.current)); };
  const up = () => { if (drag > 90) onClose?.(); startY.current = null; setDrag(0); };

  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex, background: colors.scrim, display: 'flex',
      alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center',
    }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()} style={{ outline: 'none',
        width: '100%', maxWidth, maxHeight: '92dvh', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', boxSizing: 'border-box', background: colors.card, color: colors.text,
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
