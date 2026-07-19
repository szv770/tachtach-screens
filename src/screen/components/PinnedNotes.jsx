import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts } from '../styles/tokens.js';

export default function PinnedNotes({ pinned, tokens, visibility }) {
  const [startIndex, setStartIndex] = useState(0);
  const MAX_VISIBLE = 3;

  // Filter out pinned notes that are displayed as slides
  const notes = pinned?.filter(p => p.displayMode !== 'slide') || [];

  // Auto-scroll if more than 3
  useEffect(() => {
    if (notes.length <= MAX_VISIBLE) return;
    const id = setInterval(() => {
      setStartIndex(prev => (prev + 1) % notes.length);
    }, 4000);
    return () => clearInterval(id);
  }, [notes.length]);

  if (visibility?.pinnedNotes === false || !notes.length) return null;

  const visible = [];
  for (let i = 0; i < Math.min(MAX_VISIBLE, notes.length); i++) {
    visible.push(notes[(startIndex + i) % notes.length]);
  }

  return (
    <div style={{ padding: '16px', marginTop: '16px' }}>
      {/* Ornamental divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            flex: 1,
            height: '1px',
            background: `linear-gradient(to right, transparent, ${tokens.muted})`,
          }}
        />
        <span style={{ color: tokens.gold, fontSize: '10px' }}>{'\u2726'}</span>
        <div
          style={{
            flex: 1,
            height: '1px',
            background: `linear-gradient(to left, transparent, ${tokens.muted})`,
          }}
        />
      </div>

      <AnimatePresence mode="popLayout">
        {visible.map(note => {
          // Determine primary (English) and secondary (Hebrew) text
          const engText = note.textEn || (!note.textHe ? (note.text || '') : '');
          const hebText = note.textHe || '';
          // If only Hebrew exists with no English, treat Hebrew as primary
          const primaryEn = engText;
          const primaryHe = !engText ? hebText : '';
          const subHe = engText ? hebText : '';

          return (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '6px 0',
                textAlign: 'center',
              }}
            >
              {primaryEn && (
                <span style={{
                  fontFamily: fonts.englishBody,
                  fontSize: '15px',
                  fontWeight: 500,
                  color: tokens.text,
                  lineHeight: 1.4,
                  direction: 'ltr',
                  display: 'block',
                }}>
                  {primaryEn}
                </span>
              )}
              {primaryHe && (
                <span style={{
                  fontFamily: fonts.hebrewPrimary,
                  fontSize: '15px',
                  fontWeight: 500,
                  color: tokens.text,
                  lineHeight: 1.4,
                  direction: 'rtl',
                  unicodeBidi: 'isolate',
                  display: 'block',
                }}>
                  {primaryHe}
                </span>
              )}
              {subHe && (
                <span style={{
                  fontFamily: fonts.hebrewPrimary,
                  fontSize: '13px',
                  fontWeight: 400,
                  color: tokens.dim,
                  lineHeight: 1.4,
                  direction: 'rtl',
                  unicodeBidi: 'isolate',
                  display: 'block',
                  marginTop: '2px',
                }}>
                  {subHe}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
