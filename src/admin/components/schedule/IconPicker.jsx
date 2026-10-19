/** Icon chooser (grid popover) for a block or category. Moved out of the old ScheduleEditor unchanged. */
import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, inputStyle } from '../../styles/admin-tokens.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import { ICON_OPTIONS, ScheduleIcon } from '../../../shared/ScheduleIcons.jsx';

export function IconPicker({ value, onChange, label = 'Icon' }) {
  const [showPicker, setShowPicker] = useState(false);
  const rootRef = useRef(null);
  const isMobile = useIsMobile();

  // Close on outside click/tap and Escape — previously the picker stayed open
  // until you picked an icon or clicked the trigger again.
  useEffect(() => {
    if (!showPicker) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setShowPicker(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setShowPicker(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPicker]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>{label}</label>
      <button
        type="button"
        onClick={() => setShowPicker(!showPicker)}
        style={{
          ...inputStyle,
          marginTop: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: '70px', minHeight: '44px',
          textAlign: 'left',
        }}
      >
        {value ? (
          <ScheduleIcon iconKey={value} size={18} color={colors.text} />
        ) : (
          <span style={{ color: colors.muted, fontSize: '13px' }}>None</span>
        )}
      </button>
      {showPicker && (
        <div style={{
          position: 'absolute',
          top: '100%',
          // On mobile, anchor to the right edge — the picker often sits at the
          // right side of a row, and a left-anchored 260px panel would spill
          // past the screen edge and force horizontal scrolling.
          ...(isMobile ? { right: 0 } : { left: 0 }),
          zIndex: 100,
          background: colors.surface,
          border: `1px solid ${colors.muted}`,
          borderRadius: '6px',
          padding: '8px',
          marginTop: '4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          minWidth: '260px',
          maxWidth: isMobile ? 'calc(100vw - 48px)' : undefined,
        }}>
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => { onChange(opt.value); setShowPicker(false); }}
              title={opt.label}
              style={{
                background: value === opt.value ? colors.goldBg : 'transparent',
                border: value === opt.value ? `1px solid ${colors.gold}` : `1px solid transparent`,
                borderRadius: '4px',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '40px',
                minHeight: '40px',
                color: colors.dim,
                fontFamily: adminFonts.englishBody,
              }}
            >
              {opt.value ? (
                <ScheduleIcon iconKey={opt.value} size={20} color={value === opt.value ? colors.gold : colors.dim} />
              ) : (
                <span style={{ fontSize: '11px' }}>{'\u2013'}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
