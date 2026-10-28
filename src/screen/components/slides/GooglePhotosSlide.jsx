import React, { useState, useEffect, useRef, useMemo } from 'react';
import { fonts } from '../../styles/tokens.js';
import { orderPhotos, samePhotoSet, groupAt, nextIndex, indexAfterRefresh } from '../../../shared/photoRotation.js';

/**
 * Google Photos Slide — cycles through album photos with multiple display modes.
 *
 * Display modes:
 *   - single:    one photo at a time, crossfade transition
 *   - fullscreen: same as single but fullscreen (hides left column)
 *   - carousel:  horizontal sliding with prev/next peeking
 *   - collage-2: two photos side by side
 *   - collage-4: 2x2 grid
 *   - collage-6: 3x2 grid
 *
 * Image display modes (imageDisplayMode):
 *   - fit:     contain with blur background (default)
 *   - fill:    cover/crop
 *   - stretch: stretch to fill
 *
 * Smoothness on a far-away device (the public live view over a phone/4G, 2026-10-28): a photo is only put on
 * screen once it is downloaded AND decoded (never fades in empty and pops in later), the next ones are fetched
 * while the current one shows, the photo list of an album is remembered between visits (no 'Loading photos...'
 * flash each time the slide comes round), and the crossfade is a plain CSS animation over the old photo (no
 * JS hand-over: framer's exit/enter left one frame of the old photo at full opacity and one of nothing).
 */

// Remembered for the page's lifetime: album id -> photo list, and urls already downloaded + decoded here.
const LISTS = new Map();
const WARM = new Set();
const LOADING = new Map(); // url -> promise (also keeps the Image object alive until it has decoded)

/** Download and decode one image; resolves (never rejects) so one bad file cannot stall the slideshow. */
function loadDecoded(url) {
  if (!url) return Promise.resolve();
  if (WARM.has(url)) return Promise.resolve();
  let p = LOADING.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      const done = () => { WARM.add(url); resolve(); };
      if (typeof img.decode === 'function') img.decode().then(done, resolve);
      else { img.onload = done; img.onerror = () => resolve(); }
    }).finally(() => { LOADING.delete(url); });
    LOADING.set(url, p);
  }
  return p;
}

const FADE_CSS = `
@keyframes ttGpIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ttGpSlideIn { from { opacity: 0; transform: translate3d(60px,0,0); } to { opacity: 1; transform: none; } }
`;

/**
 * Shows `children`; when `k` changes the new content fades in over the old one (which stays fully visible underneath
 * until the fade is over, so there is never a frame of nothing or a flash of the old picture).
 */
function CrossFade({ k, ms = 800, anim = 'ttGpIn', children }) {
  const [layers, setLayers] = useState(() => [{ k, node: children, fresh: true }]);
  const last = layers[layers.length - 1];
  if (last.k !== k) setLayers((ls) => [...ls.slice(-1), { k, node: children, fresh: true }]);
  const shown = layers.map((l, i) => (i === layers.length - 1 && l.k === k ? { ...l, node: children } : l));
  useEffect(() => {
    if (layers.length < 2) return undefined;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), ms + 60);
    return () => clearTimeout(t);
  }, [layers, ms]);
  return (
    <>
      <style>{FADE_CSS}</style>
      {shown.map((l) => (
        <div key={l.k} style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          animation: l.fresh ? `${anim} ${ms}ms ease-in-out both` : undefined,
        }}>{l.node}</div>
      ))}
    </>
  );
}

export default function GooglePhotosSlide({ slide, tokens }) {
  const {
    googleAlbumId,
    displayMode = 'single',
    photoInterval = 8,
    photoOrder = 'album',
    imageDisplayMode = 'fit',
  } = slide || {};

  // Photos per screen from the display mode.
  const photosPerView = displayMode === 'collage-2' ? 2 : displayMode === 'collage-4' ? 4 : displayMode === 'collage-6' ? 6 : 1;

  const [photos, setPhotos] = useState(() => (googleAlbumId && LISTS.has(googleAlbumId)
    ? orderPhotos(LISTS.get(googleAlbumId), photoOrder, { warm: WARM }) : []));
  const [photoIndex, setPhotoIndex] = useState(0);
  // What is actually on screen: { list, index }. Only set once those photos are downloaded and decoded.
  const [view, setView] = useState(null);
  const [slow, setSlow] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Fetch the photo list. A list remembered from an earlier visit is used at once and only re-checked quietly
  // (nothing reshuffles or restarts unless the album really changed).
  useEffect(() => {
    if (!googleAlbumId) return undefined;
    let dead = false;
    fetch(`/api/google-album/${googleAlbumId}/photos`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (dead || !Array.isArray(data) || data.length === 0) return;
        LISTS.set(googleAlbumId, data);
        const cur = photosRef.current;
        if (cur.length && samePhotoSet(cur, data)) return;
        const ordered = orderPhotos(data, photoOrder, { warm: WARM });
        const shownId = viewRef.current ? viewRef.current.list[viewRef.current.index % viewRef.current.list.length]?.id : null;
        setPhotos(ordered);
        setPhotoIndex(cur.length ? indexAfterRefresh(ordered, shownId) : 0);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [googleAlbumId, photoOrder]);

  // Auto-advance through photos
  useEffect(() => {
    if (photos.length <= photosPerView) return undefined;
    const t = setInterval(() => {
      setPhotoIndex(prev => nextIndex(prev, photosPerView, photos.length));
    }, (photoInterval || 8) * 1000);
    return () => clearInterval(t);
  }, [photos.length, photoInterval, photosPerView]);

  // Show a photo only when it is ready: wait for the files to download and decode, then swap. The first photo
  // waits at most 6 s (a dead link must not leave the panel empty for ever); later ones keep the previous photo
  // on screen for as long as it takes.
  useEffect(() => {
    if (!photos.length) return undefined;
    let dead = false;
    const group = groupAt(photos, photoIndex, photosPerView);
    const urls = group.map(p => p.url);
    if (imageDisplayMode === 'fit' && displayMode !== 'fullscreen') group.forEach(p => p.blurUrl && urls.push(p.blurUrl));
    const show = () => { if (!dead) setView({ list: photos, index: photoIndex }); };
    const ready = Promise.all(urls.map(loadDecoded));
    if (viewRef.current) ready.then(show);
    else Promise.race([ready, new Promise(r => setTimeout(r, 6000))]).then(show);
    return () => { dead = true; };
  }, [photos, photoIndex, photosPerView, imageDisplayMode, displayMode]);

  // While a photo shows, fetch the next two screens so the swap is instant.
  useEffect(() => {
    if (!view || view.list.length <= photosPerView) return;
    const n1 = nextIndex(view.index, photosPerView, view.list.length);
    const n2 = nextIndex(n1, photosPerView, view.list.length);
    for (const idx of [n1, n2]) groupAt(view.list, idx, photosPerView).forEach(p => { loadDecoded(p.url); loadDecoded(p.blurUrl); });
  }, [view, photosPerView]);

  // Only say 'Loading photos...' if it takes a while: a quick load on the TV (same machine) must not flash text.
  useEffect(() => {
    if (view) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
  }, [view]);

  // Compute objectFit from imageDisplayMode
  const objectFit = useMemo(() => {
    switch (imageDisplayMode) {
      case 'fill': return 'cover';
      case 'stretch': return 'fill';
      case 'fit':
      default: return 'contain';
    }
  }, [imageDisplayMode]);

  if (!view) {
    if (!slow) return <div style={{ width: '100%', height: '100%' }} />;
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: tokens.dim,
        fontFamily: fonts.englishBody,
        fontSize: '16px',
      }}>
        Loading photos...
      </div>
    );
  }

  const list = view.list;
  const at = view.index % list.length;

  // Blur background component for fit mode
  const renderBlurBackground = (photoUrl) => {
    if (imageDisplayMode !== 'fit') return null;
    return (
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${photoUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }} />
    );
  };

  // ── Single / Fullscreen mode ────────────────────────────────────────────
  if (displayMode === 'single' || displayMode === 'fullscreen') {
    const photo = list[at];
    // For fullscreen mode, always use cover regardless of imageDisplayMode
    const singleObjectFit = displayMode === 'fullscreen' ? 'cover' : objectFit;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        <CrossFade k={`${photo.id}-${view.index}`} ms={800}>
          {/* the blur backdrop fades together with its photo */}
          {displayMode !== 'fullscreen' && renderBlurBackground(photo.blurUrl || photo.url)}
          <img
            src={photo.url}
            alt=""
            style={{
              position: 'absolute', inset: 0,
              width: '100%',
              height: '100%',
              objectFit: singleObjectFit,
              zIndex: 2,
            }}
          />
        </CrossFade>
      </div>
    );
  }

  // ── Carousel mode ───────────────────────────────────────────────────────
  if (displayMode === 'carousel') {
    const prev = list[(at - 1 + list.length) % list.length];
    const next = list[(at + 1) % list.length];
    const current = list[at];

    return (
      <div style={{
        position: 'relative', width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', gap: '8px',
      }}>
        {/* Blur background for fit mode */}
        {renderBlurBackground(current.blurUrl || current.url)}

        {/* Previous photo peeking */}
        <div style={{
          flex: '0 0 8%', height: '75%',
          opacity: 0.6, transform: 'scale(0.75)',
          borderRadius: '4px', overflow: 'hidden',
          transition: 'all 0.5s ease',
          zIndex: 3,
        }}>
          <img src={prev.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Current photo */}
        <div style={{ position: 'relative', flex: '0 0 80%', height: '90%', borderRadius: '4px', overflow: 'hidden', zIndex: 3 }}>
          <CrossFade k={`carousel-${view.index}`} ms={500} anim="ttGpSlideIn">
            <img src={current.url} alt="" style={{ width: '100%', height: '100%', objectFit }} />
          </CrossFade>
        </div>

        {/* Next photo peeking */}
        <div style={{
          flex: '0 0 8%', height: '75%',
          opacity: 0.6, transform: 'scale(0.75)',
          borderRadius: '4px', overflow: 'hidden',
          transition: 'all 0.5s ease',
          zIndex: 3,
        }}>
          <img src={next.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    );
  }

  // ── Collage modes (2, 4, 6) ─────────────────────────────────────────────
  if (displayMode === 'collage-2' || displayMode === 'collage-4' || displayMode === 'collage-6') {
    const gridConfig = {
      'collage-2': { columns: 2, rows: 1, count: 2 },
      'collage-4': { columns: 2, rows: 2, count: 4 },
      'collage-6': { columns: 3, rows: 2, count: 6 },
    }[displayMode];

    const currentPhotos = groupAt(list, view.index, gridConfig.count);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <CrossFade k={`collage-${view.index}`} ms={600}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
            gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
            gap: '1px',
          }}>
            {currentPhotos.map((photo, i) => (
              <div key={`${photo.id}-${i}`} style={{
                overflow: 'hidden',
                position: 'relative',
                borderRight: i % gridConfig.columns < gridConfig.columns - 1 ? '1px solid var(--line, transparent)' : 'none',
                borderBottom: Math.floor(i / gridConfig.columns) < gridConfig.rows - 1 ? '1px solid var(--line, transparent)' : 'none',
              }}>
                {/* Blur background per cell for fit mode */}
                {imageDisplayMode === 'fit' && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `url(${photo.blurUrl || photo.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }} />
                )}
                <img
                  src={photo.url}
                  alt=""
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    objectFit: imageDisplayMode === 'fit' ? 'contain' : imageDisplayMode === 'stretch' ? 'fill' : 'cover',
                    zIndex: 1,
                  }}
                />
              </div>
            ))}
          </div>
        </CrossFade>
      </div>
    );
  }

  return null;
}
