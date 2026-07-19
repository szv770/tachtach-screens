import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTokens, applyFontSettings, fonts } from './styles/tokens.js';
import { useSSE } from './hooks/useSSE.js';
import { useClock } from './hooks/useClock.js';
import { useSlideRotation } from './hooks/useSlideRotation.js';
import { useMessages } from './hooks/useMessages.js';
import Layout from './components/Layout.jsx';
import Clock from './components/Clock.jsx';
import HebrewDate from './components/HebrewDate.jsx';
import PinnedNotes from './components/PinnedNotes.jsx';
import SlideCarousel from './components/SlideCarousel.jsx';
import Banner from './components/messages/Banner.jsx';
import Takeover from './components/messages/Takeover.jsx';
import CountdownOverlay from './components/CountdownOverlay.jsx';
import HiddenAccess from './components/HiddenAccess.jsx';
import AnimatedText from './components/AnimatedText.jsx';
import ErrorScreen from './components/ErrorScreen.jsx';

function parseScheduleTime(timeStr) {
  if (!timeStr) return null;
  const m12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1]);
    const m = parseInt(m12[2]);
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2]);
  return null;
}

const _searchParams = new URLSearchParams(window.location.search);
const _isPreview = _searchParams.get('preview') === 'true';
const _previewDate = _searchParams.get('previewDate');
const _isDatePreview = Boolean(_previewDate);
const _isErrorPage = window.location.pathname === '/error';
const _errorMessage = _searchParams.get('msg');

// Root router — keeps hooks-based AppContent separate from ErrorScreen
export default function App() {
  if (_isErrorPage) return <ErrorScreen message={_errorMessage} />;
  return <AppContent />;
}

function AppContent() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [rssCache, setRssCache] = useState({});
  const clock = useClock();

  // Message management with auto-expiry
  const { banners, boards, takeovers } = useMessages(state?.messages);

  // Build slides array: regular slides + pinned notes + non-blocking board messages
  const allSlides = React.useMemo(() => {
    const slides = state?.slides || [];
    const now = Date.now();
    const pinnedSlides = (state?.pinned || [])
      .filter(p => !p.expiresAt || now < new Date(p.expiresAt).getTime())
      .filter(p => p.displayMode === 'slide')
      .map(p => ({
        id: `pinned-${p.id}`,
        type: 'PINNED_SLIDE',
        enabled: true,
        duration: p.duration || 10,
        fullscreen: p.fullscreen || false,
        textHe: p.textHe,
        textEn: p.textEn,
        title: p.textEn || p.textHe || 'Pinned',
      }));
    const boardSlides = boards
      .filter(b => !b.blocking && (!b.expiresAt || new Date(b.expiresAt) > new Date()))
      .map(b => ({
        id: `board-${b.id}`,
        type: 'BOARD_SLIDE',
        enabled: true,
        duration: 12,
        _board: b,
        title: b.target || 'Message',
      }));
    return [...slides, ...pinnedSlides, ...boardSlides];
  }, [state?.slides, state?.pinned, boards]);

  // Slide rotation
  const slideRotation = useSlideRotation(allSlides, state?.messages || []);

  // Keep a ref to slideRotation so SSE handler always has the latest
  const slideRotationRef = useRef(slideRotation);
  slideRotationRef.current = slideRotation;

  // Fetch initial state with retry
  // Date preview mode: fetch from /api/preview-state?date=YYYY-MM-DD (no SSE, no retry loop)
  useEffect(() => {
    if (_isDatePreview) {
      fetch(`/api/preview-state?date=${encodeURIComponent(_previewDate)}`)
        .then(res => {
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          return res.json();
        })
        .then(data => {
          setState(data);
          setLoadError(null);
          setLoading(false);
        })
        .catch(err => {
          console.error('[App] Failed to fetch preview state:', err);
          setLoadError(`Preview failed: ${err.message}`);
          setLoading(false);
        });
      return;
    }

    let retryCount = 0;
    let timer;
    const fetchState = () => {
      fetch('/api/state')
        .then(res => {
          if (!res.ok) throw new Error(`Server returned ${res.status}`);
          return res.json();
        })
        .then(data => {
          setState(data);
          setLoadError(null);
          setLoading(false);
        })
        .catch(err => {
          console.error('[App] Failed to fetch initial state:', err);
          retryCount++;
          if (retryCount < 5) {
            setLoadError(`Loading failed, retrying... (attempt ${retryCount + 1})`);
            timer = setTimeout(fetchState, 3000);
          } else {
            setLoadError('Cannot connect to server. Check that the server is running.');
            setLoading(false);
          }
        });
    };
    fetchState();
    return () => clearTimeout(timer);
  }, []);

  // SSE event handler
  const handleSSE = useCallback((event) => {
    const { type, data } = event;
    switch (type) {
      case 'settings-update':
        setState(prev => prev ? { ...prev, settings: data } : prev);
        break;
      case 'slides-update':
        setState(prev => prev ? { ...prev, slides: data } : prev);
        break;
      case 'messages-update':
        setState(prev => prev ? { ...prev, messages: data } : prev);
        break;
      case 'pinned-update':
        setState(prev => prev ? { ...prev, pinned: data } : prev);
        break;
      case 'custom-days-update':
        setState(prev => prev ? { ...prev, customDays: data } : prev);
        break;
      case 'google-albums-update':
        setState(prev => prev ? { ...prev, googleAlbums: data } : prev);
        break;
      case 'google-photos-update':
        // A photo sync completed — force re-fetch of state to get updated album data
        fetch('/api/state').then(r => r.json()).then(d => setState(prev => prev ? { ...d, _blank: prev._blank } : d)).catch(() => {});
        break;
      case 'cache-refresh':
        setState(prev => prev ? { ...prev, cache: data } : prev);
        break;
      case 'schedule-update':
        setState(prev => prev ? { ...prev, schedule: data } : prev);
        break;
      case 'rss-update':
        if (data?.feedId) {
          setRssCache(prev => ({ ...prev, [data.feedId]: data }));
        }
        break;
      case 'rss-feeds-update':
        setState(prev => prev ? { ...prev, rssFeeds: data } : prev);
        break;
      case 'countdown-start':
        setCountdown(data);
        break;
      case 'countdown-end':
        setCountdown(null);
        break;
      case 'screen-command': {
        const sr = slideRotationRef.current;
        switch (data?.action) {
          case 'pause':
            sr.setIsPaused(true);
            break;
          case 'resume':
            sr.setIsPaused(false);
            break;
          case 'advance':
            sr.advance();
            break;
          case 'blank':
            setState(prev => prev ? { ...prev, _blank: !prev._blank } : prev);
            break;
        }
        break;
      }
      case 'connected':
        break;
      default:
        break;
    }
  }, []);

  // Full state sync — called on SSE reconnect and every 30s as a fallback
  const handleFullState = useCallback((data) => {
    setState(prev => {
      if (!prev) return data;
      // Merge full state but preserve local-only keys like _blank
      return { ...data, _blank: prev._blank };
    });
  }, []);

  const { status: sseStatus } = useSSE(handleSSE, handleFullState, { enabled: !_isDatePreview });

  // Report slide state to server on every slide change (real screen only, not preview or date preview)
  useEffect(() => {
    if (_isPreview || _isDatePreview) return;
    fetch('/api/screen/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideIndex: slideRotation.currentIndex,
        slideId: slideRotation.currentSlide?.id ?? null,
        isPaused: slideRotation.isPaused,
      }),
    }).catch(() => {});
  }, [slideRotation.currentIndex, slideRotation.isPaused]);

  // Preview sync — on mount, jump to the slide the real screen is currently on
  useEffect(() => {
    if (!_isPreview) return;
    fetch('/api/screen/state')
      .then(r => r.json())
      .then(({ slideIndex, isPaused }) => {
        if (typeof slideIndex === 'number') slideRotation.goToSlide(slideIndex);
        if (typeof isPaused === 'boolean') slideRotation.setIsPaused(isPaused);
      })
      .catch(() => {});
  }, []); // mount only

  // Resolve theme tokens (with optional zmanim-based auto switching)
  const settings = state?.settings || {};
  const todayZmanim = state?.cache?.zmanim?.today || {};

  function parseZmanMins(str) {
    const m = str?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1]);
    const min = parseInt(m[2]);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  }

  let resolvedTheme = settings.theme;
  const themeAuto = settings.themeAuto;
  if (themeAuto?.enabled) {
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const neitzMins = parseZmanMins(todayZmanim.sunrise);
    const shkiahMins = parseZmanMins(todayZmanim.sunset);
    const isDay = neitzMins !== null && shkiahMins !== null
      ? nowMins >= neitzMins && nowMins < shkiahMins
      : nowMins >= 6 * 60 && nowMins < 19 * 60; // fallback: 6am–7pm
    resolvedTheme = isDay ? (themeAuto.dayTheme || 'parchment') : (themeAuto.nightTheme || 'dark');
  }

  const tokens = getTokens(resolvedTheme, settings.customTheme);
  const visibility = settings.visibility || {};

  // Apply dynamic font settings (mutates shared fonts object in-place)
  applyFontSettings(settings);

  // Inject @font-face for custom fonts and update Google Fonts link
  useEffect(() => {
    if (!settings.fonts) return;
    const { hebrew, english, customFonts } = settings.fonts;

    // Built-in Google Font families that may need loading
    const BUILTIN_HEBREW = ['Frank Ruhl Libre', 'Noto Serif Hebrew', 'David Libre', 'Heebo', 'Rubik', 'Assistant'];
    const BUILTIN_ENGLISH = ['EB Garamond', 'Cormorant Garamond', 'Playfair Display', 'Lora', 'Inter', 'Roboto'];

    // Build Google Fonts URL for selected built-in fonts
    const googleFamilies = [];
    if (hebrew && BUILTIN_HEBREW.includes(hebrew)) {
      googleFamilies.push(hebrew.replace(/ /g, '+') + ':wght@400;500;700');
    }
    if (english && BUILTIN_ENGLISH.includes(english)) {
      googleFamilies.push(english.replace(/ /g, '+') + ':wght@300;400;500;700');
    }

    // Always keep the defaults loaded
    const defaultFamilies = [
      'Frank+Ruhl+Libre:wght@400;500;700',
      'Noto+Serif+Hebrew:wght@400;500;700',
      'EB+Garamond:wght@400;500',
      'Cormorant+Garamond:ital,wght@0,300;0,400;1,300',
    ];
    const allFamilies = [...new Set([...defaultFamilies, ...googleFamilies])];

    // Update the Google Fonts <link> tag
    let gfLink = document.querySelector('link[data-font-dynamic]');
    if (!gfLink) {
      gfLink = document.createElement('link');
      gfLink.rel = 'stylesheet';
      gfLink.setAttribute('data-font-dynamic', 'true');
      document.head.appendChild(gfLink);
    }
    gfLink.href = `https://fonts.googleapis.com/css2?${allFamilies.map(f => 'family=' + f).join('&')}&display=swap`;

    // Inject @font-face rules for custom uploaded fonts
    let styleEl = document.querySelector('style[data-custom-fonts]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-custom-fonts', 'true');
      document.head.appendChild(styleEl);
    }

    const customFontList = customFonts || [];
    const fontFaceRules = customFontList.map(cf => {
      const formatStr = cf.format === 'truetype' ? 'truetype' : cf.format;
      return `@font-face {
  font-family: '${cf.name}';
  src: url('/fonts/${cf.filename}') format('${formatStr}');
  font-weight: 100 900;
  font-display: swap;
}`;
    }).join('\n');

    styleEl.textContent = fontFaceRules;

    return () => {
      // Cleanup is not strictly necessary since we reuse elements,
      // but remove custom font-face on unmount
      if (styleEl) styleEl.textContent = '';
    };
  }, [settings.fonts]);

  // Loading / fatal error state
  if (loading || (!state && loadError)) {
    return (
      <div style={{
        width: '100%', height: '100vh',
        background: '#12100C',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '12px',
        color: '#EFE3C0',
        fontFamily: "'Frank Ruhl Libre', Georgia, serif",
        fontSize: '18px',
      }}>
        {loadError ? (
          <>
            <span style={{ color: '#C4342D', fontSize: '16px' }}>{loadError}</span>
            {!loading && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: '8px',
                  padding: '8px 24px',
                  background: '#D4A84B',
                  color: '#12100C',
                  border: 'none',
                  borderRadius: '4px',
                  fontFamily: "'Frank Ruhl Libre', Georgia, serif",
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </>
        ) : (
          <AnimatedText
            text="Loading..."
            style={{ fontSize: '20px', color: '#D4A84B', letterSpacing: '0.05em' }}
          />
        )}
      </div>
    );
  }

  // Blank screen mode
  if (state?._blank) {
    return <div style={{ width: '100%', height: '100vh', background: '#000' }} />;
  }

  // Active takeover
  const activeTakeover = takeovers.find(t =>
    !t.expiresAt || new Date(t.expiresAt) > new Date()
  );

  const isFullscreen = slideRotation.currentSlide?.fullscreen === true;
  const isPortrait = settings.orientation === 'portrait';

  const leftColumn = (
    <>
      {visibility.clock !== false && (
        <Clock formatted={clock.formatted} ampm={clock.ampm} seconds={clock.seconds} tokens={tokens} />
      )}
      <HebrewDate
        hebrewDate={state?.cache?.hebrewDate}
        parsha={state?.cache?.parsha}
        omer={state?.cache?.omer}
        tokens={tokens}
        visibility={visibility}
        customDays={state?.customDays}
      />
      {(() => {
        const schedEntries = state?.schedule?.entries;
        if (!schedEntries?.length) return null;
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const upcoming = [...schedEntries]
          .map(e => ({ ...e, _mins: parseScheduleTime(e.time) }))
          .filter(e => e._mins != null && e._mins - nowMins > 0 && e._mins - nowMins <= 10)
          .sort((a, b) => a._mins - b._mins);
        if (!upcoming.length) return null;
        const next = upcoming[0];
        const diff = next._mins - nowMins;
        const name = next.nameHe || next.name || '';
        return (
          <div style={{
            margin: '6px 0 2px',
            padding: '8px 12px',
            border: `1px solid ${tokens.goldBd}`,
            borderRadius: '4px',
            background: tokens.goldBg,
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: fonts.hebrewPrimary,
              fontSize: name.length > 12 ? '18px' : '22px',
              fontWeight: 600,
              color: tokens.gold,
              direction: 'rtl',
              lineHeight: 1.3,
            }}>
              {name}
            </div>
            <div style={{
              fontFamily: fonts.englishBody,
              fontSize: '15px',
              color: tokens.dim,
              marginTop: '4px',
              direction: 'ltr',
            }}>
              starting in {diff} min
            </div>
          </div>
        );
      })()}
      <PinnedNotes
        pinned={(state?.pinned || []).filter(p => !p.expiresAt || Date.now() < new Date(p.expiresAt).getTime())}
        tokens={tokens}
        visibility={visibility}
      />
    </>
  );

  const rightColumn = (
    <SlideCarousel
      currentSlide={slideRotation.currentSlide}
      currentIndex={slideRotation.currentIndex}
      enabledSlides={slideRotation.enabledSlides}
      progress={slideRotation.progress}
      cache={state?.cache || {}}
      tokens={tokens}
      settings={settings}
      activeBoards={boards.filter(b => !b.expiresAt || new Date(b.expiresAt) > new Date())}
      onVideoEnded={slideRotation.advance}
      onRequestDuration={slideRotation.setOverrideDuration}
      googleAlbums={state?.googleAlbums || []}
      schedule={state?.schedule}
      countdown={countdown?.mode === 'slide' ? countdown : null}
      onCountdownComplete={() => setCountdown(null)}
      credit={settings.credit}
      rssCache={rssCache}
      rssFeeds={state?.rssFeeds || []}
      portrait={isPortrait}
      portraitLayout={settings.portraitLayout || 'compact'}
    />
  );

  const progressDots = slideRotation.enabledSlides.length > 1 ? (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {slideRotation.enabledSlides.map((_, i) => (
        <div
          key={i}
          onClick={() => slideRotation.goToSlide(i)}
          style={{
            width: i === slideRotation.currentIndex ? '18px' : '6px',
            height: '6px',
            borderRadius: '3px',
            background: i === slideRotation.currentIndex ? tokens.gold : tokens.muted,
            transition: 'width 0.3s ease, background 0.3s ease',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  ) : null;

  const banner = banners.length > 0 ? (
    <Banner
      banners={banners.filter(b => !b.expiresAt || new Date(b.expiresAt) > new Date())}
      tokens={tokens}
      bannerSettings={settings.banner}
    />
  ) : null;

  const portraitTopBar = isPortrait ? (
    <>
      <div style={{ flexShrink: 0, direction: 'ltr' }}>
        {visibility.clock !== false && (
          <Clock formatted={clock.formatted} ampm={clock.ampm} seconds={clock.seconds} tokens={tokens} compact />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <HebrewDate
          hebrewDate={state?.cache?.hebrewDate}
          parsha={state?.cache?.parsha}
          omer={state?.cache?.omer}
          tokens={tokens}
          visibility={visibility}
          customDays={state?.customDays}
          compact
        />
      </div>
    </>
  ) : null;

  return (
    <>
      <Layout
        leftColumn={leftColumn}
        rightColumn={rightColumn}
        progressDots={progressDots}
        banner={banner}
        theme={settings.theme}
        tokens={tokens}
        fullscreen={isFullscreen}
        credit={settings.credit}
        clockSide={settings.clockSide || 'left'}
        portrait={isPortrait}
        portraitTopBar={portraitTopBar}
      />
      <Takeover takeover={activeTakeover} tokens={tokens} />
      {countdown?.mode === 'takeover' && (
        <CountdownOverlay
          countdown={countdown}
          tokens={tokens}
          onComplete={() => setCountdown(null)}
        />
      )}
      <HiddenAccess tokens={tokens} />

      {/* Date preview banner */}
      {_isDatePreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: 'rgba(212,168,75,0.92)',
          color: '#12100C',
          fontFamily: "'Frank Ruhl Libre', Georgia, serif",
          fontSize: '13px',
          fontWeight: 700,
          textAlign: 'center',
          padding: '6px 16px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          Preview — {_previewDate}
        </div>
      )}

      {/* Connection status — only show after 10+ seconds of disconnection */}
      {sseStatus === 'disconnected' && (
        <div style={{
          position: 'fixed',
          bottom: '8px',
          left: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '4px',
          background: 'rgba(0,0,0,.7)',
          zIndex: 9000,
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#EF4444',
          }} />
          <span style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: '11px',
            color: 'rgba(255,255,255,.7)',
          }}>
            Disconnected
          </span>
        </div>
      )}
    </>
  );
}
