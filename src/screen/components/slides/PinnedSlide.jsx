import React from 'react';
import { fonts } from '../../styles/tokens.js';

export default function PinnedSlide({ slide, tokens }) {
  const { textHe, textEn } = slide || {};

  // When only English is provided, promote it to primary styling
  const hasHebrew = !!textHe;

  return (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Decorative accent */}
      <div style={{
        width: '40px',
        height: '3px',
        background: tokens.gold,
        borderRadius: '2px',
        marginBottom: '32px',
        opacity: 0.6,
      }} />

      {/* Hebrew text */}
      {textHe && (
        <div style={{
          fontFamily: fonts.hebrewDisplay,
          fontSize: '48px',
          fontWeight: 600,
          color: tokens.text,
          lineHeight: 1.4,
          marginBottom: textEn ? '24px' : 0,
        }}>
          {textHe}
        </div>
      )}

      {/* Divider between Hebrew and English */}
      {textHe && textEn && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '8px 0 24px',
          width: '40%',
        }}>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
          <span style={{ color: tokens.gold, fontSize: '10px' }}>{'\u2726'}</span>
          <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
        </div>
      )}

      {/* English text — promoted to primary when no Hebrew */}
      {textEn && (
        <div style={{
          fontFamily: hasHebrew ? fonts.englishDisplay : fonts.englishDisplay,
          fontSize: hasHebrew ? '28px' : '48px',
          fontWeight: hasHebrew ? 300 : 500,
          color: hasHebrew ? tokens.dim : tokens.text,
          lineHeight: 1.5,
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          {textEn}
        </div>
      )}
    </div>
  );
}
