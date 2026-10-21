import React, { useEffect, useMemo, useRef, useState } from 'react';
import { withCacheBust } from '../../../shared/embedCheck.js';
import QrBadge from '../QrBadge.jsx';

/**
 * Web page slide: shows any website (e.g. a live fundraiser display page) in an
 * iframe, always fresh:
 *   - it is a brand-new iframe every time the slide comes up (SlideCarousel
 *     remounts it per showing), with a cache-busting `_tt` parameter, so the
 *     audience never sees the page as it was last time;
 *   - while it stays on screen it can reload every `webRefreshSec` seconds
 *     (0 = never; pages that update themselves live, like fundraiser boards,
 *     usually do not need it);
 *   - `webZoom` (percent) shrinks or enlarges a page designed for another
 *     screen size so it fits the panel.
 * A page that forbids framing (X-Frame-Options / CSP) cannot be detected from
 * here; the admin checks that when the address is saved (/api/embed-probe).
 */
const LOAD_TIMEOUT_MS = 20000;

export default function WebPageSlide({ slide }) {
  const url = String(slide?.embedUrl || '').trim();
  const refreshSec = Math.max(0, Math.min(3600, Number(slide?.webRefreshSec) || 0));
  const zoom = Math.max(25, Math.min(300, Number(slide?.webZoom) || 100));
  const bust = slide?.webCacheBust !== false;

  const [reloads, setReloads] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const timer = useRef(null);

  // Fresh stamp per mount and per refresh, stable across unrelated re-renders.
  const src = useMemo(() => (bust ? withCacheBust(url, Date.now()) : url), [url, bust, reloads]);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSlow(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer.current);
  }, [src]);

  useEffect(() => {
    if (!refreshSec) return undefined;
    const id = setInterval(() => setReloads((n) => n + 1), refreshSec * 1000);
    return () => clearInterval(id);
  }, [refreshSec]);

  if (!url) return null;
  const scale = zoom / 100;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--surface, transparent)' }}>
      <iframe
        key={src}
        src={src}
        title="Web page"
        onLoad={() => { clearTimeout(timer.current); setLoaded(true); setSlow(false); }}
        sandbox="allow-scripts allow-same-origin allow-forms"
        allow="autoplay; fullscreen"
        referrerPolicy="no-referrer"
        style={{
          position: 'absolute', top: 0, left: 0, border: 'none', background: '#fff',
          width: `${100 / scale}%`, height: `${100 / scale}%`,
          transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: '0 0',
          opacity: loaded ? 1 : 0, transition: 'opacity .35s ease',
        }}
      />
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 10, color: 'var(--inkDim)', fontFamily: 'var(--f-en)', direction: 'ltr', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28 }}>{slow ? 'This page is taking a while to load' : 'Loading…'}</div>
          {slow && <div style={{ fontSize: 18, maxWidth: 640 }}>It will keep trying, and loads fresh the next time this slide comes up.</div>}
        </div>
      )}
      {slide?.qrOn && slide?.qrUrl ? <QrBadge url={slide.qrUrl} corner={slide.qrCorner} size={slide.qrSize} caption={slide.qrCaption} /> : null}
    </div>
  );
}
