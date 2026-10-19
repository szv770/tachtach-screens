import React from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';

export const labelStyle = { display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: colors.dim, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 6px' };

/** A 44px-tall pill that toggles. */
export function Chip({ on, onClick, children, danger, title, dataKey }) {
  return (
    <button type="button" aria-pressed={on} title={title} data-key={dataKey} onClick={onClick} style={{
      minHeight: '44px', padding: '0 16px', borderRadius: 'var(--r-pill)', cursor: 'pointer', whiteSpace: 'nowrap',
      fontFamily: adminFonts.englishBody, fontSize: '14px', fontWeight: 600,
      border: `1px solid ${on ? colors.accent : colors.line}`, background: on ? colors.accentSoft : colors.card,
      color: danger ? colors.danger : on ? colors.accent : colors.text,
    }}>{children}</button>
  );
}

export function Row({ children, style }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', ...style }}>{children}</div>;
}

export const field = { ...inputStyle, width: '100%', minHeight: '48px', fontSize: '16px', boxSizing: 'border-box' };

export function Btn({ children, onClick, primary, danger, disabled, style, ...rest }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} {...rest} style={{
      minHeight: '48px', padding: '0 18px', borderRadius: 'var(--r-md)', cursor: disabled ? 'default' : 'pointer', fontWeight: 700,
      fontFamily: adminFonts.englishBody, fontSize: '15px', opacity: disabled ? 0.55 : 1,
      border: primary ? 'none' : `1px solid ${danger ? colors.danger : colors.line}`,
      background: primary ? colors.accent : colors.card, color: primary ? colors.accentInk : danger ? colors.danger : colors.text,
      ...style,
    }}>{children}</button>
  );
}

export function ErrorLine({ children }) {
  if (!children) return null;
  return <div role="alert" style={{ color: colors.danger, fontFamily: adminFonts.englishBody, fontSize: '13.5px', margin: '8px 0' }}>{children}</div>;
}
