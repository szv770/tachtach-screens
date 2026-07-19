import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fonts } from '../../styles/tokens.js';

/**
 * Google Photos Slide — cycles through album photos with multiple display modes.
 *
 * Display modes:
 *   - single:    one photo at a time, crossfade transition, optional Ken Burns
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
 */
export default function GooglePhotosSlide({ slide, tokens, googleAlbums }) {
  const {
    googleAlbumId,
    displayMode = 'single',
    photoInterval = 8,
    photoOrder = 'album',
    kenBurns = false,
    imageDisplayMode = 'fit',
  } = slide || {};

  const [photos, setPhotos] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState(new Set());
  const timerRef = useRef(null);

  // Find the album config to get photo data
  const album = useMemo(() => {
    if (!googleAlbums || !googleAlbumId) return null;
    return googleAlbums.find(a => a.id === googleAlbumId);
  }, [googleAlbums, googleAlbumId]);

  // Fetch photos from the API
  useEffect(() => {
    if (!googleAlbumId) return;

    fetch(`/api/google-album/${googleAlbumId}/photos`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          let ordered = [...data];
          if (photoOrder === 'random') {
            // Fisher-Yates shuffle
            for (let i = ordered.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
            }
          } else if (photoOrder === 'newest') {
            ordered.reverse();
          }
          setPhotos(ordered);
          setPhotoIndex(0);
        }
      })
      .catch(() => {});
  }, [googleAlbumId, photoOrder]);

  // Determine how many photos to show at once based on display mode
  const photosPerView = useMemo(() => {
    switch (displayMode) {
      case 'collage-2': return 2;
      case 'collage-4': return 4;
      case 'collage-6': return 6;
      default: return 1;
    }
  }, [displayMode]);

  // Auto-advance through photos
  useEffect(() => {
    if (photos.length <= photosPerView) return;

    timerRef.current = setInterval(() => {
      setPhotoIndex(prev => (prev + photosPerView) % photos.length);
    }, (photoInterval || 8) * 1000);

    return () => clearInterval(timerRef.current);
  }, [photos.length, photoInterval, photosPerView]);

  // Preload next photo(s)
  useEffect(() => {
    if (photos.length === 0) return;
    const nextIdx = (photoIndex + photosPerView) % photos.length;
    for (let i = 0; i < photosPerView; i++) {
      const idx = (nextIdx + i) % photos.length;
      const photo = photos[idx];
      if (photo && !loadedPhotos.has(photo.url)) {
        const img = new Image();
        img.src = photo.url;
        img.onload = () => setLoadedPhotos(prev => new Set(prev).add(photo.url));
      }
    }
  }, [photoIndex, photos, photosPerView, loadedPhotos]);

  // Compute objectFit from imageDisplayMode
  const objectFit = useMemo(() => {
    switch (imageDisplayMode) {
      case 'fill': return 'cover';
      case 'stretch': return 'fill';
      case 'fit':
      default: return 'contain';
    }
  }, [imageDisplayMode]);

  if (!photos.length) {
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

  // Photo counter
  const counter = (
    <div style={{
      position: 'absolute',
      bottom: '12px',
      right: '12px',
      zIndex: 10,
      padding: '2px 8px',
      borderRadius: '3px',
      background: 'rgba(0,0,0,.5)',
      fontFamily: fonts.englishBody,
      fontSize: '12px',
      color: tokens.dim,
      pointerEvents: 'none',
    }}>
      {Math.min(photoIndex + 1, photos.length)}/{photos.length}
    </div>
  );

  // Blur background component for fit mode
  const renderBlurBackground = (photoUrl) => {
    if (imageDisplayMode !== 'fit') return null;
    return (
      <>
        {/* Blurred darkened background image */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${photoUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(30px) brightness(0.4)',
        }} />
        {/* Radial gradient vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at center, transparent 40%, ${tokens.bg} 100%)`,
          zIndex: 0,
          pointerEvents: 'none',
        }} />
      </>
    );
  };

  // ── Single / Fullscreen mode ────────────────────────────────────────────
  if (displayMode === 'single' || displayMode === 'fullscreen') {
    const photo = photos[photoIndex % photos.length];
    const kenBurnsStyle = kenBurns ? {
      animation: `kenBurns ${photoInterval || 8}s ease-in-out infinite`,
    } : {};

    // For fullscreen mode, always use cover regardless of imageDisplayMode
    const singleObjectFit = displayMode === 'fullscreen' ? 'cover' : objectFit;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
        {/* Blur background for fit mode */}
        {displayMode !== 'fullscreen' && renderBlurBackground(photo.blurUrl || photo.url)}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${photo.id}-${photoIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src={photo.url}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: singleObjectFit,
                zIndex: 2,
                ...kenBurnsStyle,
              }}
            />
          </motion.div>
        </AnimatePresence>

        {counter}

        {kenBurns && (
          <style>{`
            @keyframes kenBurns {
              0% { transform: scale(1.0) translate(0, 0); }
              50% { transform: scale(1.06) translate(-1%, -0.5%); }
              100% { transform: scale(1.0) translate(0, 0); }
            }
          `}</style>
        )}
      </div>
    );
  }

  // ── Carousel mode ───────────────────────────────────────────────────────
  if (displayMode === 'carousel') {
    const prevIdx = (photoIndex - 1 + photos.length) % photos.length;
    const nextIdx = (photoIndex + 1) % photos.length;
    const current = photos[photoIndex % photos.length];
    const prev = photos[prevIdx];
    const next = photos[nextIdx];

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
        <AnimatePresence mode="wait">
          <motion.div
            key={`carousel-${photoIndex}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              flex: '0 0 80%', height: '90%',
              borderRadius: '4px', overflow: 'hidden',
              zIndex: 3,
            }}
          >
            <img src={current.url} alt="" style={{ width: '100%', height: '100%', objectFit }} />
          </motion.div>
        </AnimatePresence>

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

        {counter}
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

    const currentPhotos = [];
    for (let i = 0; i < gridConfig.count; i++) {
      const idx = (photoIndex + i) % photos.length;
      currentPhotos.push(photos[idx]);
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`collage-${photoIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${gridConfig.columns}, 1fr)`,
              gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
              gap: '1px',
            }}
          >
            {currentPhotos.map((photo, i) => (
              <div key={`${photo.id}-${i}`} style={{
                overflow: 'hidden',
                position: 'relative',
                borderRight: i % gridConfig.columns < gridConfig.columns - 1 ? `1px solid ${tokens.framePrimary}` : 'none',
                borderBottom: Math.floor(i / gridConfig.columns) < gridConfig.rows - 1 ? `1px solid ${tokens.framePrimary}` : 'none',
              }}>
                {/* Blur background per cell for fit mode */}
                {imageDisplayMode === 'fit' && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backgroundImage: `url(${photo.url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(20px) brightness(0.4)',
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
          </motion.div>
        </AnimatePresence>

        {counter}
      </div>
    );
  }

  return null;
}
