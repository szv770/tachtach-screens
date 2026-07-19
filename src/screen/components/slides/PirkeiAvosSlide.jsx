import React from 'react';
import { fonts } from '../../styles/tokens.js';
import { getCurrentPerek } from '../../../shared/pirkeiAvos.js';

export default function PirkeiAvosSlide({ cache, tokens }) {
  const hebrewDate = cache?.hebrewDate;
  const perekInfo = getCurrentPerek(hebrewDate);

  return (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Title */}
      <div style={{
        fontFamily: fonts.hebrewDisplay,
        fontSize: '48px',
        fontWeight: 700,
        color: tokens.text,
        lineHeight: 1.2,
        marginBottom: '8px',
      }}>
        {'\u05E4\u05E8\u05E7\u05D9 \u05D0\u05D1\u05D5\u05EA'}
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: fonts.englishDisplay,
        fontSize: '20px',
        fontWeight: 400,
        fontStyle: 'italic',
        color: tokens.dim,
        direction: 'ltr',
        unicodeBidi: 'isolate',
        marginBottom: '24px',
      }}>
        Ethics of the Fathers
      </div>

      {/* Ornamental divider */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: '0 0 28px',
        width: '60%',
      }}>
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
        <span style={{ color: tokens.gold, fontSize: '10px', letterSpacing: '0.3em' }}>{'\u2726 \u25C7 \u2726'}</span>
        <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
      </div>

      {/* Chapter chip */}
      {perekInfo ? (
        <div style={{
          display: 'inline-block',
          padding: '6px 24px',
          background: tokens.goldBg,
          border: `1px solid ${tokens.goldBd}`,
          borderRadius: '4px',
        }}>
          <span style={{
            fontFamily: fonts.hebrewDisplay,
            fontSize: '28px',
            fontWeight: 600,
            color: tokens.gold,
          }}>
            {perekInfo.hebrewName}
          </span>
          <div style={{
            fontFamily: fonts.englishDisplay,
            fontSize: '14px',
            fontWeight: 400,
            color: tokens.dim,
            direction: 'ltr',
            unicodeBidi: 'isolate',
            marginTop: '2px',
          }}>
            {perekInfo.englishName}
          </div>
        </div>
      ) : (
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '16px',
          color: tokens.dim,
          fontStyle: 'italic',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          Not in season
        </div>
      )}
    </div>
  );
}
