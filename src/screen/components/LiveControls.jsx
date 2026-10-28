import React, { useEffect, useRef, useState } from 'react';

/**
 * Touch controls for the public live view (/live/<word>) only. They move the viewer's OWN copy of the
 * screen and never the TV. Drawn in real pixels outside the scaled canvas so they stay tappable on a phone.
 *  - swipe left/right or tap the left/right edge = previous / next slide (not on web-page slides, where
 *    touches belong to the page itself: scroll Charidy, see donors);
 *  - pinch to zoom is the browser's own (the page allows it); swiping is paused while zoomed so panning works;
 *  - a small button opens the bar: previous, pause, next, slide list, and "Live TV" to follow the real screen again.
 * Chrome here is deliberately neutral (dark glass), it is not part of the slide design.
 */
const NAMES = {
  ZMANIM: 'Zmanim', LIMUDIM: 'Limudim', HAYOM_YOM: 'Hayom Yom', PIRKEI_AVOS: 'Pirkei Avos', DAILY_QUOTE: 'Daily Quote',
  DAILY_WORD: 'Daily Word', DAILY_STORY: 'Daily Story', SHABBOS: 'Good Shabbos', MOTZEI: 'Shavua Tov', BIRTHDAYS: 'Birthdays', CHAZAN: 'Chazan', PARSHA_TIDBITS: 'Parsha Tidbits', SCHEDULE: 'Schedule', WEATHER: 'Weather',
  RSS_SLIDE: 'News', MIVTZAH_LEADERBOARD: 'Mivtzah Leaderboard', MIVTZAH_LIVE_EMBED: 'Mivtzah Live', VIDEO_SLIDE: 'Video',
  PDF_SLIDE: 'PDF', IMAGE_SLIDE: 'Picture', GOOGLE_PHOTOS_SLIDE: 'Photos', ANNOUNCEMENT: 'Message', WEB_PAGE: 'Web page',
};
const nameOf = (s) => s.label || NAMES[s.type] || 'Slide';
const TOUCH_PAGE = new Set(['WEB_PAGE', 'MIVTZAH_LIVE_EMBED']);

const glass = { background: 'rgba(18,16,12,.88)', color: '#EFE3C0', border: '1px solid rgba(239,227,192,.25)', fontFamily: 'system-ui, sans-serif' };
const roundBtn = { ...glass, minWidth: 48, height: 48, borderRadius: 24, fontSize: 20, fontWeight: 700, cursor: 'pointer', padding: '0 14px' };
const gold = { background: '#D9B857', color: '#1a1608' };

export default function LiveControls({ slides, index, paused, following, currentType, onPrev, onNext, onPause, onGoto, onLive }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(false);
  const idle = useRef(null);
  const touch = useRef(null);
  const wake = () => { setOpen(true); clearTimeout(idle.current); idle.current = setTimeout(() => setOpen(false), 7000); };
  useEffect(() => () => clearTimeout(idle.current), []);

  const swipeLayer = !TOUCH_PAGE.has(currentType);
  const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;
  const onTouchStart = (e) => { touch.current = e.touches.length === 1 && !zoomed() ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null; };
  const onTouchEnd = (e) => {
    const s = touch.current; touch.current = null;
    if (!s || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - s.x; const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) onNext(); else onPrev(); return; }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && Date.now() - s.t < 400) {
      const w = window.innerWidth;
      if (s.x < w * 0.2) onPrev(); else if (s.x > w * 0.8) onNext(); else wake();
    }
  };

  return (
    <>
      {swipeLayer && (
        <div data-live-swipe onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }} />
      )}
      {!open && (
        <button type="button" aria-label="Show controls" onClick={wake}
          style={{ ...roundBtn, position: 'fixed', right: 14, bottom: 14, zIndex: 60, opacity: 0.55 }}>⋯</button>
      )}
      {!open && !following && (
        <button type="button" onClick={onLive}
          style={{ ...roundBtn, ...gold, position: 'fixed', left: 14, bottom: 14, zIndex: 60, fontSize: 15 }}>● Back to live TV</button>
      )}
      {open && (
        <div role="toolbar" aria-label="Screen controls" style={{
          position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 60, ...glass, borderRadius: 32,
          padding: 8, display: 'flex', gap: 8, alignItems: 'center', maxWidth: 'calc(100vw - 20px)', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <button type="button" aria-label="Previous slide" onClick={() => { onPrev(); wake(); }} style={roundBtn}>‹</button>
          <button type="button" aria-label={paused ? 'Resume' : 'Pause'} onClick={() => { onPause(); wake(); }} style={roundBtn}>{paused ? '▶' : '❚❚'}</button>
          <button type="button" aria-label="Next slide" onClick={() => { onNext(); wake(); }} style={roundBtn}>›</button>
          <button type="button" onClick={() => { setList(true); wake(); }} style={{ ...roundBtn, fontSize: 15 }}>☰ {Math.min(index + 1, slides.length)} / {slides.length}</button>
          <button type="button" onClick={() => { onLive(); wake(); }} style={{ ...roundBtn, fontSize: 15, ...(following ? {} : gold) }}>
            {following ? '● Live TV' : '● Back to live TV'}
          </button>
          <button type="button" aria-label="Hide controls" onClick={() => setOpen(false)} style={roundBtn}>✕</button>
        </div>
      )}
      {list && (
        <div role="dialog" aria-label="Slides" onClick={() => setList(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: 'min(520px, 100vw)', maxHeight: '70vh', overflowY: 'auto', borderRadius: '22px 22px 0 0', padding: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 18, margin: '4px 6px 10px' }}>Jump to a slide</div>
            {slides.map((s, i) => (
              <button key={s.id || i} type="button" onClick={() => { onGoto(i); setList(false); wake(); }}
                style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, alignItems: 'center', minHeight: 48, padding: '8px 12px', marginBottom: 6, borderRadius: 14, cursor: 'pointer',
                  border: '1px solid rgba(239,227,192,.2)', background: i === index ? 'rgba(217,184,87,.25)' : 'transparent', color: '#EFE3C0', fontSize: 17 }}>
                <span style={{ opacity: 0.6, minWidth: 24 }}>{i + 1}</span><span>{nameOf(s)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
