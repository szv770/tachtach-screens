import React, { useMemo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';

// ── Style-specific keyframe CSS ────────────────────────────────────────────
const TAKEOVER_KEYFRAMES = `
/* ---- EMERGENCY ---- */
@keyframes emergencyPulse {
  0%, 100% { background-color: #1a0000; }
  50% { background-color: #7B0000; }
}
@keyframes emergencyStripeSweep {
  0% { background-position: 0 0; }
  100% { background-position: 80px 0; }
}
@keyframes emergencyIconPulse {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 30px rgba(255,50,50,.8)); }
  50% { transform: scale(1.15); filter: drop-shadow(0 0 60px rgba(255,50,50,1)); }
}
@keyframes emergencyVignette {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes emergencyTextGlow {
  0%, 100% { text-shadow: 0 0 20px rgba(255,255,255,.3), 0 0 60px rgba(220,38,38,.5); }
  50% { text-shadow: 0 0 40px rgba(255,255,255,.6), 0 0 100px rgba(220,38,38,.8), 0 0 150px rgba(220,38,38,.4); }
}
@keyframes emergencyWatermark {
  0%, 100% { opacity: 0.03; }
  50% { opacity: 0.07; }
}

/* ---- GRAND ---- */
@keyframes grandShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes grandSparkle {
  0% { transform: translateY(100vh) scale(0); opacity: 0; }
  10% { opacity: 1; transform: translateY(80vh) scale(1); }
  90% { opacity: 1; transform: translateY(-80vh) scale(1); }
  100% { transform: translateY(-100vh) scale(0); opacity: 0; }
}
@keyframes grandRadial {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}
@keyframes grandBorderGlow {
  0%, 100% { box-shadow: inset 0 0 60px rgba(212,168,75,.15), 0 0 30px rgba(212,168,75,.1); }
  50% { box-shadow: inset 0 0 100px rgba(212,168,75,.25), 0 0 60px rgba(212,168,75,.2); }
}

/* ---- CELEBRATION ---- */
@keyframes celebrationBg {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes celebrationConfettiA {
  0% { transform: translateY(-20vh) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(120vh) rotate(1080deg) scale(0.5); opacity: 0.3; }
}
@keyframes celebrationConfettiB {
  0% { transform: translateY(-20vh) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(120vh) rotate(-720deg) scale(0.7); opacity: 0.2; }
}
@keyframes celebrationEmoji {
  0% { transform: translateY(110vh) scale(0.5) rotate(-20deg); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-20vh) scale(1.2) rotate(20deg); opacity: 0; }
}

/* ---- SLEEK ---- */
@keyframes sleekCursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ---- URGENT ---- */
@keyframes urgentBorderPulse {
  0%, 100% { border-color: #FBBF24; box-shadow: inset 0 0 60px rgba(251,191,36,.1); }
  50% { border-color: #F59E0B; box-shadow: inset 0 0 120px rgba(251,191,36,.2); }
}
@keyframes urgentIconBob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-10px) scale(1.05); }
}
@keyframes urgentStripeSweep {
  0% { background-position: 0 0; }
  100% { background-position: 60px 0; }
}

/* ---- TORAH ---- */
@keyframes torahGlow {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50% { opacity: 0.65; transform: scale(1.08); }
}
@keyframes torahLetterFloat {
  0% { transform: translateY(0) rotate(0deg); opacity: 0.04; }
  33% { transform: translateY(-25px) rotate(2deg); opacity: 0.08; }
  66% { transform: translateY(10px) rotate(-1deg); opacity: 0.05; }
  100% { transform: translateY(0) rotate(0deg); opacity: 0.04; }
}
@keyframes torahScrollShine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes torahParchmentPulse {
  0%, 100% { opacity: 0.04; }
  50% { opacity: 0.08; }
}

/* ---- TRIP ---- */
@keyframes tripCloudDrift {
  0% { transform: translateX(110vw); }
  100% { transform: translateX(-110vw); }
}
@keyframes tripCompassNeedle {
  0%, 100% { transform: rotate(-10deg); }
  25% { transform: rotate(5deg); }
  75% { transform: rotate(-5deg); }
}
@keyframes tripMountainBreath {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.02); }
}

/* ---- PHONE ---- */
@keyframes phoneRing {
  0%, 100% { transform: rotate(0deg) scale(1); }
  8% { transform: rotate(-14deg) scale(1.06); }
  16% { transform: rotate(14deg) scale(1.06); }
  24% { transform: rotate(-10deg) scale(1.03); }
  32% { transform: rotate(10deg) scale(1.03); }
  40% { transform: rotate(-4deg) scale(1.01); }
  48% { transform: rotate(0deg) scale(1); }
}
@keyframes phoneRipple {
  0% { transform: scale(1); opacity: 0.5; border-width: 3px; }
  100% { transform: scale(3.5); opacity: 0; border-width: 1px; }
}
@keyframes phonePulseGlow {
  0%, 100% { box-shadow: 0 0 30px rgba(56,189,248,.15), 0 0 60px rgba(56,189,248,.08); }
  50% { box-shadow: 0 0 50px rgba(56,189,248,.35), 0 0 100px rgba(56,189,248,.18); }
}
@keyframes phoneNumberPulse {
  0%, 100% { text-shadow: 0 0 20px rgba(56,189,248,.3); }
  50% { text-shadow: 0 0 40px rgba(56,189,248,.6), 0 0 80px rgba(56,189,248,.3); }
}

/* ---- MEMORIAL ---- */
@keyframes memorialFlicker {
  0%, 100% { opacity: 1; transform: scaleY(1) scaleX(1); }
  15% { opacity: 0.82; transform: scaleY(1.06) scaleX(0.94); }
  30% { opacity: 0.96; transform: scaleY(0.95) scaleX(1.03); }
  50% { opacity: 0.85; transform: scaleY(1.03) scaleX(0.97); }
  70% { opacity: 0.93; transform: scaleY(0.98) scaleX(1.01); }
  85% { opacity: 0.88; transform: scaleY(1.04) scaleX(0.96); }
}
@keyframes memorialGlow {
  0%, 100% { opacity: 0.25; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.15); }
}
@keyframes memorialStar {
  0%, 100% { opacity: 0.08; transform: scale(0.8); }
  50% { opacity: 0.3; transform: scale(1.2); }
}

/* ---- HYPE ---- */
@keyframes hypeBorderTrace {
  0% { background-position: 0% 0; }
  100% { background-position: 300% 0; }
}
@keyframes hypePulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes hypeGlow {
  0%, 100% { text-shadow: 0 0 20px rgba(168,85,247,.4), 0 0 60px rgba(168,85,247,.2); }
  50% { text-shadow: 0 0 40px rgba(168,85,247,.8), 0 0 100px rgba(168,85,247,.4), 0 0 160px rgba(168,85,247,.2); }
}
@keyframes hypeCornerSpark {
  0%, 100% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes hypeBgPulse {
  0%, 100% { opacity: 0.03; }
  50% { opacity: 0.08; }
}
@keyframes hypeEnergyRing {
  0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.3; }
  50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.1; }
  100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.3; }
}
`;

// ── Massive Confetti for Celebration ────────────────────────────────────────
function BigConfetti() {
  const particles = useMemo(() => {
    const colors = ['#FF3366', '#FF6633', '#FFCC00', '#33FF99', '#3399FF', '#CC33FF', '#FF33CC', '#00FFCC', '#FF4444', '#44FF44'];
    const shapes = ['square', 'circle', 'rect', 'star'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${(i * 23 + 7) % 100}%`,
      size: 14 + (i % 5) * 8,
      color: colors[i % colors.length],
      delay: (i * 0.3) % 6,
      duration: 5 + (i % 4) * 2,
      anim: i % 2 === 0 ? 'celebrationConfettiA' : 'celebrationConfettiB',
      shape: shapes[i % shapes.length],
      opacity: 0.7 + (i % 3) * 0.1,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {particles.map(p => {
        let borderRadius = '3px';
        let w = `${p.size}px`;
        let h = `${p.size}px`;
        if (p.shape === 'circle') borderRadius = '50%';
        if (p.shape === 'rect') { h = `${p.size * 2.5}px`; borderRadius = '4px'; }
        return (
          <div key={p.id} style={{
            position: 'absolute',
            left: p.left,
            top: '-40px',
            width: w,
            height: h,
            borderRadius,
            background: p.color,
            opacity: p.opacity,
            animation: `${p.anim} ${p.duration}s linear ${p.delay}s infinite`,
            willChange: 'transform',
          }} />
        );
      })}
    </div>
  );
}

// ── Floating Emojis for Celebration ────────────────────────────────────────
function FloatingEmojis() {
  const emojis = useMemo(() => {
    const symbols = ['\uD83C\uDF89', '\uD83C\uDF8A', '\u2B50', '\uD83C\uDF88', '\u2728', '\uD83E\uDD73', '\uD83C\uDF89', '\uD83D\uDCAB', '\uD83C\uDF8A', '\u2B50'];
    return Array.from({ length: 12 }, (_, i) => ({
      id: i,
      emoji: symbols[i % symbols.length],
      left: `${(i * 31 + 5) % 95}%`,
      delay: (i * 1.2) % 8,
      duration: 8 + (i % 3) * 3,
      size: 48 + (i % 3) * 24,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {emojis.map(e => (
        <div key={e.id} style={{
          position: 'absolute',
          left: e.left,
          bottom: '-80px',
          fontSize: `${e.size}px`,
          animation: `celebrationEmoji ${e.duration}s ease-in-out ${e.delay}s infinite`,
          willChange: 'transform',
          filter: 'saturate(1.3)',
        }}>{e.emoji}</div>
      ))}
    </div>
  );
}

// ── Gold Sparkles for Grand ────────────────────────────────────────────────
function GoldSparkles() {
  const sparkles = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${(i * 29 + 3) % 100}%`,
      delay: (i * 0.5) % 8,
      duration: 6 + (i % 4) * 2,
      size: 3 + (i % 4) * 2,
      opacity: 0.3 + (i % 5) * 0.15,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {sparkles.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.left,
          bottom: '-20px',
          width: `${s.size}px`,
          height: `${s.size}px`,
          borderRadius: '50%',
          background: '#FFD700',
          boxShadow: `0 0 ${s.size * 3}px ${s.size}px rgba(255,215,0,0.4)`,
          animation: `grandSparkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          willChange: 'transform',
          opacity: s.opacity,
        }} />
      ))}
    </div>
  );
}

// ── Emergency Watermark Pattern ────────────────────────────────────────────
function EmergencyWatermark() {
  const items = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({ id: i }));
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(4, 1fr)',
      animation: 'emergencyWatermark 2s ease-in-out infinite',
    }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '48px', color: '#DC2626', opacity: 0.06,
          fontFamily: 'Arial, sans-serif', fontWeight: 900,
          transform: 'rotate(-15deg)',
          userSelect: 'none',
        }}>{'\u26A0'} ALERT</div>
      ))}
    </div>
  );
}

// ── Sleek typewriter text ──────────────────────────────────────────────────
function TypewriterText({ text, delay = 0, speed = 60, fontStyle }) {
  const [displayed, setDisplayed] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    if (!text) return;
    setDisplayed('');
    setShowCursor(true);
    let interval;
    const startTimeout = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setTimeout(() => setShowCursor(false), 1500);
        }
      }, speed);
    }, delay);
    return () => { clearTimeout(startTimeout); if (interval) clearInterval(interval); };
  }, [text, delay, speed]);

  return (
    <div style={{ ...fontStyle, position: 'relative', display: 'inline-block' }}>
      {displayed}
      {showCursor && (
        <span style={{
          display: 'inline-block', width: '3px', height: '0.8em',
          background: '#6366F1', marginLeft: '4px', verticalAlign: 'baseline',
          animation: 'sleekCursor 1s step-end infinite',
        }} />
      )}
    </div>
  );
}

// ── Floating Hebrew Letters for Torah ──────────────────────────────────────
function FloatingHebrewLetters() {
  const letters = useMemo(() => {
    const alefbet = ['\u05D0', '\u05D1', '\u05D2', '\u05D3', '\u05D4', '\u05D5', '\u05D6', '\u05D7', '\u05D8', '\u05D9', '\u05DB', '\u05DC', '\u05DE', '\u05E0', '\u05E1', '\u05E2', '\u05E4', '\u05E6', '\u05E7', '\u05E8', '\u05E9', '\u05EA'];
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      letter: alefbet[i % alefbet.length],
      left: `${(i * 37 + 11) % 96}%`,
      top: `${(i * 43 + 7) % 90}%`,
      size: 40 + (i % 5) * 20,
      delay: (i * 0.7) % 10,
      duration: 8 + (i % 5) * 3,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {letters.map(l => (
        <div key={l.id} style={{
          position: 'absolute',
          left: l.left,
          top: l.top,
          fontSize: `${l.size}px`,
          fontFamily: fonts.hebrewDisplay,
          color: '#D4A84B',
          opacity: 0.04,
          animation: `torahLetterFloat ${l.duration}s ease-in-out ${l.delay}s infinite`,
          willChange: 'transform',
          userSelect: 'none',
        }}>{l.letter}</div>
      ))}
    </div>
  );
}

// ── CSS Scroll/Book visual for Torah ──────────────────────────────────────
function TorahScrollVisual() {
  return (
    <div style={{ position: 'relative', width: '220px', height: '160px', marginBottom: '50px', zIndex: 2 }}>
      {/* Left scroll handle */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '28px',
        background: 'linear-gradient(90deg, #8B6914, #C9A443, #8B6914)',
        borderRadius: '14px',
        boxShadow: '4px 0 20px rgba(139,105,20,.4)',
      }}>
        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '12px', background: '#C9A443', borderRadius: '6px 6px 0 0' }} />
        <div style={{ position: 'absolute', bottom: '-12px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '12px', background: '#C9A443', borderRadius: '0 0 6px 6px' }} />
      </div>
      {/* Right scroll handle */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '28px',
        background: 'linear-gradient(90deg, #8B6914, #C9A443, #8B6914)',
        borderRadius: '14px',
        boxShadow: '-4px 0 20px rgba(139,105,20,.4)',
      }}>
        <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '12px', background: '#C9A443', borderRadius: '6px 6px 0 0' }} />
        <div style={{ position: 'absolute', bottom: '-12px', left: '50%', transform: 'translateX(-50%)', width: '36px', height: '12px', background: '#C9A443', borderRadius: '0 0 6px 6px' }} />
      </div>
      {/* Parchment between scrolls */}
      <div style={{
        position: 'absolute', left: '28px', right: '28px', top: '4px', bottom: '4px',
        background: 'linear-gradient(180deg, #F5E6C8 0%, #EDD9A3 50%, #F5E6C8 100%)',
        boxShadow: 'inset 0 2px 8px rgba(0,0,0,.15), inset 0 -2px 8px rgba(0,0,0,.15)',
      }}>
        {/* Faux text lines on parchment */}
        {[20, 40, 60, 80, 100, 120].map(y => (
          <div key={y} style={{
            position: 'absolute', left: '12px', right: '12px', top: `${y - 6}px`, height: '2px',
            background: 'rgba(80,50,10,.15)', borderRadius: '1px',
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Animated Clouds for Trip ──────────────────────────────────────────────
function TripClouds() {
  const clouds = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => ({
      id: i,
      bottom: `${80 + (i % 3) * 60}px`,
      size: 80 + (i % 3) * 50,
      opacity: 0.08 + (i % 4) * 0.03,
      delay: (i * 6) % 20,
      duration: 25 + (i % 3) * 10,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {clouds.map(c => (
        <div key={c.id} style={{
          position: 'absolute',
          bottom: c.bottom,
          width: `${c.size * 2.5}px`,
          height: `${c.size}px`,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,.9) 0%, rgba(255,255,255,.3) 60%, transparent 80%)',
          opacity: c.opacity,
          animation: `tripCloudDrift ${c.duration}s linear ${c.delay}s infinite`,
          willChange: 'transform',
        }} />
      ))}
    </div>
  );
}

// ── Mountain Silhouette for Trip ──────────────────────────────────────────
function TripMountains() {
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '220px', zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Far mountains */}
      <svg viewBox="0 0 1920 220" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, width: '100%', height: '100%', animation: 'tripMountainBreath 8s ease-in-out infinite', transformOrigin: 'bottom center' }}>
        <path d="M0,220 L0,160 L120,80 L240,130 L360,50 L500,110 L620,30 L760,100 L900,60 L1040,120 L1160,40 L1300,90 L1440,70 L1580,130 L1700,55 L1820,110 L1920,80 L1920,220 Z"
          fill="rgba(0,20,40,.5)" />
      </svg>
      {/* Near mountains */}
      <svg viewBox="0 0 1920 220" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 0, width: '100%', height: '85%' }}>
        <path d="M0,220 L0,180 L200,100 L350,150 L500,70 L700,140 L850,50 L1050,130 L1200,80 L1400,150 L1550,60 L1750,120 L1920,90 L1920,220 Z"
          fill="rgba(0,30,50,.6)" />
      </svg>
      {/* Ground plane */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30px', background: 'rgba(0,30,50,.7)' }} />
    </div>
  );
}

// ── CSS Compass Rose for Trip ─────────────────────────────────────────────
function TripCompass() {
  return (
    <div style={{ position: 'relative', width: '100px', height: '100px', marginBottom: '40px', zIndex: 2 }}>
      {/* Outer ring */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,.3)',
        boxShadow: '0 0 30px rgba(255,255,255,.1)',
      }} />
      {/* Inner ring */}
      <div style={{
        position: 'absolute', inset: '8px', borderRadius: '50%',
        border: '1px solid rgba(255,255,255,.15)',
      }} />
      {/* N-S needle */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        width: '4px', height: '60px',
        marginLeft: '-2px', marginTop: '-30px',
        animation: 'tripCompassNeedle 4s ease-in-out infinite',
        transformOrigin: 'center center',
      }}>
        <div style={{ width: '4px', height: '30px', background: 'linear-gradient(180deg, #EF4444, #B91C1C)', borderRadius: '2px 2px 0 0' }} />
        <div style={{ width: '4px', height: '30px', background: 'linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.3))', borderRadius: '0 0 2px 2px' }} />
      </div>
      {/* Center dot */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', width: '8px', height: '8px',
        marginLeft: '-4px', marginTop: '-4px', borderRadius: '50%',
        background: '#FFF', boxShadow: '0 0 10px rgba(255,255,255,.5)',
      }} />
      {/* Cardinal labels */}
      {[
        { letter: 'N', top: '6px', left: '50%', transform: 'translateX(-50%)' },
        { letter: 'S', bottom: '6px', left: '50%', transform: 'translateX(-50%)' },
        { letter: 'E', right: '8px', top: '50%', transform: 'translateY(-50%)' },
        { letter: 'W', left: '8px', top: '50%', transform: 'translateY(-50%)' },
      ].map(c => (
        <div key={c.letter} style={{
          position: 'absolute', ...c,
          fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,.5)',
          fontFamily: 'Arial, sans-serif',
        }}>{c.letter}</div>
      ))}
    </div>
  );
}

// ── Phone Icon (CSS-drawn handset) for Phone ──────────────────────────────
function PhoneIcon() {
  return (
    <div style={{ position: 'relative', width: '140px', height: '140px', marginBottom: '40px', zIndex: 2 }}>
      {/* Ripple rings */}
      {[0, 0.6, 1.2].map((delay, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '3px solid rgba(56,189,248,.4)',
          animation: `phoneRipple 2.4s ease-out ${delay}s infinite`,
          willChange: 'transform',
        }} />
      ))}
      {/* Circle background */}
      <div style={{
        position: 'absolute', inset: '10px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #0EA5E9, #38BDF8)',
        animation: 'phonePulseGlow 2s ease-in-out infinite',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* SVG phone handset */}
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'phoneRing 2.5s ease-in-out infinite' }}>
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
        </svg>
      </div>
    </div>
  );
}

// ── Memorial Candle Flame (CSS) ───────────────────────────────────────────
function MemorialCandle() {
  return (
    <div style={{ position: 'relative', width: '60px', height: '220px', marginBottom: '50px', zIndex: 2 }}>
      {/* Candle glow behind */}
      <div style={{
        position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
        width: '200px', height: '200px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,180,50,.2) 0%, rgba(255,140,30,.08) 40%, transparent 70%)',
        animation: 'memorialGlow 4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      {/* Flame outer */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '30px', height: '60px',
        background: 'radial-gradient(ellipse at 50% 80%, #FF8C00 0%, #FF6600 30%, #FF4500 60%, transparent 100%)',
        borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
        animation: 'memorialFlicker 3s ease-in-out infinite',
        transformOrigin: 'bottom center',
        filter: 'blur(1px)',
      }}>
        {/* Flame inner (bright core) */}
        <div style={{
          position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
          width: '12px', height: '28px',
          background: 'radial-gradient(ellipse at 50% 90%, #FFF8DC 0%, #FFD700 40%, #FF8C00 80%, transparent 100%)',
          borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
        }} />
      </div>
      {/* Candle body */}
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '24px', height: '150px',
        background: 'linear-gradient(90deg, #E8DFD0, #F5F0E8, #E8DFD0)',
        borderRadius: '3px',
        boxShadow: '0 4px 20px rgba(0,0,0,.3)',
      }}>
        {/* Wick */}
        <div style={{
          position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
          width: '2px', height: '12px',
          background: '#333',
        }} />
      </div>
      {/* Candle base */}
      <div style={{
        position: 'absolute', bottom: '-6px', left: '50%', transform: 'translateX(-50%)',
        width: '40px', height: '12px',
        background: 'linear-gradient(90deg, #B8A88A, #D4C4A8, #B8A88A)',
        borderRadius: '2px',
      }} />
    </div>
  );
}

// ── Memorial Stars ────────────────────────────────────────────────────────
function MemorialStars() {
  const stars = useMemo(() => {
    return Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: `${(i * 41 + 13) % 98}%`,
      top: `${(i * 37 + 5) % 85}%`,
      size: 2 + (i % 3),
      delay: (i * 0.8) % 8,
      duration: 4 + (i % 5) * 2,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: s.left,
          top: s.top,
          width: `${s.size}px`,
          height: `${s.size}px`,
          borderRadius: '50%',
          background: '#FFF',
          boxShadow: `0 0 ${s.size * 3}px ${s.size}px rgba(255,255,255,.15)`,
          animation: `memorialStar ${s.duration}s ease-in-out ${s.delay}s infinite`,
          willChange: 'transform',
        }} />
      ))}
    </div>
  );
}

// ── Hype Corner Sparks ────────────────────────────────────────────────────
function HypeCornerSparks() {
  const sparks = useMemo(() => {
    const corners = [
      { left: '20px', top: '20px' },
      { right: '20px', top: '20px' },
      { left: '20px', bottom: '20px' },
      { right: '20px', bottom: '20px' },
    ];
    return corners.flatMap((pos, ci) =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `${ci}-${i}`,
        ...pos,
        offsetX: (i % 2 === 0 ? 1 : -1) * (10 + i * 8),
        offsetY: (i < 2 ? 1 : -1) * (10 + i * 8),
        size: 3 + (i % 3) * 2,
        delay: ci * 0.5 + i * 0.3,
        duration: 1.5 + (i % 3) * 0.5,
      }))
    );
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {sparks.map(s => {
        const posStyle = {};
        if (s.left) posStyle.left = `calc(${s.left} + ${s.offsetX}px)`;
        if (s.right) posStyle.right = `calc(${s.right} + ${-s.offsetX}px)`;
        if (s.top) posStyle.top = `calc(${s.top} + ${s.offsetY}px)`;
        if (s.bottom) posStyle.bottom = `calc(${s.bottom} + ${-s.offsetY}px)`;
        return (
          <div key={s.id} style={{
            position: 'absolute',
            ...posStyle,
            width: `${s.size}px`,
            height: `${s.size}px`,
            borderRadius: '50%',
            background: '#A855F7',
            boxShadow: `0 0 ${s.size * 4}px ${s.size * 2}px rgba(168,85,247,.6)`,
            animation: `hypeCornerSpark ${s.duration}s ease-in-out ${s.delay}s infinite`,
            willChange: 'transform',
          }} />
        );
      })}
    </div>
  );
}

// ── Hype Animated Border ──────────────────────────────────────────────────
function HypeAnimatedBorder() {
  return (
    <>
      {/* Top border */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '4px', zIndex: 3,
        background: 'linear-gradient(90deg, transparent, #A855F7, #06B6D4, #A855F7, transparent, transparent)',
        backgroundSize: '300% 100%',
        animation: 'hypeBorderTrace 3s linear infinite',
      }} />
      {/* Bottom border */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', zIndex: 3,
        background: 'linear-gradient(90deg, transparent, #06B6D4, #A855F7, #06B6D4, transparent, transparent)',
        backgroundSize: '300% 100%',
        animation: 'hypeBorderTrace 3s linear 1.5s infinite',
      }} />
      {/* Left border */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: '4px', zIndex: 3,
        background: 'linear-gradient(180deg, transparent, #A855F7, #06B6D4, #A855F7, transparent, transparent)',
        backgroundSize: '100% 300%',
        animation: 'hypeBorderTrace 3s linear 0.75s infinite',
      }} />
      {/* Right border */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: '4px', zIndex: 3,
        background: 'linear-gradient(180deg, transparent, #06B6D4, #A855F7, #06B6D4, transparent, transparent)',
        backgroundSize: '100% 300%',
        animation: 'hypeBorderTrace 3s linear 2.25s infinite',
      }} />
    </>
  );
}


// ── Style configurations ────────────────────────────────────────────────────

const STYLES = {
  // ================================================================
  // 1. CLASSIC -- Clean minimal baseline
  // ================================================================
  classic: {
    getContainer: (tokens) => ({
      background: tokens.bg,
    }),
    motionProps: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.5 },
    },
    renderContent: (takeover, tokens) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px', zIndex: 1 }}>
        <div style={{ width: '60px', height: '4px', background: '#C4342D', borderRadius: '2px', marginBottom: '40px' }} />
        {takeover.primary && (
          <div style={{
            fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
            fontSize: '80px', fontWeight: 700,
            color: tokens.text, textAlign: 'center', lineHeight: 1.3, marginBottom: '28px',
            direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
          }}>{takeover.primary}</div>
        )}
        {takeover.secondary && (
          <div style={{
            fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
            fontSize: '42px', fontWeight: 300,
            color: tokens.dim, textAlign: 'center', lineHeight: 1.4,
            direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
          }}>{takeover.secondary}</div>
        )}
        {takeover.subtitle && (
          <div style={{
            fontFamily: fonts.englishDisplay, fontSize: '36px', fontWeight: 400,
            color: `${tokens.text}cc`, textAlign: 'center', lineHeight: 1.4, marginTop: '20px',
          }}>{takeover.subtitle}</div>
        )}
        {takeover.target && (
          <div style={{ fontFamily: fonts.englishBody, fontSize: '28px', color: tokens.gold, marginTop: '40px' }}>
            {takeover.target}
          </div>
        )}
      </div>
    ),
  },

  // ================================================================
  // 2. GRAND ANNOUNCEMENT -- Rich gold, sparkles, ornate frame, starburst
  // ================================================================
  grand: {
    getContainer: () => ({
      background: 'linear-gradient(145deg, #0C0800 0%, #1a1000 30%, #0C0800 60%, #1a1408 100%)',
    }),
    motionProps: {
      initial: { opacity: 0, scale: 0 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.3 },
      transition: { duration: 1, type: 'spring', stiffness: 80, damping: 12 },
    },
    renderContent: (takeover, tokens) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 1, position: 'relative' }}>
        <GoldSparkles />

        {/* Radial starburst behind text */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '900px', height: '900px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,168,75,.2) 0%, rgba(212,168,75,.05) 40%, transparent 70%)',
          animation: 'grandRadial 3s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* THICK gold ornate frame */}
        <div style={{
          position: 'absolute', inset: '24px', zIndex: 1,
          border: '6px solid #D4A84B',
          animation: 'grandBorderGlow 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        {/* Inner frame line */}
        <div style={{
          position: 'absolute', inset: '38px', zIndex: 1,
          border: '2px solid rgba(212,168,75,.4)',
          pointerEvents: 'none',
        }} />
        {/* Corner ornaments */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => {
          const isTop = corner.includes('top');
          const isLeft = corner.includes('left');
          return (
            <div key={corner} style={{
              position: 'absolute',
              [isTop ? 'top' : 'bottom']: '14px',
              [isLeft ? 'left' : 'right']: '14px',
              width: '80px', height: '80px',
              borderTop: isTop ? '8px solid #FFD700' : 'none',
              borderBottom: !isTop ? '8px solid #FFD700' : 'none',
              borderLeft: isLeft ? '8px solid #FFD700' : 'none',
              borderRight: !isLeft ? '8px solid #FFD700' : 'none',
              zIndex: 2,
            }} />
          );
        })}

        {/* Top ornamental line */}
        <div style={{
          position: 'absolute', top: '60px', left: '100px', right: '100px', height: '3px',
          background: 'linear-gradient(90deg, transparent, #FFD700, transparent)', zIndex: 2,
        }} />

        {/* Decorative diamond */}
        <motion.div
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 45 }}
          transition={{ delay: 0.5, duration: 0.8, type: 'spring', stiffness: 150 }}
          style={{
            width: '28px', height: '28px', background: '#FFD700',
            marginBottom: '50px',
            boxShadow: '0 0 50px rgba(255,215,0,.6), 0 0 100px rgba(255,215,0,.3)',
            zIndex: 3,
          }}
        />

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.9, type: 'spring', stiffness: 80, damping: 10 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '110px', fontWeight: 700,
              textAlign: 'center', lineHeight: 1.15, marginBottom: '30px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              background: 'linear-gradient(90deg, #B8860B, #FFD700, #FFF8DC, #FFD700, #B8860B)',
              backgroundSize: '400% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'grandShimmer 3s linear infinite',
              filter: 'drop-shadow(0 4px 20px rgba(255,215,0,.4))',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '48px', fontWeight: 300,
              color: 'rgba(255,215,0,.65)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.4, letterSpacing: '3px', zIndex: 3, position: 'relative',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75, duration: 0.6 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '38px', fontWeight: 300,
              color: 'rgba(255,215,0,.5)', textAlign: 'center', marginTop: '16px',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '30px', color: '#FFD700',
              marginTop: '50px', opacity: 0.7, zIndex: 3, position: 'relative',
            }}
          >{takeover.target}</motion.div>
        )}

        {/* Bottom ornamental line */}
        <div style={{
          position: 'absolute', bottom: '60px', left: '100px', right: '100px', height: '3px',
          background: 'linear-gradient(90deg, transparent, #FFD700, transparent)', zIndex: 2,
        }} />
      </div>
    ),
  },

  // ================================================================
  // 3. EMERGENCY -- Full screen red pulsing alert system (EAS-style)
  // ================================================================
  emergency: {
    getContainer: () => ({
      animation: 'emergencyPulse 1.8s ease-in-out infinite',
    }),
    motionProps: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.15 },
    },
    renderContent: (takeover) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 2, position: 'relative' }}>
        <EmergencyWatermark />

        {/* Red vignette around all edges */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
          boxShadow: 'inset 0 0 200px 80px rgba(180,0,0,.6)',
          animation: 'emergencyVignette 1.8s ease-in-out infinite',
        }} />

        {/* THICK hazard stripes top -- diagonal */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '50px', zIndex: 3,
          background: 'repeating-linear-gradient(45deg, #DC2626 0, #DC2626 25px, #000 25px, #000 50px)',
          animation: 'emergencyStripeSweep 0.8s linear infinite',
        }} />
        {/* THICK hazard stripes bottom -- diagonal */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50px', zIndex: 3,
          background: 'repeating-linear-gradient(45deg, #DC2626 0, #DC2626 25px, #000 25px, #000 50px)',
          animation: 'emergencyStripeSweep 0.8s linear infinite',
        }} />

        {/* Pulsing red border between stripes */}
        <div style={{
          position: 'absolute', top: '50px', bottom: '50px', left: 0, right: 0,
          border: '6px solid #FF0000',
          animation: 'emergencyVignette 1.8s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 3,
        }} />

        {/* MASSIVE warning icon */}
        <div style={{
          fontSize: '140px', marginBottom: '30px',
          animation: 'emergencyIconPulse 1.8s ease-in-out infinite',
          zIndex: 4, position: 'relative',
          lineHeight: 1,
        }}>{'\u26A0'}</div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '120px', fontWeight: 900,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15,
              marginBottom: '20px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              animation: 'emergencyTextGlow 1.8s ease-in-out infinite',
              padding: '0 80px', zIndex: 4, position: 'relative',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '60px', fontWeight: 700,
              color: 'rgba(255,255,255,.95)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.25, textTransform: takeover.primaryIsHe ? 'uppercase' : 'none',
              letterSpacing: takeover.primaryIsHe ? '6px' : '0',
              padding: '0 80px', zIndex: 4, position: 'relative',
              textShadow: '0 0 30px rgba(255,0,0,.5)',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '32px', color: '#FCA5A5',
              marginTop: '40px', zIndex: 4, position: 'relative',
            }}
          >{takeover.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // 4. SLEEK MODERN -- Pure black, typewriter, luxury brand reveal
  // ================================================================
  sleek: {
    getContainer: () => ({
      background: '#000000',
    }),
    motionProps: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    renderContent: (takeover) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '120px', zIndex: 1, position: 'relative',
      }}>
        {/* Thin line that draws across -- top */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 2, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            position: 'absolute', top: '50%', left: '20%', right: '20%',
            height: '1px', background: 'linear-gradient(90deg, transparent, #6366F1, transparent)',
            transformOrigin: 'left center', marginTop: '-140px',
          }}
        />

        {/* Subtle radial glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.12, scale: 1 }}
          transition={{ delay: 1, duration: 2 }}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '600px', height: '600px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: '80%' }}>
          {takeover.primary && (
            <div style={{ marginBottom: '40px' }}>
              <TypewriterText
                text={takeover.primary}
                delay={800}
                speed={80}
                fontStyle={{
                  fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
                  fontSize: '90px', fontWeight: 200,
                  color: '#FFFFFF', textAlign: 'center', lineHeight: 1.3,
                  letterSpacing: '-2px',
                  direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
                }}
              />
            </div>
          )}

          {takeover.secondary && (
            <div style={{ marginTop: '20px' }}>
              <TypewriterText
                text={takeover.secondary}
                delay={takeover.primary ? 800 + takeover.primary.length * 80 + 500 : 800}
                speed={50}
                fontStyle={{
                  fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
                  fontSize: '36px', fontWeight: 200,
                  color: 'rgba(255,255,255,.4)', textAlign: 'center',
                  direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
                  lineHeight: 1.5, letterSpacing: '3px',
                }}
              />
            </div>
          )}

          {takeover.target && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 4, duration: 1 }}
              style={{
                fontFamily: fonts.englishBody, fontSize: '22px',
                color: 'rgba(255,255,255,.2)', marginTop: '80px',
                letterSpacing: '8px', textTransform: 'uppercase',
              }}
            >{takeover.target}</motion.div>
          )}
        </div>

        {/* Bottom thin line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1.5, duration: 2, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            position: 'absolute', top: '50%', left: '20%', right: '20%',
            height: '1px', background: 'linear-gradient(90deg, transparent, #6366F1, transparent)',
            transformOrigin: 'right center', marginTop: '140px',
          }}
        />
      </div>
    ),
  },

  // ================================================================
  // 5. CELEBRATION -- Party vibes, massive confetti, emojis, vivid color
  // ================================================================
  celebration: {
    getContainer: () => ({
      background: 'linear-gradient(135deg, #FF006E, #8338EC, #3A86FF, #FF006E, #FFBE0B)',
      backgroundSize: '400% 400%',
      animation: 'celebrationBg 8s ease infinite',
    }),
    motionProps: {
      initial: { opacity: 0, scale: 0.3, rotate: -10 },
      animate: { opacity: 1, scale: 1, rotate: 0 },
      exit: { opacity: 0, scale: 0.5 },
      transition: { duration: 0.8, type: 'spring', stiffness: 100, damping: 10 },
    },
    renderContent: (takeover) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px', zIndex: 1, position: 'relative' }}>
        <BigConfetti />
        <FloatingEmojis />

        {/* Glowing backdrop */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '800px', height: '800px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,.15) 0%, transparent 60%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8, type: 'spring', stiffness: 120, damping: 8 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '110px', fontWeight: 900,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15, marginBottom: '20px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              textShadow: '0 6px 30px rgba(0,0,0,.4), 0 0 80px rgba(255,255,255,.3)',
              position: 'relative', zIndex: 3,
              WebkitTextStroke: '1px rgba(255,255,255,.3)',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, type: 'spring', stiffness: 100, damping: 10 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '50px', fontWeight: 600,
              color: 'rgba(255,255,255,.95)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, position: 'relative', zIndex: 3,
              textShadow: '0 4px 20px rgba(0,0,0,.3)',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.5, type: 'spring', stiffness: 200 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '30px', color: '#FFFFFF',
              marginTop: '50px', padding: '12px 40px',
              background: 'rgba(255,255,255,.2)', borderRadius: '50px',
              border: '3px solid rgba(255,255,255,.4)',
              backdropFilter: 'blur(10px)',
              position: 'relative', zIndex: 3,
              textShadow: '0 2px 10px rgba(0,0,0,.3)',
            }}
          >{takeover.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // 6. URGENT NOTICE -- Bright amber background, black text, pulsing border
  // ================================================================
  urgent: {
    getContainer: () => ({
      background: '#FFC107',
    }),
    motionProps: {
      initial: { opacity: 0, y: -50 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 50 },
      transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] },
    },
    renderContent: (takeover) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px', zIndex: 1, position: 'relative',
      }}>
        {/* THICK pulsing border around entire viewport */}
        <div style={{
          position: 'absolute', inset: '12px',
          border: '8px solid #FBBF24',
          borderRadius: '4px',
          animation: 'urgentBorderPulse 1.5s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />
        {/* Inner border */}
        <div style={{
          position: 'absolute', inset: '28px',
          border: '3px solid rgba(0,0,0,.15)',
          borderRadius: '2px',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Amber/black hazard bars top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '12px',
          background: 'repeating-linear-gradient(90deg, #000 0, #000 20px, #FFC107 20px, #FFC107 40px)',
          animation: 'urgentStripeSweep 1s linear infinite',
          zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '12px',
          background: 'repeating-linear-gradient(90deg, #000 0, #000 20px, #FFC107 20px, #FFC107 40px)',
          animation: 'urgentStripeSweep 1s linear infinite',
          zIndex: 2,
        }} />

        {/* Large icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.5, type: 'spring', stiffness: 200, damping: 12 }}
          style={{
            width: '120px', height: '120px', borderRadius: '50%',
            background: 'rgba(0,0,0,.1)', border: '5px solid rgba(0,0,0,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '40px', zIndex: 1,
            animation: 'urgentIconBob 2s ease-in-out infinite',
          }}
        >
          <span style={{ fontSize: '64px', color: '#000', lineHeight: 1 }}>{'\u2757'}</span>
        </motion.div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '100px', fontWeight: 900,
              color: '#000000', textAlign: 'center', lineHeight: 1.15,
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              marginBottom: '20px', zIndex: 1,
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '48px', fontWeight: 600,
              color: 'rgba(0,0,0,.8)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, zIndex: 1,
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '28px', color: 'rgba(0,0,0,.6)',
              marginTop: '40px', zIndex: 1,
            }}
          >{takeover.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // 7. TORAH / LEARNING -- Deep navy, parchment glow, scroll, Hebrew letters
  // ================================================================
  torah: {
    getContainer: () => ({
      background: 'linear-gradient(160deg, #0A0E1A 0%, #0F1628 30%, #121D38 60%, #0A0E1A 100%)',
    }),
    motionProps: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 2, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    renderContent: (takeover) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 1, position: 'relative' }}>
        <FloatingHebrewLetters />

        {/* Parchment texture overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(212,168,75,.015) 3px, rgba(212,168,75,.015) 4px)',
          animation: 'torahParchmentPulse 6s ease-in-out infinite',
        }} />

        {/* Golden light emanating from center */}
        <div style={{
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '700px', height: '700px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,168,75,.12) 0%, rgba(212,168,75,.04) 35%, transparent 65%)',
          animation: 'torahGlow 5s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Subtle gold border frame */}
        <div style={{
          position: 'absolute', inset: '30px', zIndex: 1,
          border: '2px solid rgba(212,168,75,.15)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: '40px', zIndex: 1,
          border: '1px solid rgba(212,168,75,.08)',
          pointerEvents: 'none',
        }} />

        {/* Torah scroll visual */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <TorahScrollVisual />
        </motion.div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 1.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '100px', fontWeight: 700,
              textAlign: 'center', lineHeight: 1.2, marginBottom: '24px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              color: '#F5E6C8',
              textShadow: '0 0 40px rgba(212,168,75,.3), 0 0 80px rgba(212,168,75,.15)',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 1.2 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '32px', fontWeight: 300,
              color: 'rgba(212,168,75,.5)', textAlign: 'center', lineHeight: 1.4,
              letterSpacing: '2px', marginBottom: '16px',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '44px', fontWeight: 300,
              color: 'rgba(245,230,200,.5)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.4, letterSpacing: '2px', zIndex: 3, position: 'relative',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '26px', color: 'rgba(212,168,75,.45)',
              marginTop: '50px', zIndex: 3, position: 'relative',
              letterSpacing: '1px',
            }}
          >{takeover.target}</motion.div>
        )}

        {/* Bottom ornamental divider */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 2, duration: 1.5 }}
          style={{
            position: 'absolute', bottom: '60px', left: '25%', right: '25%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(212,168,75,.3), transparent)',
            zIndex: 2,
          }}
        />
      </div>
    ),
  },

  // ================================================================
  // 8. TRIP / OUTING -- Vibrant sky gradient, mountains, compass, adventure
  // ================================================================
  trip: {
    getContainer: () => ({
      background: 'linear-gradient(180deg, #0C4A6E 0%, #0369A1 25%, #0EA5E9 55%, #38BDF8 75%, #7DD3FC 100%)',
    }),
    motionProps: {
      initial: { opacity: 0, x: 200 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -200 },
      transition: { duration: 0.8, type: 'spring', stiffness: 60, damping: 14 },
    },
    renderContent: (takeover) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 1, position: 'relative' }}>
        <TripClouds />
        <TripMountains />

        {/* Sun/horizon glow */}
        <div style={{
          position: 'absolute', bottom: '150px', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(251,191,36,.25) 0%, rgba(251,191,36,.08) 40%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Compass rose */}
        <motion.div
          initial={{ opacity: 0, scale: 0, rotate: -90 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.3, duration: 0.8, type: 'spring', stiffness: 100, damping: 12 }}
        >
          <TripCompass />
        </motion.div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.7, type: 'spring', stiffness: 80, damping: 12 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '100px', fontWeight: 800,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15, marginBottom: '20px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              textShadow: '0 4px 30px rgba(0,0,0,.3), 0 8px 60px rgba(0,0,0,.15)',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '30px', fontWeight: 400,
              color: 'rgba(255,255,255,.7)', textAlign: 'center', lineHeight: 1.4,
              marginBottom: '12px', zIndex: 3, position: 'relative',
              textShadow: '0 2px 10px rgba(0,0,0,.2)',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7, duration: 0.6, type: 'spring', stiffness: 80, damping: 12 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '46px', fontWeight: 500,
              color: 'rgba(255,255,255,.85)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, zIndex: 3, position: 'relative',
              textShadow: '0 2px 15px rgba(0,0,0,.2)',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '28px', color: '#FFFFFF',
              marginTop: '40px', padding: '10px 36px',
              background: 'rgba(255,255,255,.15)', borderRadius: '40px',
              border: '2px solid rgba(255,255,255,.25)',
              backdropFilter: 'blur(8px)',
              zIndex: 3, position: 'relative',
              textShadow: '0 1px 6px rgba(0,0,0,.2)',
            }}
          >{takeover.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // 9. PHONE / CALL TO ACTION -- Dark, clean, pulsing phone icon
  // ================================================================
  phone: {
    getContainer: () => ({
      background: 'linear-gradient(160deg, #0A0F1A 0%, #0F172A 40%, #1E293B 100%)',
    }),
    motionProps: {
      initial: { opacity: 0, scale: 0.95 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.95 },
      transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    renderContent: (takeover) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px', zIndex: 1, position: 'relative',
      }}>
        {/* Subtle grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(56,189,248,.03) 59px, rgba(56,189,248,.03) 60px), repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(56,189,248,.03) 59px, rgba(56,189,248,.03) 60px)',
        }} />

        {/* Accent line top */}
        <div style={{
          position: 'absolute', top: '40px', left: '15%', right: '15%', height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.3), transparent)',
          zIndex: 1,
        }} />

        {/* Phone icon with ripples */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.6, type: 'spring', stiffness: 150, damping: 12 }}
        >
          <PhoneIcon />
        </motion.div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : 'Arial, Helvetica, sans-serif',
              fontSize: '90px', fontWeight: 800,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15, marginBottom: '20px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              animation: 'phoneNumberPulse 2.5s ease-in-out infinite',
              zIndex: 3, position: 'relative',
              letterSpacing: takeover.primaryIsHe ? '0' : '4px',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '28px', fontWeight: 400,
              color: 'rgba(56,189,248,.6)', textAlign: 'center', lineHeight: 1.4,
              letterSpacing: '1px', marginBottom: '12px',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? 'Arial, Helvetica, sans-serif' : fonts.hebrewDisplay,
              fontSize: '42px', fontWeight: 500,
              color: 'rgba(255,255,255,.65)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, zIndex: 3, position: 'relative',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.9, duration: 0.5, type: 'spring', stiffness: 150 }}
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '32px', fontWeight: 700,
              color: '#FFF',
              marginTop: '50px', padding: '14px 50px',
              background: 'linear-gradient(135deg, #0EA5E9, #38BDF8)',
              borderRadius: '50px',
              boxShadow: '0 0 30px rgba(56,189,248,.3), 0 4px 20px rgba(0,0,0,.3)',
              zIndex: 3, position: 'relative',
              letterSpacing: '2px',
            }}
          >{takeover.target}</motion.div>
        )}

        {/* Accent line bottom */}
        <div style={{
          position: 'absolute', bottom: '40px', left: '15%', right: '15%', height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(56,189,248,.3), transparent)',
          zIndex: 1,
        }} />
      </div>
    ),
  },

  // ================================================================
  // 10. MEMORIAL / YAHRZEIT -- Dark solemn, candle flame, starfield
  // ================================================================
  memorial: {
    getContainer: () => ({
      background: 'linear-gradient(180deg, #08060F 0%, #0D0A1A 30%, #110E22 60%, #08060F 100%)',
    }),
    motionProps: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 3, ease: [0.25, 0.46, 0.45, 0.94] },
    },
    renderContent: (takeover) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px', zIndex: 1, position: 'relative',
      }}>
        <MemorialStars />

        {/* Very subtle vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          boxShadow: 'inset 0 0 300px 100px rgba(0,0,0,.5)',
        }} />

        {/* Candle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 2 }}
        >
          <MemorialCandle />
        </motion.div>

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.5, duration: 2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '88px', fontWeight: 300,
              color: 'rgba(245,240,230,.85)', textAlign: 'center', lineHeight: 1.25,
              marginBottom: '24px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              letterSpacing: takeover.primaryIsHe ? '0' : '3px',
              textShadow: '0 0 30px rgba(255,180,50,.1)',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.2, duration: 1.5 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '28px', fontWeight: 300,
              color: 'rgba(200,180,150,.4)', textAlign: 'center', lineHeight: 1.4,
              letterSpacing: '3px', marginBottom: '16px',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.5, duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '40px', fontWeight: 200,
              color: 'rgba(245,240,230,.45)', textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.5, letterSpacing: '4px', zIndex: 3, position: 'relative',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3.5, duration: 1.5 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '24px',
              color: 'rgba(200,180,150,.3)', marginTop: '60px',
              letterSpacing: '3px', zIndex: 3, position: 'relative',
            }}
          >{takeover.target}</motion.div>
        )}

        {/* Thin memorial divider */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 3, duration: 2 }}
          style={{
            position: 'absolute', bottom: '80px', left: '30%', right: '30%', height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(200,180,150,.2), transparent)',
            zIndex: 2,
          }}
        />
      </div>
    ),
  },

  // ================================================================
  // 11. COUNTDOWN / HYPE -- Electric neon, animated borders, energy
  // ================================================================
  hype: {
    getContainer: () => ({
      background: '#07050F',
    }),
    motionProps: {
      initial: { opacity: 0, scale: 1.1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.9 },
      transition: { duration: 0.5, ease: [0.33, 1, 0.68, 1] },
    },
    renderContent: (takeover) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '80px', zIndex: 1, position: 'relative',
      }}>
        <HypeAnimatedBorder />
        <HypeCornerSparks />

        {/* Pulsing radial grid behind */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(168,85,247,.06) 0%, transparent 50%), repeating-conic-gradient(from 0deg, transparent 0deg, transparent 9deg, rgba(168,85,247,.02) 9deg, rgba(168,85,247,.02) 10deg)',
          animation: 'hypeBgPulse 3s ease-in-out infinite',
        }} />

        {/* Energy rings */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '600px', height: '600px', borderRadius: '50%',
          border: '1px solid rgba(168,85,247,.1)',
          animation: 'hypeEnergyRing 4s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          width: '800px', height: '800px', borderRadius: '50%',
          border: '1px solid rgba(6,182,212,.08)',
          animation: 'hypeEnergyRing 4s ease-in-out 1s infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {takeover.primary && (
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, type: 'spring', stiffness: 100, damping: 10 }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.hebrewDisplay : 'Arial, Helvetica, sans-serif',
              fontSize: '120px', fontWeight: 900,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.1, marginBottom: '20px',
              direction: takeover.primaryIsHe ? 'rtl' : 'ltr',
              animation: 'hypeGlow 2s ease-in-out infinite',
              zIndex: 3, position: 'relative',
              letterSpacing: takeover.primaryIsHe ? '0' : '-2px',
            }}
          >{takeover.primary}</motion.div>
        )}

        {takeover.subtitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '30px', fontWeight: 400,
              color: 'rgba(168,85,247,.7)', textAlign: 'center', lineHeight: 1.4,
              letterSpacing: '4px', textTransform: 'uppercase', marginBottom: '12px',
              zIndex: 3, position: 'relative',
            }}
          >{takeover.subtitle}</motion.div>
        )}

        {takeover.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: [0.33, 1, 0.68, 1] }}
            style={{
              fontFamily: takeover.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '48px', fontWeight: 600,
              textAlign: 'center',
              direction: takeover.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, zIndex: 3, position: 'relative',
              background: 'linear-gradient(90deg, #A855F7, #06B6D4, #A855F7)',
              backgroundSize: '200% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'torahScrollShine 4s linear infinite',
            }}
          >{takeover.secondary}</motion.div>
        )}

        {takeover.target && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.4, type: 'spring', stiffness: 200 }}
            style={{
              fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '26px', fontWeight: 700,
              color: '#FFF',
              marginTop: '50px', padding: '12px 40px',
              background: 'linear-gradient(135deg, rgba(168,85,247,.3), rgba(6,182,212,.3))',
              border: '2px solid rgba(168,85,247,.5)',
              borderRadius: '8px',
              animation: 'hypePulse 2s ease-in-out infinite',
              zIndex: 3, position: 'relative',
              letterSpacing: '3px', textTransform: 'uppercase',
              boxShadow: '0 0 30px rgba(168,85,247,.2)',
            }}
          >{takeover.target}</motion.div>
        )}
      </div>
    ),
  },
};

/**
 * Determine which text is "primary" (big) and which is "secondary" (small).
 * If both are provided, whichever is longer is primary. If only one, it's primary.
 */
function getPrimarySecondary(takeover) {
  const he = takeover.textHe?.trim();
  const en = takeover.textEn?.trim();
  if (he && en) {
    return he.length >= en.length
      ? { primary: he, secondary: en, primaryIsHe: true }
      : { primary: en, secondary: he, primaryIsHe: false };
  }
  if (he) return { primary: he, secondary: null, primaryIsHe: true };
  if (en) return { primary: en, secondary: null, primaryIsHe: false };
  return { primary: '', secondary: null, primaryIsHe: true };
}

// ── Main Takeover component ─────────────────────────────────────────────────

export default function Takeover({ takeover, tokens }) {
  const styleName = takeover?.style || 'classic';
  const config = STYLES[styleName] || STYLES.classic;

  // Inject primary/secondary into takeover for renderContent
  const enriched = takeover ? { ...takeover, ...getPrimarySecondary(takeover) } : null;

  return (
    <>
      <style>{TAKEOVER_KEYFRAMES}</style>
      <AnimatePresence>
        {enriched && (
          <motion.div
            key={enriched.id || 'takeover'}
            {...config.motionProps}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              ...config.getContainer(tokens),
            }}
          >
            {config.renderContent(enriched, tokens)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Exported for admin previews */
export const TAKEOVER_STYLE_OPTIONS = [
  { value: 'classic', label: 'Classic', labelHe: '\u05E8\u05D2\u05D9\u05DC', desc: 'Clean, minimal' },
  { value: 'grand', label: 'Grand', labelHe: '\u05D7\u05D2\u05D9\u05D2\u05D9', desc: 'Elegant, gold shimmer' },
  { value: 'emergency', label: 'Emergency', labelHe: '\u05D7\u05D9\u05E8\u05D5\u05DD', desc: 'Red alert, urgent' },
  { value: 'sleek', label: 'Sleek', labelHe: '\u05DE\u05D5\u05D3\u05E8\u05E0\u05D9', desc: 'Apple keynote style' },
  { value: 'celebration', label: 'Celebration', labelHe: '\u05E9\u05DE\u05D7\u05D4', desc: 'Confetti, joyful' },
  { value: 'urgent', label: 'Notice', labelHe: '\u05D4\u05D5\u05D3\u05E2\u05D4', desc: 'Amber attention' },
  { value: 'torah', label: 'Torah', labelHe: '\u05EA\u05D5\u05E8\u05D4', desc: 'Torah study, shiur' },
  { value: 'trip', label: 'Trip', labelHe: '\u05D8\u05D9\u05D5\u05DC', desc: 'Outing, adventure' },
  { value: 'phone', label: 'Phone', labelHe: '\u05D8\u05DC\u05E4\u05D5\u05DF', desc: 'Call to action, RSVP' },
  { value: 'memorial', label: 'Memorial', labelHe: '\u05D9\u05D0\u05E8\u05E6\u05D9\u05D9\u05D8', desc: 'Yahrzeit, remembrance' },
  { value: 'hype', label: 'Hype', labelHe: '\u05D4\u05EA\u05E8\u05D2\u05E9\u05D5\u05EA', desc: 'Countdown, excitement' },
];
