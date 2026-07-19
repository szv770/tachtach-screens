import React from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';

const SIZE_MAP = {
  small:  { height: 28, fontSize: 14 },
  normal: { height: 34, fontSize: 16 },
  large:  { height: 48, fontSize: 22 },
};

const SPEED_MAP = {
  slow:   0.38,
  normal: 0.22,
  fast:   0.12,
};

export default function Banner({ banners, tokens, bannerSettings }) {
  if (!banners?.length) return null;

  // Per-message settings take precedence over global banner settings
  const msg = banners[0];
  const size  = SIZE_MAP[msg?.bannerSize  || bannerSettings?.size]  || SIZE_MAP.normal;
  const speed = SPEED_MAP[msg?.bannerSpeed || bannerSettings?.speed] ?? SPEED_MAP.normal;
  const repeat = msg?.bannerRepeat || bannerSettings?.repeat || 'loop';

  const singleText = banners.map(b => b.textHe || b.textEn || b.text).join('  \u2003|\u2003  ');
  const singleWithTail = singleText + '   \u2014   ';
  const REPEATS = Math.max(3, Math.ceil(400 / (singleWithTail.length + 2)));
  const text = Array(REPEATS).fill(singleWithTail).join('');
  const scrollDuration = Math.max(10, text.length * speed);

  const transition = repeat === 'wait'
    ? { duration: scrollDuration, repeat: Infinity, repeatDelay: 4, ease: 'linear' }
    : { duration: scrollDuration, repeat: Infinity, ease: 'linear' };

  return (
    <div style={{
      width: '100%',
      height: `${size.height}px`,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
      background: `linear-gradient(to top, ${tokens.bg}, ${tokens.bg}e8)`,
      borderTop: `1px solid ${tokens.framePrimary}`,
      position: 'relative',
    }}>
      {/* Left gradient fade */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '60px', height: '100%',
        background: `linear-gradient(to right, ${tokens.bg}, transparent)`,
        zIndex: 2, pointerEvents: 'none',
      }} />
      {/* Right gradient fade */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '60px', height: '100%',
        background: `linear-gradient(to left, ${tokens.bg}, transparent)`,
        zIndex: 2, pointerEvents: 'none',
      }} />

      <motion.div
        animate={{ x: ['100%', '-100%'] }}
        transition={transition}
        style={{
          whiteSpace: 'nowrap',
          fontFamily: fonts.hebrewPrimary,
          fontSize: `${size.fontSize}px`,
          fontWeight: 500,
          color: tokens.gold,
          direction: 'rtl',
          unicodeBidi: 'plaintext',
          zIndex: 1,
        }}
      >
        {text}
      </motion.div>
    </div>
  );
}
