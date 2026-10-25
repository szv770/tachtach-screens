import React, { useRef, useState, useEffect } from 'react';
import { colors, adminFonts, buttonSecondary, inputStyle } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import TvStatusLine from './TvStatusLine.jsx';

const FOLLOW_KEY = 'tt.preview.follow';
const readFollow = () => { try { return window.localStorage.getItem(FOLLOW_KEY) !== 'off'; } catch { return true; } };

const KIOSK_W = 1920;
const KIOSK_H = 1080;

const TYPE_NAMES = {
  ZMANIM: 'Zmanim', LIMUDIM: 'Limudim', HAYOM_YOM: 'Hayom Yom', PIRKEI_AVOS: 'Pirkei Avos',
  DAILY_QUOTE: 'Daily Quote', DAILY_WORD: 'Daily Word', DAILY_STORY: 'Daily Story', BIRTHDAYS: 'Birthdays', CHAZAN: 'Chazan', PARSHA_TIDBITS: 'Parsha Tidbits',
  SCHEDULE: 'Schedule', WEATHER: 'Weather', RSS_SLIDE: 'RSS Feed', MIVTZAH_LEADERBOARD: 'Mivtzah Leaderboard',
  MIVTZAH_LIVE_EMBED: 'Mivtzah Live Screen', VIDEO_SLIDE: 'Video', PDF_SLIDE: 'PDF', IMAGE_SLIDE: 'Image',
  GOOGLE_PHOTOS_SLIDE: 'Google Photos', ANNOUNCEMENT: 'Message',
};

function slideName(s) {
  if (s.type === 'WEB_PAGE') {
    try { return `Web page · ${new URL(s.url).hostname.replace(/^www\./, '')}`; } catch { return 'Web page'; }
  }
  if (s.type === 'ANNOUNCEMENT') return s.label || 'Message';
  return TYPE_NAMES[s.type] || s.label || 'Slide';
}

/**
 * The preview is its own copy of the screen (iframe) that follows the real TV.
 * The buttons under it only move THIS preview, through postMessage: the TV is
 * never touched (use Screen Controls for that).
 */
export default function LivePreview({ state }) {
  const containerRef = useRef(null);
  const frameRef = useRef(null);
  const isMobile = useIsMobile();
  const [scale, setScale] = useState(0.18);
  const [info, setInfo] = useState({ index: 0, paused: false, slides: [] });
  const [follow, setFollow] = useState(readFollow);
  const [tvTick, setTvTick] = useState(0);

  // Tell the preview frame which mode it is in (also when it finishes loading).
  const sendFollow = (on) => frameRef.current?.contentWindow?.postMessage({ tachtach: 'preview-control', action: 'follow', on }, window.location.origin);
  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    try { window.localStorage.setItem(FOLLOW_KEY, next ? 'on' : 'off'); } catch { /* private window: just this visit */ }
    sendFollow(next);
  };

  useEffect(() => {
    const onMessage = (e) => {
      const m = e.data;
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (m?.tachtach === 'tv-slide') { setTvTick((n) => n + 1); return; }
      if (m?.tachtach !== 'preview-state') return;
      setInfo({ index: m.index || 0, paused: !!m.paused, slides: Array.isArray(m.slides) ? m.slides : [] });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const send = (action, extra = {}) => {
    frameRef.current?.contentWindow?.postMessage({ tachtach: 'preview-control', action, ...extra }, window.location.origin);
  };

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setScale(w / KIOSK_W);
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        fontFamily: adminFonts.englishBody,
        fontSize: '11px',
        color: colors.muted,
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
        marginBottom: '8px',
      }}>
        Live Preview
      </div>
      <TvStatusLine state={state} reloadSignal={tvTick} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <button type="button" role="switch" aria-checked={follow} data-testid="follow-toggle" onClick={toggleFollow} style={{
          ...buttonSecondary, display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '0 12px', fontSize: '13px',
        }}>
          <span aria-hidden style={{ width: 34, height: 20, borderRadius: 999, background: follow ? colors.success : colors.border, position: 'relative', flex: '0 0 auto' }}>
            <span style={{ position: 'absolute', top: 2, left: follow ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: colors.surface }} />
          </span>
          Follow the TV
        </button>
        <span data-testid="preview-mode" style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', fontWeight: 700, color: follow ? colors.success : colors.warn }}>
          {follow ? 'Following the TV' : 'Preview — not the TV'}
        </span>
      </div>
      {/* 16:9 aspect ratio container */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', /* 9/16 = 56.25% */
          borderRadius: '4px',
          overflow: 'hidden',
          background: colors.bg,
          border: `1px solid ${colors.muted}`,
        }}
      >
        <iframe
          ref={frameRef}
          src="/screen?preview=true"
          title="Screen Preview"
          onLoad={() => sendFollow(follow)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${KIOSK_W}px`,
            height: `${KIOSK_H}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            border: 'none',
          }}
        />
      </div>

      {/* Preview-only controls: jump through slides without waiting for the timer */}
      {!follow && info.slides.length > 0 && (() => {
        const btn = isMobile
          ? { ...buttonSecondary, padding: '8px 12px', fontSize: '14px', minHeight: '44px' }
          : { ...buttonSecondary, padding: '5px 10px', fontSize: '12px' };
        return (
          <div style={{ marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button type="button" style={btn} onClick={() => send('prev')} aria-label="Previous slide">‹ Prev</button>
              <button type="button" style={btn} onClick={() => send(info.paused ? 'resume' : 'pause')}>{info.paused ? 'Play' : 'Pause'}</button>
              <button type="button" style={btn} onClick={() => send('next')} aria-label="Next slide">Next ›</button>
              <span style={{ marginLeft: 'auto', fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted, whiteSpace: 'nowrap' }}>
                {Math.min(info.index + 1, info.slides.length)} / {info.slides.length}
              </span>
            </div>
            <select
              value={Math.min(info.index, info.slides.length - 1)}
              onChange={(e) => send('goto', { index: Number(e.target.value) })}
              aria-label="Jump to slide"
              style={{ ...inputStyle, marginTop: '6px', width: '100%', fontSize: isMobile ? '16px' : '12px', minHeight: isMobile ? '44px' : undefined, padding: '5px 8px' }}
            >
              {info.slides.map((s, i) => <option key={s.id || i} value={i}>{i + 1}. {slideName(s)}</option>)}
            </select>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '10px', color: colors.muted, marginTop: '4px' }}>
              Preview only — the real screen isn’t affected. Turn on Follow the TV to see what it is showing.
            </div>
          </div>
        );
      })()}
    </div>
  );
}
