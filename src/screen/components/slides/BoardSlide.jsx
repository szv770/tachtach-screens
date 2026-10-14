import React from 'react';
import { fonts } from '../../styles/tokens.js';

/**
 * Legacy "Board" card (messages.json type 'board'), now used for migrated
 * board announcements with look.fit 'fixed' so they look exactly as before.
 */
export default function BoardDisplay({ boards, tokens }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '32px',
    }}>
      {boards.map(board => (
        <div key={board.id} style={{
          width: '100%', maxWidth: '640px',
          padding: '28px 32px',
          background: tokens.surface,
          border: `1px solid ${tokens.goldBd}`,
          borderRadius: '6px',
          marginBottom: '16px',
          textAlign: 'center',
          whiteSpace: 'pre-line', // keep admin-typed line breaks
        }}>
          {board.target && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '11px',
              fontWeight: 600,
              color: tokens.gold,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '12px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
            }}>
              {board.target}
            </div>
          )}
          <div style={{
            fontFamily: fonts.hebrewPrimary,
            fontSize: '26px',
            fontWeight: 500,
            color: tokens.text,
            lineHeight: 1.5,
          }}>
            {board.textHe || board.textEn || board.text}
          </div>
          {board.textEn && board.textHe && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '15px',
              color: tokens.dim,
              marginTop: '10px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
            }}>
              {board.textEn}
            </div>
          )}
          {board.subtitle && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '13px',
              color: tokens.dim,
              marginTop: '10px',
              direction: 'ltr',
              unicodeBidi: 'isolate',
              fontStyle: 'italic',
            }}>
              {board.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
