import React from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../styles/tokens.js';

export default function Clock({ formatted, ampm, seconds, tokens, compact }) {
  const parts = formatted.split(':');
  const hours = parts[0] || '';
  const minutes = parts[1] || '';

  return (
    <div style={{ textAlign: 'center', padding: compact ? '8px 0 4px' : '32px 0 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            fontFamily: fonts.englishDisplay,
            fontWeight: 300,
            fontSize: compact ? '48px' : 'clamp(80px, 10vw, 128px)',
            lineHeight: 1,
            color: tokens.text,
            letterSpacing: '-0.02em',
          }}
        >
          <span>{hours}</span>
          <motion.span
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ margin: '0 2px' }}
          >
            :
          </motion.span>
          <span>{minutes}</span>
        </div>
        <div
          style={{
            fontFamily: fonts.englishDisplay,
            fontWeight: 300,
            fontSize: compact ? '14px' : '22px',
            color: tokens.dim,
            letterSpacing: '0.1em',
            marginLeft: '8px',
            marginTop: compact ? '4px' : '8px',
            flexShrink: 0,
          }}
        >
          {ampm}
        </div>
      </div>
    </div>
  );
}
