import React from 'react';
import { motion } from 'framer-motion';

/**
 * Animated text — letter-by-letter wave reveal (LTR).
 * Each character fades in and slides up with a staggered delay.
 * Mirrors the @shadcn-space/animated-text-05 pattern.
 */
export default function AnimatedText({ text = 'Loading', style = {}, charStyle = {} }) {
  const chars = text.split('');

  const container = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.07,
        repeat: Infinity,
        repeatDelay: 0.8,
        repeatType: 'loop',
      },
    },
  };

  const child = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 300, damping: 20 },
    },
  };

  return (
    <motion.span
      variants={container}
      initial="hidden"
      animate="visible"
      style={{
        display: 'inline-flex',
        direction: 'ltr',
        unicodeBidi: 'isolate',
        ...style,
      }}
    >
      {chars.map((char, i) => (
        <motion.span
          key={i}
          variants={child}
          style={{
            display: 'inline-block',
            whiteSpace: char === ' ' ? 'pre' : 'normal',
            ...charStyle,
          }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}
