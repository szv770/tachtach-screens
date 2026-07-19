import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts } from '../styles/tokens.js';

// ── Keyframes ──────────────────────────────────────────────────────────────
const COUNTDOWN_KEYFRAMES = `
@keyframes countdownPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@keyframes countdownFlash {
  0% { opacity: 1; }
  50% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes countdownGlow {
  0%, 100% { box-shadow: 0 0 40px var(--glow-color); }
  50% { box-shadow: 0 0 80px var(--glow-color), 0 0 120px var(--glow-color2); }
}
@keyframes countdownFinish {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}
`;

function formatTime(totalSeconds) {
  if (totalSeconds <= 0) return '0';
  if (totalSeconds < 60) return String(totalSeconds);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getCountdownColor(remaining, total, tokens) {
  if (remaining <= 10) return '#EF4444';   // red
  if (remaining <= 30) return '#F59E0B';   // amber
  return tokens.gold;                       // calm gold
}

/**
 * CountdownOverlay — two modes:
 *   mode="slide"    — renders as a regular slide in the carousel
 *   mode="takeover" — renders as a full-screen overlay (z-index 100)
 */
export default function CountdownOverlay({
  countdown,  // { targetTime, eventName, eventNameHe, mode, duration }
  tokens,
  onComplete,
}) {
  const [remaining, setRemaining] = useState(() => {
    if (!countdown?.targetTime) return 0;
    return Math.max(0, Math.ceil((new Date(countdown.targetTime).getTime() - Date.now()) / 1000));
  });
  const [finished, setFinished] = useState(false);
  const rafRef = useRef(null);
  const prevSecRef = useRef(remaining);

  const totalDuration = countdown?.duration || remaining;
  const mode = countdown?.mode || 'slide';

  // Countdown logic using requestAnimationFrame for smooth updates
  const tick = useCallback(() => {
    if (!countdown?.targetTime) return;
    const diff = Math.max(0, Math.ceil((new Date(countdown.targetTime).getTime() - Date.now()) / 1000));

    if (diff !== prevSecRef.current) {
      prevSecRef.current = diff;
      setRemaining(diff);
    }

    if (diff <= 0) {
      setFinished(true);
      // Auto-dismiss after brief flash
      setTimeout(() => {
        onComplete?.();
      }, 1500);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [countdown?.targetTime, onComplete]);

  useEffect(() => {
    if (!countdown?.targetTime) return;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, countdown?.targetTime]);

  if (!countdown) return null;

  const color = getCountdownColor(remaining, totalDuration, tokens);
  const isUrgent = remaining <= 30;
  const isCritical = remaining <= 10;
  const eventName = countdown.eventNameHe || countdown.eventName || '';

  // ── Slide mode ───────────────────────────────────────────────────────────
  if (mode === 'slide') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}>
        <style>{COUNTDOWN_KEYFRAMES}</style>

        {/* Event name */}
        <div style={{
          fontFamily: fonts.hebrewDisplay,
          fontSize: '32px',
          fontWeight: 500,
          color: tokens.text,
          textAlign: 'center',
          lineHeight: 1.3,
        }}>
          {eventName}
        </div>

        {/* Countdown number */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Glow ring behind the number */}
          <div style={{
            position: 'absolute',
            width: '220px',
            height: '220px',
            borderRadius: '50%',
            border: `2px solid ${color}`,
            opacity: 0.3,
            '--glow-color': `${color}33`,
            '--glow-color2': `${color}1A`,
            animation: isUrgent ? 'countdownGlow 1.5s ease-in-out infinite' : 'none',
            transition: 'border-color 0.5s ease',
          }} />

          <AnimatePresence mode="popLayout">
            <motion.div
              key={remaining}
              initial={{ opacity: 0.4, scale: 0.85, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1, y: -10 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                fontFamily: fonts.englishDisplay,
                fontSize: '100px',
                fontWeight: 300,
                color: color,
                letterSpacing: '-2px',
                lineHeight: 1,
                textAlign: 'center',
                minWidth: '200px',
                animation: isUrgent ? 'countdownPulse 1s ease-in-out infinite' : 'none',
                transition: 'color 0.5s ease',
                willChange: 'transform, opacity',
              }}
            >
              {finished ? '' : formatTime(remaining)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* "until..." label */}
        {countdown.eventName && countdown.eventNameHe && (
          <div style={{
            fontFamily: fonts.englishBody,
            fontSize: '14px',
            color: tokens.dim,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            direction: 'ltr',
            unicodeBidi: 'isolate',
          }}>
            {countdown.eventName}
          </div>
        )}

        {/* Finished flash */}
        {finished && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              fontFamily: fonts.hebrewDisplay,
              fontSize: '48px',
              fontWeight: 700,
              color: tokens.gold,
              textShadow: `0 0 40px ${tokens.gold}`,
            }}
          >
            !
          </motion.div>
        )}
      </div>
    );
  }

  // ── Takeover mode ────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {!finished ? (
        <motion.div
          key="countdown-takeover"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: isCritical
              ? `linear-gradient(180deg, #1a0800 0%, ${tokens.bg} 100%)`
              : tokens.bg,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '40px',
            transition: 'background 1s ease',
          }}
        >
          <style>{COUNTDOWN_KEYFRAMES}</style>

          {/* Radial glow behind */}
          <div style={{
            position: 'absolute',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
            pointerEvents: 'none',
            animation: isUrgent ? 'countdownPulse 2s ease-in-out infinite' : 'none',
          }} />

          {/* Event name */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            style={{
              fontFamily: fonts.hebrewDisplay,
              fontSize: '48px',
              fontWeight: 600,
              color: tokens.text,
              textAlign: 'center',
              zIndex: 1,
              lineHeight: 1.3,
            }}
          >
            {eventName}
          </motion.div>

          {/* HUGE countdown */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={remaining}
                initial={{ opacity: 0.3, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.15, y: -20 }}
                transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{
                  fontFamily: fonts.englishDisplay,
                  fontSize: isCritical ? '260px' : '220px',
                  fontWeight: 200,
                  color: color,
                  letterSpacing: '-4px',
                  lineHeight: 1,
                  textAlign: 'center',
                  textShadow: `0 0 60px ${color}44`,
                  animation: isCritical ? 'countdownPulse 0.8s ease-in-out infinite' : (isUrgent ? 'countdownPulse 1.5s ease-in-out infinite' : 'none'),
                  transition: 'color 0.5s ease, font-size 0.3s ease',
                  willChange: 'transform, opacity',
                }}
              >
                {formatTime(remaining)}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* English name under */}
          {countdown.eventName && countdown.eventNameHe && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              style={{
                fontFamily: fonts.englishDisplay,
                fontSize: '24px',
                fontWeight: 300,
                color: tokens.dim,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                zIndex: 1,
                direction: 'ltr',
                unicodeBidi: 'isolate',
              }}
            >
              {countdown.eventName}
            </motion.div>
          )}

          {/* Top/bottom accent lines */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, height: '4px',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            opacity: 0.6,
          }} />
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0, height: '4px',
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            opacity: 0.6,
          }} />
        </motion.div>
      ) : (
        /* Finished state — brief celebration flash */
        <motion.div
          key="countdown-finish"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: tokens.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <motion.div
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: fonts.hebrewDisplay,
              fontSize: '120px',
              fontWeight: 700,
              color: tokens.gold,
              textShadow: `0 0 80px ${tokens.gold}, 0 0 160px ${tokens.gold}`,
            }}
          >
            !
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
