import React from 'react';
import { fonts } from '../../styles/tokens.js';

export default function TextSlide({ slide, tokens }) {
  const { template, titleHe, titleEn, bodyHe, bodyEn, attribution } = slide || {};

  // When only English is provided (no Hebrew), promote English to primary styling
  const hasHebrew = !!(titleHe || bodyHe);

  switch (template) {
    case 'headline':
      return (
        <div style={{ textAlign: 'center', width: '100%' }}>
          {titleHe && <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: '72px', fontWeight: 700, color: tokens.text, lineHeight: 1.2 }}>{titleHe}</div>}
          {titleEn && (
            <div style={{
              fontFamily: fonts.englishDisplay,
              fontSize: hasHebrew ? '36px' : '60px',
              fontWeight: hasHebrew ? 300 : 600,
              color: hasHebrew ? tokens.dim : tokens.text,
              direction: 'ltr',
              unicodeBidi: 'isolate',
              marginTop: titleHe ? '8px' : 0,
            }}>
              {titleEn}
            </div>
          )}
        </div>
      );

    case 'quote':
      return (
        <div style={{ textAlign: 'center', width: '100%', maxWidth: '650px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Decorative opening quote mark */}
          <div style={{
            fontFamily: 'Georgia, serif',
            fontSize: '64px',
            color: tokens.gold,
            lineHeight: 0.6,
            marginBottom: '16px',
            opacity: 0.45,
          }}>
            {'\u201C'}
          </div>

          {/* Main quote: title fields */}
          {titleHe && (
            <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '30px', fontWeight: 500, color: tokens.text, lineHeight: 1.7, marginBottom: titleEn ? '8px' : '0' }}>
              {titleHe}
            </div>
          )}
          {titleEn && (
            <div style={{
              fontFamily: fonts.englishDisplay,
              fontSize: hasHebrew ? '22px' : '30px',
              fontWeight: hasHebrew ? 300 : 400,
              fontStyle: 'italic',
              color: hasHebrew ? tokens.dim : tokens.text,
              direction: 'ltr',
              unicodeBidi: 'isolate',
              lineHeight: 1.6,
            }}>
              {titleEn}
            </div>
          )}

          {/* Additional body text (if any) */}
          {(bodyHe || bodyEn) && (
            <div style={{ marginTop: '16px' }}>
              {bodyHe && (
                <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '20px', fontWeight: 400, color: tokens.dim, lineHeight: 1.7 }}>
                  {bodyHe}
                </div>
              )}
              {bodyEn && (
                <div style={{
                  fontFamily: fonts.englishBody,
                  fontSize: hasHebrew ? '15px' : '20px',
                  fontWeight: 300,
                  color: tokens.dim,
                  direction: 'ltr',
                  unicodeBidi: 'isolate',
                  lineHeight: 1.6,
                  marginTop: bodyHe ? '6px' : 0,
                }}>
                  {bodyEn}
                </div>
              )}
            </div>
          )}

          {/* Attribution — clearly separated */}
          {attribution && (
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '15px',
              color: tokens.gold,
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: `1px solid ${tokens.muted}40`,
              direction: 'ltr',
              letterSpacing: '0.04em',
            }}>
              — {attribution}
            </div>
          )}
        </div>
      );

    case 'info':
      return (
        <div style={{ width: '100%', maxWidth: '600px' }}>
          {titleHe && <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: '36px', fontWeight: 500, color: tokens.gold, marginBottom: '20px' }}>{titleHe}</div>}
          {titleEn && !titleHe && <div style={{ fontFamily: fonts.englishDisplay, fontSize: '36px', fontWeight: 500, color: tokens.gold, marginBottom: '20px', direction: 'ltr' }}>{titleEn}</div>}
          {titleEn && titleHe && <div style={{ fontFamily: fonts.englishBody, fontSize: '18px', color: tokens.dim, marginBottom: '12px', direction: 'ltr', unicodeBidi: 'isolate' }}>{titleEn}</div>}
          {bodyHe && (
            <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '20px', fontWeight: 500, color: tokens.text, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
              {bodyHe}
            </div>
          )}
          {bodyEn && (
            <div style={{
              fontFamily: hasHebrew ? fonts.englishBody : fonts.englishDisplay,
              fontSize: hasHebrew ? '14px' : '20px',
              color: hasHebrew ? tokens.dim : tokens.text,
              lineHeight: 1.6,
              direction: 'ltr',
              unicodeBidi: 'isolate',
              marginTop: bodyHe ? '16px' : 0,
              whiteSpace: 'pre-wrap',
            }}>
              {bodyEn}
            </div>
          )}
        </div>
      );

    case 'announcement':
    default:
      return (
        <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
          {titleHe && <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: '42px', fontWeight: 500, color: tokens.gold, marginBottom: '16px' }}>{titleHe}</div>}
          {titleEn && (
            <div style={{
              fontFamily: hasHebrew ? fonts.englishBody : fonts.englishDisplay,
              fontSize: hasHebrew ? '18px' : '42px',
              fontWeight: hasHebrew ? 400 : 500,
              color: hasHebrew ? tokens.dim : tokens.gold,
              direction: 'ltr',
              unicodeBidi: 'isolate',
              marginBottom: '20px',
            }}>
              {titleEn}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '12px 0' }}>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to right, transparent, ${tokens.muted})` }} />
            <span style={{ color: tokens.gold, fontSize: '10px' }}>✦</span>
            <div style={{ flex: 1, height: '1px', background: `linear-gradient(to left, transparent, ${tokens.muted})` }} />
          </div>
          {bodyHe && <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '22px', fontWeight: 500, color: tokens.text, lineHeight: 1.7 }}>{bodyHe}</div>}
          {bodyEn && (
            <div style={{
              fontFamily: hasHebrew ? fonts.englishBody : fonts.englishDisplay,
              fontSize: hasHebrew ? '15px' : '22px',
              color: hasHebrew ? tokens.dim : tokens.text,
              direction: 'ltr',
              unicodeBidi: 'isolate',
              marginTop: bodyHe ? '12px' : 0,
              lineHeight: 1.6,
            }}>
              {bodyEn}
            </div>
          )}
        </div>
      );
  }
}
