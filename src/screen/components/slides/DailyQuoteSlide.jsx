import React from 'react';
import { fonts } from '../../styles/tokens.js';

export default function DailyQuoteSlide({ cache, tokens }) {
  const quote = cache?.dailyQuote;
  if (!quote?.text) return null;

  return (
    <div style={{
      width: '100%',
      maxWidth: '700px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      {/* Large quote mark */}
      <div style={{
        fontFamily: 'Georgia, serif',
        fontSize: '72px',
        color: tokens.gold,
        lineHeight: 0.6,
        marginBottom: '16px',
        opacity: 0.5,
      }}>
        {'\u201C'}
      </div>

      {/* Quote text */}
      <div style={{
        fontFamily: fonts.englishDisplay,
        fontSize: '24px',
        fontWeight: 400,
        fontStyle: 'italic',
        color: tokens.text,
        lineHeight: 1.5,
        direction: 'ltr',
        unicodeBidi: 'isolate',
        marginBottom: '24px',
        width: '100%',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      }}>
        {quote.text}
      </div>

      {/* Source attribution */}
      {quote.source && (
        <div style={{
          fontFamily: fonts.englishBody,
          fontSize: '16px',
          color: tokens.gold,
          letterSpacing: '0.06em',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}>
          — {quote.source}
        </div>
      )}
    </div>
  );
}
