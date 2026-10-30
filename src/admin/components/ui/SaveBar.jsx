import React from 'react';
import { colors, adminFonts } from '../../styles/admin-tokens.js';

/**
 * Floating "Unsaved changes · n edited — Revert / Save" bar (ink pill, Direction A).
 * Renders nothing when `count` is 0. Sits above the mobile tab bar (--tt-tabbar-h).
 */
export default function SaveBar({ count = 0, onRevert, onSave, saving = false, error = '' }) {
  if (!count) return null;
  return (
    <>
    {/* The bar floats, so leave room under the page's last control while it shows (it would cover it otherwise). */}
    <div aria-hidden="true" data-testid="save-bar-spacer" style={{ height: '84px' }} />
    <div role="region" aria-label="Unsaved changes" data-testid="save-bar" style={{
      position: 'fixed', left: '12px', right: '12px', zIndex: 850,
      bottom: 'calc(var(--tt-tabbar-h) + 12px + env(safe-area-inset-bottom))',
      maxWidth: '560px', margin: '0 auto',
      background: colors.text, color: colors.bg, borderRadius: 'var(--r-lg)',
      padding: '8px 8px 8px 16px', display: 'flex', alignItems: 'center', gap: '8px',
      boxShadow: 'var(--e3)', fontFamily: adminFonts.englishBody,
    }}>
      <div style={{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 700 }}>
        Unsaved changes
        <small style={{ display: 'block', fontWeight: 500, opacity: 0.7, fontSize: '12px' }}>
          {error ? error : `${count} edited`}
        </small>
      </div>
      <button type="button" onClick={onRevert} disabled={saving} style={{
        minHeight: '44px', padding: '0 12px', fontWeight: 700, fontSize: '14px', color: 'inherit',
        background: 'transparent', border: 'none', opacity: 0.85, cursor: 'pointer', fontFamily: 'inherit',
      }}>Revert</button>
      <button type="button" onClick={onSave} disabled={saving} style={{
        minHeight: '44px', padding: '0 18px', borderRadius: 'var(--r-sm)', background: 'var(--accent)',
        color: '#fff', fontWeight: 800, fontSize: '14px', border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
        opacity: saving ? 0.7 : 1,
      }}>{saving ? 'Saving…' : 'Save'}</button>
    </div>
    </>
  );
}
