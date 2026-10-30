/**
 * First-visit welcome tour (and "Take the tour" from Help): a short modal, one
 * idea per step, each with a button that jumps to that part of the admin.
 */
import React, { useState, useEffect } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { TOUR } from '../help/helpContent.js';
import { lockScroll } from './ui/scrollLock.js';

export default function WelcomeTour({ onClose, onGo }) {
  const [i, setI] = useState(0);
  const step = TOUR[i];
  const last = i === TOUR.length - 1;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const unlock = lockScroll();
    return () => { unlock(); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Welcome tour" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: colors.panel, border: `1px solid ${colors.goldBd}`, borderRadius: '12px', maxWidth: '480px', width: '100%', padding: '24px', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '8px' }}>Step {i + 1} of {TOUR.length}</div>
        <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: '0 0 10px' }}>{step.title}</h2>
        <p style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', color: colors.text, lineHeight: 1.55, margin: '0 0 18px' }}>{step.text}</p>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }} aria-hidden>
          {TOUR.map((_, k) => <span key={k} style={{ width: k === i ? '22px' : '8px', height: '8px', borderRadius: '4px', background: k === i ? colors.gold : colors.muted, transition: 'width .2s' }} />)}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {i > 0 && <button style={{ ...buttonSecondary, minHeight: '42px' }} onClick={() => setI(i - 1)}>Back</button>}
          {step.go && <button style={{ ...buttonSecondary, minHeight: '42px' }} onClick={() => { onGo(step.go); onClose(); }}>{step.goLabel}</button>}
          <span style={{ flex: 1 }} />
          {!last && <button style={{ ...buttonSecondary, minHeight: '42px', border: 'none', color: colors.dim }} onClick={onClose}>Skip</button>}
          <button style={{ ...buttonPrimary, minHeight: '42px' }} onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
