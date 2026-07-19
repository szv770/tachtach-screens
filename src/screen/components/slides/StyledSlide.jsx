import React, { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';

// ── Keyframe CSS (same as Takeover but reused here) ──────────────────────────
const STYLED_SLIDE_KEYFRAMES = `
@keyframes emergencyPulse {
  0%, 100% { background-color: #1a0000; }
  50% { background-color: #7B0000; }
}
@keyframes emergencyStripeSweep {
  0% { background-position: 0 0; }
  100% { background-position: 80px 0; }
}
@keyframes emergencyIconPulse {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 15px rgba(255,50,50,.8)); }
  50% { transform: scale(1.1); filter: drop-shadow(0 0 30px rgba(255,50,50,1)); }
}
@keyframes emergencyVignette {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@keyframes emergencyTextGlow {
  0%, 100% { text-shadow: 0 0 10px rgba(255,255,255,.3), 0 0 30px rgba(220,38,38,.5); }
  50% { text-shadow: 0 0 20px rgba(255,255,255,.6), 0 0 50px rgba(220,38,38,.8); }
}
@keyframes emergencyWatermark {
  0%, 100% { opacity: 0.03; }
  50% { opacity: 0.07; }
}
@keyframes grandShimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes grandSparkle {
  0% { transform: translateY(100%) scale(0); opacity: 0; }
  10% { opacity: 1; transform: translateY(80%) scale(1); }
  90% { opacity: 1; transform: translateY(-80%) scale(1); }
  100% { transform: translateY(-100%) scale(0); opacity: 0; }
}
@keyframes grandRadial {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}
@keyframes grandBorderGlow {
  0%, 100% { box-shadow: inset 0 0 30px rgba(212,168,75,.15), 0 0 15px rgba(212,168,75,.1); }
  50% { box-shadow: inset 0 0 50px rgba(212,168,75,.25), 0 0 30px rgba(212,168,75,.2); }
}
@keyframes celebrationBg {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes celebrationConfettiA {
  0% { transform: translateY(-10%) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(120%) rotate(1080deg) scale(0.5); opacity: 0.3; }
}
@keyframes celebrationConfettiB {
  0% { transform: translateY(-10%) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(120%) rotate(-720deg) scale(0.7); opacity: 0.2; }
}
@keyframes sleekCursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
@keyframes urgentBorderPulse {
  0%, 100% { border-color: #FBBF24; box-shadow: inset 0 0 30px rgba(251,191,36,.1); }
  50% { border-color: #F59E0B; box-shadow: inset 0 0 60px rgba(251,191,36,.2); }
}
@keyframes urgentIconBob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-6px) scale(1.03); }
}
@keyframes urgentStripeSweep {
  0% { background-position: 0 0; }
  100% { background-position: 60px 0; }
}
`;

// ── Scaled-down confetti for slide area ──────────────────────────────────────
function SlideConfetti() {
  const particles = useMemo(() => {
    const colors = ['#FF3366', '#FF6633', '#FFCC00', '#33FF99', '#3399FF', '#CC33FF', '#FF33CC', '#00FFCC'];
    const shapes = ['square', 'circle', 'rect'];
    return Array.from({ length: 25 }, (_, i) => ({
      id: i,
      left: `${(i * 23 + 7) % 100}%`,
      size: 6 + (i % 4) * 4,
      color: colors[i % colors.length],
      delay: (i * 0.4) % 6,
      duration: 5 + (i % 4) * 2,
      anim: i % 2 === 0 ? 'celebrationConfettiA' : 'celebrationConfettiB',
      shape: shapes[i % shapes.length],
      opacity: 0.6 + (i % 3) * 0.1,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {particles.map(p => {
        let borderRadius = '2px';
        let w = `${p.size}px`;
        let h = `${p.size}px`;
        if (p.shape === 'circle') borderRadius = '50%';
        if (p.shape === 'rect') { h = `${p.size * 2}px`; borderRadius = '3px'; }
        return (
          <div key={p.id} style={{
            position: 'absolute', left: p.left, top: '-20px',
            width: w, height: h, borderRadius,
            background: p.color, opacity: p.opacity,
            animation: `${p.anim} ${p.duration}s linear ${p.delay}s infinite`,
            willChange: 'transform',
          }} />
        );
      })}
    </div>
  );
}

// ── Scaled-down sparkles for slide area ──────────────────────────────────────
function SlideSparkles() {
  const sparkles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${(i * 29 + 3) % 100}%`,
      delay: (i * 0.6) % 8,
      duration: 6 + (i % 4) * 2,
      size: 2 + (i % 3) * 1.5,
      opacity: 0.3 + (i % 5) * 0.12,
    }));
  }, []);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      {sparkles.map(s => (
        <div key={s.id} style={{
          position: 'absolute', left: s.left, bottom: '-10px',
          width: `${s.size}px`, height: `${s.size}px`,
          borderRadius: '50%', background: '#FFD700',
          boxShadow: `0 0 ${s.size * 3}px ${s.size}px rgba(255,215,0,0.4)`,
          animation: `grandSparkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          willChange: 'transform', opacity: s.opacity,
        }} />
      ))}
    </div>
  );
}

// ── Scaled-down watermark for emergency ──────────────────────────────────────
function SlideWatermark() {
  const items = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ id: i })), []);
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(2, 1fr)',
      animation: 'emergencyWatermark 2s ease-in-out infinite',
    }}>
      {items.map(item => (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', color: '#DC2626', opacity: 0.06,
          fontFamily: 'Arial, sans-serif', fontWeight: 900,
          transform: 'rotate(-15deg)', userSelect: 'none',
        }}>{'\u26A0'} ALERT</div>
      ))}
    </div>
  );
}

// ── Sleek typewriter (reused from Takeover) ──────────────────────────────────
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
          display: 'inline-block', width: '2px', height: '0.8em',
          background: '#6366F1', marginLeft: '3px', verticalAlign: 'baseline',
          animation: 'sleekCursor 1s step-end infinite',
        }} />
      )}
    </div>
  );
}

// ── Primary/secondary logic (same as Takeover) ──────────────────────────────
function getPrimarySecondary(slide) {
  // For styled slides, use titleHe/titleEn as primary text (like textHe/textEn in takeover)
  const he = (slide.textHe || slide.titleHe || '')?.trim();
  const en = (slide.textEn || slide.titleEn || '')?.trim();
  if (he && en) {
    return he.length >= en.length
      ? { primary: he, secondary: en, primaryIsHe: true }
      : { primary: en, secondary: he, primaryIsHe: false };
  }
  if (he) return { primary: he, secondary: null, primaryIsHe: true };
  if (en) return { primary: en, secondary: null, primaryIsHe: false };
  return { primary: '', secondary: null, primaryIsHe: true };
}

// ── Style configs (scaled down for slide area) ──────────────────────────────

const SLIDE_STYLES = {
  // ================================================================
  // CLASSIC
  // ================================================================
  classic: {
    getContainer: (tokens) => ({
      background: tokens.bg,
    }),
    renderContent: (data, tokens) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px', zIndex: 1 }}>
        <div style={{ width: '40px', height: '3px', background: '#C4342D', borderRadius: '2px', marginBottom: '24px' }} />
        {data.primary && (
          <div style={{
            fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
            fontSize: '48px', fontWeight: 700,
            color: tokens.text, textAlign: 'center', lineHeight: 1.3, marginBottom: '16px',
            direction: data.primaryIsHe ? 'rtl' : 'ltr',
          }}>{data.primary}</div>
        )}
        {data.secondary && (
          <div style={{
            fontFamily: data.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
            fontSize: '26px', fontWeight: 300,
            color: tokens.dim, textAlign: 'center', lineHeight: 1.4,
            direction: data.primaryIsHe ? 'ltr' : 'rtl',
          }}>{data.secondary}</div>
        )}
        {data.subtitle && (
          <div style={{
            fontFamily: fonts.englishDisplay, fontSize: '22px', fontWeight: 400,
            color: `${tokens.text}cc`, textAlign: 'center', lineHeight: 1.4, marginTop: '12px',
          }}>{data.subtitle}</div>
        )}
        {data.target && (
          <div style={{ fontFamily: fonts.englishBody, fontSize: '18px', color: tokens.gold, marginTop: '24px' }}>
            {data.target}
          </div>
        )}
      </div>
    ),
  },

  // ================================================================
  // GRAND
  // ================================================================
  grand: {
    getContainer: () => ({
      background: 'linear-gradient(145deg, #0C0800 0%, #1a1000 30%, #0C0800 60%, #1a1408 100%)',
    }),
    renderContent: (data) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 1, position: 'relative' }}>
        <SlideSparkles />

        {/* Radial starburst */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '400px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,168,75,.2) 0%, rgba(212,168,75,.05) 40%, transparent 70%)',
          animation: 'grandRadial 3s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Gold frame */}
        <div style={{
          position: 'absolute', inset: '12px', zIndex: 1,
          border: '3px solid #D4A84B',
          animation: 'grandBorderGlow 3s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: '22px', zIndex: 1,
          border: '1px solid rgba(212,168,75,.4)',
          pointerEvents: 'none',
        }} />

        {/* Corner ornaments */}
        {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => {
          const isTop = corner.includes('top');
          const isLeft = corner.includes('left');
          return (
            <div key={corner} style={{
              position: 'absolute',
              [isTop ? 'top' : 'bottom']: '6px',
              [isLeft ? 'left' : 'right']: '6px',
              width: '40px', height: '40px',
              borderTop: isTop ? '4px solid #FFD700' : 'none',
              borderBottom: !isTop ? '4px solid #FFD700' : 'none',
              borderLeft: isLeft ? '4px solid #FFD700' : 'none',
              borderRight: !isLeft ? '4px solid #FFD700' : 'none',
              zIndex: 2,
            }} />
          );
        })}

        {/* Decorative diamond */}
        <motion.div
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{ opacity: 1, scale: 1, rotate: 45 }}
          transition={{ delay: 0.3, duration: 0.6, type: 'spring', stiffness: 150 }}
          style={{
            width: '16px', height: '16px', background: '#FFD700',
            marginBottom: '24px',
            boxShadow: '0 0 25px rgba(255,215,0,.6)',
            zIndex: 3,
          }}
        />

        {data.primary && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.7 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.7, type: 'spring', stiffness: 80, damping: 10 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '52px', fontWeight: 700,
              textAlign: 'center', lineHeight: 1.15, marginBottom: '16px',
              direction: data.primaryIsHe ? 'rtl' : 'ltr',
              background: 'linear-gradient(90deg, #B8860B, #FFD700, #FFF8DC, #FFD700, #B8860B)',
              backgroundSize: '400% auto',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              animation: 'grandShimmer 3s linear infinite',
              filter: 'drop-shadow(0 2px 10px rgba(255,215,0,.4))',
              zIndex: 3, position: 'relative',
              padding: '0 30px',
            }}
          >{data.primary}</motion.div>
        )}

        {data.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '26px', fontWeight: 300,
              color: 'rgba(255,215,0,.65)', textAlign: 'center',
              direction: data.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.4, letterSpacing: '2px', zIndex: 3, position: 'relative',
            }}
          >{data.secondary}</motion.div>
        )}

        {data.subtitle && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.5 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '22px', fontWeight: 300,
              color: 'rgba(255,215,0,.45)', textAlign: 'center', marginTop: '10px',
              zIndex: 3, position: 'relative',
            }}
          >{data.subtitle}</motion.div>
        )}

        {data.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.4 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '18px', color: '#FFD700',
              marginTop: '28px', opacity: 0.7, zIndex: 3, position: 'relative',
            }}
          >{data.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // EMERGENCY
  // ================================================================
  emergency: {
    getContainer: () => ({
      animation: 'emergencyPulse 1.8s ease-in-out infinite',
    }),
    renderContent: (data) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', zIndex: 2, position: 'relative' }}>
        <SlideWatermark />

        {/* Red vignette */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
          boxShadow: 'inset 0 0 100px 40px rgba(180,0,0,.6)',
          animation: 'emergencyVignette 1.8s ease-in-out infinite',
        }} />

        {/* Hazard stripes */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '24px', zIndex: 3,
          background: 'repeating-linear-gradient(45deg, #DC2626 0, #DC2626 15px, #000 15px, #000 30px)',
          animation: 'emergencyStripeSweep 0.8s linear infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '24px', zIndex: 3,
          background: 'repeating-linear-gradient(45deg, #DC2626 0, #DC2626 15px, #000 15px, #000 30px)',
          animation: 'emergencyStripeSweep 0.8s linear infinite',
        }} />

        {/* Red border */}
        <div style={{
          position: 'absolute', top: '24px', bottom: '24px', left: 0, right: 0,
          border: '3px solid #FF0000',
          animation: 'emergencyVignette 1.8s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 3,
        }} />

        {/* Warning icon */}
        <div style={{
          fontSize: '64px', marginBottom: '16px',
          animation: 'emergencyIconPulse 1.8s ease-in-out infinite',
          zIndex: 4, position: 'relative', lineHeight: 1,
        }}>{'\u26A0'}</div>

        {data.primary && (
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '52px', fontWeight: 900,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15,
              marginBottom: '12px',
              direction: data.primaryIsHe ? 'rtl' : 'ltr',
              animation: 'emergencyTextGlow 1.8s ease-in-out infinite',
              padding: '0 30px', zIndex: 4, position: 'relative',
            }}
          >{data.primary}</motion.div>
        )}

        {data.secondary && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '28px', fontWeight: 700,
              color: 'rgba(255,255,255,.95)', textAlign: 'center',
              direction: data.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.25, padding: '0 30px', zIndex: 4, position: 'relative',
              textShadow: '0 0 15px rgba(255,0,0,.5)',
            }}
          >{data.secondary}</motion.div>
        )}

        {data.subtitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '22px', fontWeight: 600,
              color: 'rgba(255,255,255,.7)', textAlign: 'center', marginTop: '10px',
              zIndex: 4, position: 'relative',
              textShadow: '0 0 10px rgba(255,0,0,.3)',
            }}
          >{data.subtitle}</motion.div>
        )}

        {data.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '18px', color: '#FCA5A5',
              marginTop: '24px', zIndex: 4, position: 'relative',
            }}
          >{data.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // SLEEK
  // ================================================================
  sleek: {
    getContainer: () => ({
      background: '#000000',
    }),
    renderContent: (data, _tokens, slide) => {
      // Fix 3: body text prefers the language complementary to primary
      const sleekTarget = data.primaryIsHe
        ? (slide?.bodyEn || slide?.bodyHe || slide?.attribution || null)
        : (slide?.bodyHe || slide?.bodyEn || slide?.attribution || null);

      const sleekBodyEn = slide?.bodyEn || slide?.attribution || null;
      const sleekBodyHe = slide?.bodyHe || null;
      const isBilingual = Boolean(data.secondary);

      const secondaryDelay = data.primary ? 500 + data.primary.length * 60 + 300 : 500;

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '40px', zIndex: 1, position: 'relative',
        }}>
          {/* Line accent top */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 1.5 }}
            style={{
              position: 'absolute', top: '50%', left: '15%', right: '15%',
              height: '1px', background: 'linear-gradient(90deg, transparent, #6366F1, transparent)',
              transformOrigin: 'left center', marginTop: '-80px',
            }}
          />

          {/* Subtle glow */}
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 0.12, scale: 1 }}
            transition={{ delay: 0.6, duration: 1.5 }}
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: '300px', height: '300px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(99,102,241,.15) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />

          {isBilingual ? (
            <div style={{ display: 'flex', width: '90%', maxWidth: '900px', alignItems: 'center', gap: 0, zIndex: 1, position: 'relative' }}>
              {/* English column — LEFT */}
              <motion.div
                style={{ flex: 1, direction: 'ltr', textAlign: 'left', padding: '0 32px 0 0' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9 }}
              >
                <div style={{ fontFamily: fonts.englishDisplay, fontSize: '32px', fontWeight: 300, color: '#FFFFFF', lineHeight: 1.3, letterSpacing: '-0.5px', marginBottom: sleekBodyEn ? '14px' : 0 }}>
                  {data.primaryIsHe ? data.secondary : data.primary}
                </div>
                {sleekBodyEn && (
                  <div style={{ fontFamily: fonts.englishBody, fontSize: '19px', fontWeight: 300, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                    {sleekBodyEn}
                  </div>
                )}
              </motion.div>

              {/* Center divider */}
              <div style={{ width: '1px', height: '120px', background: 'rgba(212,168,75,0.4)', flexShrink: 0 }} />

              {/* Hebrew column — RIGHT */}
              <motion.div
                style={{ flex: 1, direction: 'rtl', textAlign: 'right', padding: '0 0 0 32px' }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, delay: 0.3 }}
              >
                <div style={{ fontFamily: fonts.hebrewDisplay, fontSize: '36px', fontWeight: 300, color: '#FFFFFF', lineHeight: 1.3, marginBottom: sleekBodyHe ? '14px' : 0 }}>
                  {data.primaryIsHe ? data.primary : data.secondary}
                </div>
                {sleekBodyHe && (
                  <div style={{ fontFamily: fonts.hebrewPrimary, fontSize: '22px', fontWeight: 300, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                    {sleekBodyHe}
                  </div>
                )}
              </motion.div>
            </div>
          ) : (
            /* Single-language layout */
            <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', width: '70%', maxWidth: '700px' }}>
              {data.primary && (
                <div style={{ marginBottom: '20px', width: '100%' }}>
                  <TypewriterText
                    text={data.primary}
                    delay={500}
                    speed={60}
                    fontStyle={{
                      fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
                      fontSize: '44px', fontWeight: 200,
                      color: '#FFFFFF', textAlign: 'center', lineHeight: 1.3,
                      letterSpacing: '-1px',
                      direction: data.primaryIsHe ? 'rtl' : 'ltr',
                    }}
                  />
                </div>
              )}

              {sleekTarget && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3, duration: 0.8 }}
                  style={{
                    fontFamily: data.primaryIsHe ? fonts.englishBody : fonts.hebrewDisplay,
                    fontSize: '18px', fontWeight: 300,
                    color: 'rgba(255,255,255,0.65)', marginTop: '32px',
                    lineHeight: 1.6, textAlign: 'center', width: '100%',
                    direction: data.primaryIsHe ? 'ltr' : 'rtl',
                  }}
                >{sleekTarget}</motion.div>
              )}
            </div>
          )}

          {data.subtitle && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: isBilingual ? 1.2 : 3.5, duration: 0.8 }}
              style={{
                marginTop: '20px', fontFamily: fonts.englishBody, fontSize: '16px', fontStyle: 'italic',
                color: 'rgba(255,255,255,0.5)', textAlign: 'center', zIndex: 1, position: 'relative',
              }}
            >{data.subtitle}</motion.div>
          )}

          {/* Bottom line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.8, duration: 1.5 }}
            style={{
              position: 'absolute', top: '50%', left: '15%', right: '15%',
              height: '1px', background: 'linear-gradient(90deg, transparent, #6366F1, transparent)',
              transformOrigin: 'right center', marginTop: '80px',
            }}
          />
        </div>
      );
    },
  },

  // ================================================================
  // CELEBRATION
  // ================================================================
  celebration: {
    getContainer: () => ({
      background: 'linear-gradient(135deg, #FF006E, #8338EC, #3A86FF, #FF006E, #FFBE0B)',
      backgroundSize: '400% 400%',
      animation: 'celebrationBg 8s ease infinite',
    }),
    renderContent: (data) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '30px', zIndex: 1, position: 'relative' }}>
        <SlideConfetti />

        {/* Glowing backdrop */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '350px', height: '350px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,.15) 0%, transparent 60%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {data.primary && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.6, type: 'spring', stiffness: 120, damping: 8 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '52px', fontWeight: 900,
              color: '#FFFFFF', textAlign: 'center', lineHeight: 1.15, marginBottom: '12px',
              direction: data.primaryIsHe ? 'rtl' : 'ltr',
              textShadow: '0 4px 20px rgba(0,0,0,.4), 0 0 40px rgba(255,255,255,.3)',
              position: 'relative', zIndex: 3,
              WebkitTextStroke: '0.5px rgba(255,255,255,.3)',
            }}
          >{data.primary}</motion.div>
        )}

        {data.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, type: 'spring', stiffness: 100, damping: 10 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '28px', fontWeight: 600,
              color: 'rgba(255,255,255,.95)', textAlign: 'center',
              direction: data.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, position: 'relative', zIndex: 3,
              textShadow: '0 2px 10px rgba(0,0,0,.3)',
            }}
          >{data.secondary}</motion.div>
        )}

        {data.subtitle && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4, type: 'spring', stiffness: 100 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '22px', fontWeight: 500,
              color: 'rgba(255,255,255,.8)', textAlign: 'center', marginTop: '8px',
              position: 'relative', zIndex: 3,
              textShadow: '0 2px 8px rgba(0,0,0,.3)',
            }}
          >{data.subtitle}</motion.div>
        )}

        {data.target && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.4, type: 'spring', stiffness: 200 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '18px', color: '#FFFFFF',
              marginTop: '28px', padding: '8px 24px',
              background: 'rgba(255,255,255,.2)', borderRadius: '30px',
              border: '2px solid rgba(255,255,255,.4)',
              backdropFilter: 'blur(10px)',
              position: 'relative', zIndex: 3,
              textShadow: '0 1px 6px rgba(0,0,0,.3)',
            }}
          >{data.target}</motion.div>
        )}
      </div>
    ),
  },

  // ================================================================
  // URGENT
  // ================================================================
  urgent: {
    getContainer: () => ({
      background: '#FFC107',
    }),
    renderContent: (data) => (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: '40px', zIndex: 1, position: 'relative',
      }}>
        {/* Pulsing border */}
        <div style={{
          position: 'absolute', inset: '6px',
          border: '4px solid #FBBF24',
          borderRadius: '3px',
          animation: 'urgentBorderPulse 1.5s ease-in-out infinite',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', inset: '16px',
          border: '2px solid rgba(0,0,0,.12)',
          borderRadius: '2px',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Hazard bars */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
          background: 'repeating-linear-gradient(90deg, #000 0, #000 12px, #FFC107 12px, #FFC107 24px)',
          animation: 'urgentStripeSweep 1s linear infinite', zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
          background: 'repeating-linear-gradient(90deg, #000 0, #000 12px, #FFC107 12px, #FFC107 24px)',
          animation: 'urgentStripeSweep 1s linear infinite', zIndex: 2,
        }} />

        {/* Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.4, type: 'spring', stiffness: 200, damping: 12 }}
          style={{
            width: '60px', height: '60px', borderRadius: '50%',
            background: 'rgba(0,0,0,.1)', border: '3px solid rgba(0,0,0,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px', zIndex: 1,
            animation: 'urgentIconBob 2s ease-in-out infinite',
          }}
        >
          <span style={{ fontSize: '32px', color: '#000', lineHeight: 1 }}>{'\u2757'}</span>
        </motion.div>

        {data.primary && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.hebrewDisplay : fonts.englishDisplay,
              fontSize: '48px', fontWeight: 900,
              color: '#000000', textAlign: 'center', lineHeight: 1.15,
              direction: data.primaryIsHe ? 'rtl' : 'ltr',
              marginBottom: '12px', zIndex: 1,
            }}
          >{data.primary}</motion.div>
        )}

        {data.secondary && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            style={{
              fontFamily: data.primaryIsHe ? fonts.englishDisplay : fonts.hebrewDisplay,
              fontSize: '26px', fontWeight: 600,
              color: 'rgba(0,0,0,.8)', textAlign: 'center',
              direction: data.primaryIsHe ? 'ltr' : 'rtl',
              lineHeight: 1.3, zIndex: 1,
            }}
          >{data.secondary}</motion.div>
        )}

        {data.subtitle && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            style={{
              fontFamily: fonts.englishDisplay, fontSize: '20px', fontWeight: 600,
              color: 'rgba(0,0,0,.55)', textAlign: 'center', marginTop: '8px', zIndex: 1,
            }}
          >{data.subtitle}</motion.div>
        )}

        {data.target && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.3 }}
            style={{
              fontFamily: fonts.englishBody, fontSize: '16px', color: 'rgba(0,0,0,.5)',
              marginTop: '24px', zIndex: 1,
            }}
          >{data.target}</motion.div>
        )}
      </div>
    ),
  },
};

// ── Main StyledSlide component ───────────────────────────────────────────────

export default function StyledSlide({ slide, tokens }) {
  const styleName = slide?.style || 'classic';
  const config = SLIDE_STYLES[styleName] || SLIDE_STYLES.classic;

  const data = {
    ...getPrimarySecondary(slide),
    subtitle: slide?.subtitle || null,
    target: slide?.bodyEn || slide?.bodyHe || slide?.attribution || null,
  };

  return (
    <>
      <style>{STYLED_SLIDE_KEYFRAMES}</style>
      <div style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        borderRadius: '4px',
        ...config.getContainer(tokens),
      }}>
        {config.renderContent(data, tokens, slide)}
      </div>
    </>
  );
}
