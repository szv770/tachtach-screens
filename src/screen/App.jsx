import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getTokens } from './styles/tokens.js';
import DesignRoot from './design/DesignRoot.jsx';
import Rail from './components/Rail.jsx';
import { resolveActiveTheme, dayPhase } from '../shared/dayNight.js';
import { toMinutes } from './design/time.js';
import { useSSE } from './hooks/useSSE.js';
import { useClock } from './hooks/useClock.js';
import { useSlideRotation } from './hooks/useSlideRotation.js';
import { useAnnouncements } from './hooks/useAnnouncements.js';
import Layout from './components/Layout.jsx';
import SlideCarousel from './components/SlideCarousel.jsx';
import Banner from './components/messages/Banner.jsx';
import { AnnouncementTakeover } from './components/slides/AnnouncementSlide.jsx';
import { buildRotation, toRotationSlide, toBannerRow, toNoteRow } from './lib/announcementView.js';
import CountdownOverlay from './components/CountdownOverlay.jsx';
import HiddenAccess from './components/HiddenAccess.jsx';
import ScreenScaler from './components/ScreenScaler.jsx';
import ErrorScreen from './components/ErrorScreen.jsx';
import SlideErrorBoundary from './components/SlideErrorBoundary.jsx';
import { getEffectiveSchedule, toISODate } from '../shared/scheduleResolution.js';
import { isScheduleSlideOn } from '../shared/scheduleDays.js';

/**
 * Normalize a server countdown payload (SSE `countdown-start` or
 * `/api/state`.countdown) into the shape CountdownOverlay renders:
 * { id, eventName, eventNameHe, mode, targetTime, duration }.
 * The server sends name/nameHe/displayMode/secondsRemaining (older builds had
 * no `mode`/`targetTime`), which is why neither the slide nor the takeover
 * branch ever rendered before (audit bug 3).
 */
function normalizeCountdown(data) {
  if (!data) return null;
  const mode = (data.mode || data.displayMode) === 'takeover' ? 'takeover' : 'slide';
  let targetTime = data.targetTime;
  if (!targetTime && typeof data.secondsRemaining === 'number') {
    targetTime = new Date(Date.now() + data.secondsRemaining * 1000).toISOString();
  }
  if (!targetTime) return null;
  return {
    ...data,
    mode,
    targetTime,
    eventName: data.eventName ?? data.name ?? '',
    eventNameHe: data.eventNameHe ?? data.nameHe ?? '',
    duration: data.duration ?? (data.alertBefore ? data.alertBefore * 60 : undefined),
  };
}

/**
 * Reconcile the locally shown countdown with the one the server reports in
 * /api/state (initial load, SSE reconnect, 5 s poll).
 */
function reconcileCountdown(prev, serverCountdown) {
  const next = normalizeCountdown(serverCountdown);
  if (next) return prev && prev.id === next.id && prev.targetTime === next.targetTime ? prev : next;
  // Server has none running. Keep a local one only while it is finishing its
  // end-of-countdown flash (target already passed); otherwise it was
  // cancelled (entry edited/deleted) and should go away.
  if (prev && new Date(prev.targetTime).getTime() <= Date.now()) return prev;
  return null;
}

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

  // Announcements (slides, banners, side notes, takeovers) — what's live now,
  // re-evaluated every second by the shared isActive() rules.
  const ann = useAnnouncements(state?.announcements, state?.settings?.location?.timezone);

  // The schedule that applies today (or on ?previewDate=): that date's own
  // schedule from schedule-dates.json, else the weekly one. `clock` ticks
  // every second, so the date string flips at midnight on its own.
  const scheduleDateISO = _previewDate || toISODate(new Date());
  const effectiveSchedule = React.useMemo(
    () => getEffectiveSchedule(state?.schedule, state?.scheduleDates, scheduleDateISO),
    [state?.schedule, state?.scheduleDates, scheduleDateISO]
  );

  // Rotation: slides.json rows (ANNOUNCEMENT refs resolved in place) + active
  // slide announcements without a ref, appended at the end.
  const allSlides = React.useMemo(
    () => buildRotation(state?.slides || [], ann.slides),
    [state?.slides, ann],
  );
  // Newest "pause everything else" slide replaces the slide area.
  const holdSlide = React.useMemo(() => (ann.holds[0] ? toRotationSlide(ann.holds[0]) : null), [ann]);

  // Takeovers and holds pause the rotation timer; banners never do.
  const slideRotation = useSlideRotation(allSlides, { paused: !!ann.takeover || !!holdSlide });

  // Keep a ref to slideRotation so SSE handler always has the latest
  const slideRotationRef = useRef(slideRotation);
  slideRotationRef.current = slideRotation;

  // A slide that throws while rendering is caught by SlideErrorBoundary
  // (renders nothing); skip to the next slide after a short pause. The delay
  // stops a rotation where every slide is broken from spinning hot.
  const slideErrorTimer = useRef(null);
  const handleSlideError = useCallback(() => {
    clearTimeout(slideErrorTimer.current);
    slideErrorTimer.current = setTimeout(() => slideRotationRef.current.advance(), 1000);
  }, []);
  useEffect(() => () => clearTimeout(slideErrorTimer.current), []);

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
          setCountdown(prev => reconcileCountdown(prev, data?.countdown));
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

  // Start-up animation (public/splash/) fades out once the first state is in.
  useEffect(() => { if (!loading) window.ttSplash?.done(); }, [loading]);

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
      case 'announcements-update':
        setState(prev => prev ? { ...prev, announcements: data } : prev);
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
      case 'schedule-dates-update':
        setState(prev => prev ? { ...prev, scheduleDates: data } : prev);
        break;
      case 'daily-words-update':
        setState(prev => prev ? { ...prev, dailyWords: data } : prev);
        break;
      case 'rss-update':
        if (data?.feedId) {
          setRssCache(prev => ({ ...prev, [data.feedId]: data }));
        }
        break;
      case 'rss-feeds-update':
        setState(prev => prev ? { ...prev, rssFeeds: data } : prev);
        break;
      case 'fonts-update':
        setState(prev => prev ? { ...prev, fonts: data } : prev);
        break;
      case 'countdown-start':
        setCountdown(normalizeCountdown(data));
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
    setCountdown(prev => reconcileCountdown(prev, data?.countdown));
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

  // Tell the server the real screen size (device pixels, dpr, orientation, canvas) so the admin's
  // Media page can say "best size for this screen". Real screen only; on load, on resize (settled)
  // and every 5 min, because the server keeps it in memory only.
  useEffect(() => {
    if (_isPreview || _isDatePreview) return undefined;
    let timer = null;
    const send = () => {
      const dpr = window.devicePixelRatio || 1;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const portrait = vh > vw;
      const baseW = portrait ? 900 : 1600;
      const baseH = portrait ? 1600 : 900;
      const scale = Math.min(vw / baseW, vh / baseH) || 1;
      fetch('/api/screen/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display: {
            width: Math.round(vw * dpr), height: Math.round(vh * dpr), dpr,
            orientation: portrait ? 'portrait' : 'landscape',
            canvas: { width: Math.round(vw / scale), height: Math.round(vh / scale) },
          },
        }),
      }).catch(() => {});
    };
    const onResize = () => { clearTimeout(timer); timer = setTimeout(send, 1500); };
    send();
    window.addEventListener('resize', onResize);
    const every = setInterval(send, 5 * 60 * 1000);
    return () => { clearTimeout(timer); clearInterval(every); window.removeEventListener('resize', onResize); };
  }, []);

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

  // Admin Live Preview remote control. The admin page (same origin) drives only THIS
  // preview iframe — it never touches the real TV — and gets the slide list back to
  // show "Slide 3 of 9". Commands: next / prev / pause / resume / goto(index).
  useEffect(() => {
    if (!_isPreview || _isDatePreview) return undefined;
    const onMessage = (e) => {
      const m = e.data;
      if (e.origin !== window.location.origin || e.source !== window.parent || m?.tachtach !== 'preview-control') return;
      const sr = slideRotationRef.current;
      const n = sr.enabledSlides.length;
      if (!n) return;
      switch (m.action) {
        case 'next': sr.advance(); break;
        case 'prev': sr.goToSlide((sr.currentIndex - 1 + n) % n); break;
        case 'pause': sr.setIsPaused(true); break;
        case 'resume': sr.setIsPaused(false); break;
        case 'goto': if (Number.isInteger(m.index)) sr.goToSlide(m.index); break;
        default: break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const previewSlideKey = slideRotation.enabledSlides.map((s) => s.id).join('|');
  useEffect(() => {
    if (!_isPreview || _isDatePreview || window.parent === window) return;
    window.parent.postMessage({
      tachtach: 'preview-state',
      index: slideRotation.currentIndex,
      paused: slideRotation.isPaused,
      slides: slideRotation.enabledSlides.map((s) => ({ id: s.id, type: s.type, label: s.label || '', url: s.embedUrl || '' })),
    }, window.location.origin);
  }, [slideRotation.currentIndex, slideRotation.isPaused, previewSlideKey]);

  // ── Design: theme (manual, or zmanim day/night), fonts, rail, layout ──────
  const settings = state?.settings || {};
  const todayZmanim = state?.cache?.zmanim?.today || {};
  const nowDate = clock.time;
  const active = resolveActiveTheme(settings, todayZmanim, nowDate);
  const phase = dayPhase(todayZmanim, nowDate);
  const tokens = getTokens(active.themeId, settings.customTheme);
  const visibility = settings.visibility || {};

  // Loading / fatal error state
  if (loading || (!state && loadError)) {
    return (
      <div style={{
        width: '100%', height: '100vh', background: '#111214', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '12px', color: '#ECEDEF',
        fontFamily: "'Manrope Variable', 'Manrope', sans-serif", fontSize: '20px',
      }}>
        {loadError ? (
          <>
            <span style={{ color: '#F08A7E', fontSize: '16px' }}>{loadError}</span>
            {!loading && (
              <button onClick={() => window.location.reload()} style={{
                marginTop: '8px', padding: '8px 24px', background: '#F0B44C', color: '#111214',
                border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer',
              }}>Retry</button>
            )}
          </>
        ) : <span style={{ opacity: 0.7 }}>Loading…</span>}
      </div>
    );
  }

  // Blank screen mode
  if (state?._blank) {
    return <div style={{ width: '100%', height: '100vh', background: '#000' }} />;
  }

  const isFullscreen = (holdSlide || slideRotation.currentSlide)?.fullscreen === true;
  const isPortrait = settings.orientation === 'portrait';
  const railSide = (settings.layout?.railSide || settings.clockSide) === 'right' ? 'right' : 'left';

  // Up-next card: only when a schedule item starts within rail.upNextMinutes
  // (default 5) of now, from the effective per-date schedule. Never on the
  // schedule page, which already shows the next item.
  const upNextWindow = Number(settings.rail?.upNextMinutes) > 0 ? Number(settings.rail.upNextMinutes) : 5;
  const onSchedulePage = (holdSlide || slideRotation.currentSlide)?.type === 'SCHEDULE';
  let upNext = null;
  // Owner rule: with the Schedule slide switched off, no schedule-driven updates.
  if (isScheduleSlideOn(state?.slides) && !onSchedulePage && !ann.takeover) {
    const nowM = nowDate.getHours() * 60 + nowDate.getMinutes();
    const next = (effectiveSchedule.entries || [])
      .filter((e) => e.enabled !== false)
      .map((e) => ({ e, v: toMinutes(e.time) }))
      .filter((o) => o.v != null && o.v > nowM && o.v - nowM <= upNextWindow)
      .sort((a, b) => a.v - b.v)[0];
    if (next) {
      const left = next.v - nowM;
      upNext = { name: next.e.name, nameHe: next.e.nameHe, startMins: next.v, minsLeft: left, fraction: 1 - left / upNextWindow };
    }
  }

  const rail = (
    <Rail
      clock={clock}
      cache={state?.cache || {}}
      settings={settings}
      customDays={state?.customDays}
      notes={ann.notes.map(toNoteRow)}
      upNext={upNext}
      weather={state?.cache?.weather}
      credit={settings.credit}
      portrait={isPortrait}
      side={railSide}
      now={nowDate}
    />
  );

  const rightColumn = (
    <SlideErrorBoundary
      resetKey={`${slideRotation.currentSlide?.id}-${slideRotation.currentIndex}-${countdown?.id || ''}`}
      onError={handleSlideError}
    >
      <SlideCarousel
        currentSlide={slideRotation.currentSlide}
        currentIndex={slideRotation.currentIndex}
        cache={state?.cache || {}}
        tokens={tokens}
        settings={settings}
        hold={holdSlide}
        onVideoEnded={slideRotation.advance}
        onRequestDuration={slideRotation.setOverrideDuration}
        googleAlbums={state?.googleAlbums || []}
        schedule={effectiveSchedule}
        countdown={countdown?.mode === 'slide' ? countdown : null}
        onCountdownComplete={() => setCountdown(null)}
        credit={settings.credit}
        rssCache={rssCache}
        rssFeeds={state?.rssFeeds || []}
        dailyWords={state?.dailyWords}
        dateISO={scheduleDateISO}
        portrait={isPortrait}
        portraitLayout={settings.portraitLayout || 'compact'}
      />
    </SlideErrorBoundary>
  );

  const liveBanners = ann.banners.map(toBannerRow);
  const banner = liveBanners.length > 0 ? (
    <Banner banners={liveBanners} bannerSettings={settings.banner} />
  ) : null;

  return (
    <ScreenScaler portrait={isPortrait}>
      <DesignRoot
        settings={settings}
        fontsList={state?.fonts}
        themeId={active.themeId}
        phase={phase}
        upNext={!!upNext}
        portrait={isPortrait}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Layout
          leftColumn={rail}
          rightColumn={rightColumn}
          banner={banner}
          theme={active.themeId}
          tokens={tokens}
          fullscreen={isFullscreen}
          credit={settings.credit}
          currentSlideId={(holdSlide || slideRotation.currentSlide)?.id ?? null}
          clockSide={railSide}
          portrait={isPortrait}
        />
        <AnnouncementTakeover item={ann.takeover} tokens={tokens} clock={clock} />
        {countdown?.mode === 'takeover' && (
          <CountdownOverlay countdown={countdown} tokens={tokens} onComplete={() => setCountdown(null)} />
        )}
        <HiddenAccess tokens={tokens} />

        {_isDatePreview && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, background: 'var(--accent)', color: 'var(--onAccent)',
            fontFamily: 'var(--f-en)', fontSize: 14, fontWeight: 700, textAlign: 'center', padding: '6px 16px',
          }}>
            Preview — {_previewDate}
          </div>
        )}

        {sseStatus === 'disconnected' && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8, background: 'rgba(0,0,0,.7)', zIndex: 9000,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
            <span style={{ fontFamily: 'var(--f-en)', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Disconnected</span>
          </div>
        )}
      </DesignRoot>
    </ScreenScaler>
  );
}
