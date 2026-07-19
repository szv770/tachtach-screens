import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const body = await res.text();
    let msg;
    try { msg = JSON.parse(body).error; } catch { msg = body; }
    throw new Error(msg || `${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const DISPLAY_MODES = [
  { value: 'single', label: 'Single Photo', desc: 'One photo at a time with crossfade' },
  { value: 'fullscreen', label: 'Fullscreen', desc: 'Photo fills entire screen' },
  { value: 'carousel', label: 'Carousel', desc: 'Sliding with prev/next peeking' },
  { value: 'collage-2', label: 'Collage 2-up', desc: 'Two photos side by side' },
  { value: 'collage-4', label: 'Collage 4-up', desc: '2x2 grid' },
  { value: 'collage-6', label: 'Collage 6-up', desc: '3x2 grid' },
];

const PHOTO_ORDERS = [
  { value: 'album', label: 'Album Order' },
  { value: 'random', label: 'Random' },
  { value: 'newest', label: 'Newest First' },
];

const IMAGE_DISPLAY_MODES = [
  { value: 'fit', label: 'Fit', desc: 'Full photo with blur background' },
  { value: 'fill', label: 'Fill', desc: 'Crop to cover the area' },
  { value: 'stretch', label: 'Stretch', desc: 'Stretch to fill' },
];

const REFRESH_INTERVALS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: 1440, label: 'Daily' },
];

export default function GooglePhotosManager({ onSlideCreated, onDeleteSlide, slides, onUpdateSlides }) {
  const isMobile = useIsMobile();
  const [albums, setAlbums] = useState([]);
  const [albumUrl, setAlbumUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHelp, setShowHelp] = useState(true);

  // Settings for new album slide
  const [displayMode, setDisplayMode] = useState('single');
  const [photoInterval, setPhotoInterval] = useState(8);
  const [photoOrder, setPhotoOrder] = useState('album');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [slideDuration, setSlideDuration] = useState(30);
  const [kenBurns, setKenBurns] = useState(false);
  const [imageDisplayMode, setImageDisplayMode] = useState('fit');

  // Editing state
  const [editingSlideId, setEditingSlideId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Load existing albums
  const loadAlbums = useCallback(async () => {
    try {
      const data = await apiFetch('/api/google-albums');
      setAlbums(data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadAlbums(); }, [loadAlbums]);

  // Poll album status while syncing
  useEffect(() => {
    const syncing = albums.some(a => a.status === 'syncing');
    if (!syncing) return;

    const timer = setInterval(loadAlbums, 5000);
    return () => clearInterval(timer);
  }, [albums, loadAlbums]);

  const handleConnect = async () => {
    if (!albumUrl.trim()) {
      setError('Please paste an album link.');
      return;
    }

    setConnecting(true);
    setError('');
    setSuccess('');

    try {
      const album = await apiFetch('/api/google-album', {
        method: 'POST',
        body: JSON.stringify({
          url: albumUrl.trim(),
          displayMode,
          photoInterval,
          photoOrder,
          refreshInterval,
          kenBurns,
          imageDisplayMode,
        }),
      });

      // Create a slide entry for this album
      if (onSlideCreated) {
        await onSlideCreated({
          type: 'GOOGLE_PHOTOS_SLIDE',
          googleAlbumId: album.id,
          displayMode,
          photoInterval,
          photoOrder,
          kenBurns,
          imageDisplayMode,
          duration: slideDuration,
          fullscreen: displayMode === 'fullscreen',
          label: 'Google Photos',
          enabled: true,
        });
      }

      setSuccess('Album connected! Photos are syncing...');
      setAlbumUrl('');
      loadAlbums();
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (albumId) => {
    try {
      await apiFetch(`/api/google-album/${albumId}/sync`, { method: 'POST' });
      setSuccess('Sync started...');
      setTimeout(loadAlbums, 2000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (albumId) => {
    if (!confirm('Remove this album and all cached photos?')) return;
    try {
      await apiFetch(`/api/google-album/${albumId}`, { method: 'DELETE' });

      // Also remove the associated GOOGLE_PHOTOS_SLIDE if one exists
      if (onDeleteSlide && slides) {
        const linkedSlide = slides.find(
          s => s.type === 'GOOGLE_PHOTOS_SLIDE' && s.googleAlbumId === albumId
        );
        if (linkedSlide) {
          await onDeleteSlide(linkedSlide.id);
        }
      }

      setSuccess('Album removed.');
      loadAlbums();
    } catch (err) {
      setError(err.message);
    }
  };

  // Start editing a Google Photos slide
  const startEdit = (slide) => {
    setEditingSlideId(slide.id);
    setEditForm({
      displayMode: slide.displayMode || 'single',
      photoInterval: slide.photoInterval || 8,
      photoOrder: slide.photoOrder || 'album',
      kenBurns: slide.kenBurns || false,
      imageDisplayMode: slide.imageDisplayMode || 'fit',
      duration: slide.duration || 30,
      fullscreen: slide.fullscreen || false,
      label: slide.label || 'Google Photos',
    });
  };

  const cancelEdit = () => {
    setEditingSlideId(null);
    setEditForm(null);
  };

  const saveEdit = async () => {
    if (!editingSlideId || !editForm || !slides || !onUpdateSlides) return;
    const updated = slides.map(s => {
      if (s.id !== editingSlideId) return s;
      return {
        ...s,
        displayMode: editForm.displayMode,
        photoInterval: editForm.photoInterval,
        photoOrder: editForm.photoOrder,
        kenBurns: editForm.kenBurns,
        imageDisplayMode: editForm.imageDisplayMode,
        duration: editForm.duration,
        fullscreen: editForm.fullscreen,
        label: editForm.label,
      };
    });
    await onUpdateSlides(updated);

    // Also update the album config on the server if there's a linked album
    const slide = slides.find(s => s.id === editingSlideId);
    if (slide?.googleAlbumId) {
      try {
        await apiFetch(`/api/google-album/${slide.googleAlbumId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayMode: editForm.displayMode,
            photoInterval: editForm.photoInterval,
            photoOrder: editForm.photoOrder,
            kenBurns: editForm.kenBurns,
            imageDisplayMode: editForm.imageDisplayMode,
          }),
        });
      } catch (err) {
        console.error('Failed to update album config:', err);
      }
    }

    setEditingSlideId(null);
    setEditForm(null);
    setSuccess('Slide settings updated.');
  };

  // Find Google Photos slides from the slides list
  const googleSlides = (slides || []).filter(s => s.type === 'GOOGLE_PHOTOS_SLIDE');

  // Render the settings form (shared between create and edit)
  const renderSettingsForm = (formState, setFormField, isEdit = false) => {
    const mode = formState.displayMode;
    const interval = formState.photoInterval;
    const order = formState.photoOrder;
    const kb = formState.kenBurns;
    const imgMode = formState.imageDisplayMode;
    const dur = formState.duration;

    return (
      <div style={{
        background: colors.surface, border: `1px solid ${colors.muted}`,
        borderRadius: '6px', padding: '16px 20px', marginBottom: '24px',
      }}>
        <h3 style={{
          fontFamily: adminFonts.englishBody, fontSize: '16px',
          color: colors.gold, marginBottom: '16px',
        }}>
          {isEdit ? 'Edit Settings' : 'Display Settings'}
        </h3>

        {/* Display mode */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontFamily: adminFonts.englishBody, fontSize: '13px',
            color: colors.dim, display: 'block', marginBottom: '6px',
          }}>
            Display Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '6px' }}>
            {DISPLAY_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => setFormField('displayMode', m.value)}
                style={{
                  padding: '8px',
                  background: mode === m.value ? colors.goldBg : 'transparent',
                  border: `1px solid ${mode === m.value ? colors.goldBd : colors.muted}`,
                  borderRadius: '4px', cursor: 'pointer', textAlign: 'center',
                }}
              >
                <div style={{
                  fontFamily: adminFonts.englishBody, fontSize: '13px',
                  color: mode === m.value ? colors.gold : colors.text,
                  fontWeight: mode === m.value ? 500 : 400,
                }}>
                  {m.label}
                </div>
              </button>
            ))}
          </div>
          {mode && (
            <div style={{
              marginTop: '6px', fontFamily: adminFonts.englishBody,
              fontSize: '12px', color: colors.dim, fontStyle: 'italic',
            }}>
              {DISPLAY_MODES.find(m2 => m2.value === mode)?.desc}
            </div>
          )}
        </div>

        {/* Image display mode (fit/fill/stretch) */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            fontFamily: adminFonts.englishBody, fontSize: '13px',
            color: colors.dim, display: 'block', marginBottom: '6px',
          }}>
            Photo Sizing
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {IMAGE_DISPLAY_MODES.map(m => (
              <button
                key={m.value}
                onClick={() => setFormField('imageDisplayMode', m.value)}
                style={{
                  padding: '6px 16px',
                  background: imgMode === m.value ? colors.goldBg : 'transparent',
                  border: `1px solid ${imgMode === m.value ? colors.goldBd : colors.muted}`,
                  borderRadius: '4px', cursor: 'pointer',
                }}
              >
                <div style={{
                  fontFamily: adminFonts.englishBody, fontSize: '13px',
                  color: imgMode === m.value ? colors.gold : colors.text,
                  fontWeight: imgMode === m.value ? 500 : 400,
                }}>
                  {m.label}
                </div>
                <div style={{
                  fontFamily: adminFonts.englishBody, fontSize: '10px',
                  color: colors.dim, marginTop: '2px',
                }}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Ken Burns (only for single/fullscreen) */}
        {(mode === 'single' || mode === 'fullscreen') && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
              fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text,
            }}>
              <input
                type="checkbox"
                checked={kb}
                onChange={(e) => setFormField('kenBurns', e.target.checked)}
                style={{ accentColor: colors.gold }}
              />
              Ken Burns effect (slow zoom/pan)
            </label>
          </div>
        )}

        {/* Photo interval + duration */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{
              fontFamily: adminFonts.englishBody, fontSize: '13px',
              color: colors.dim, display: 'block', marginBottom: '4px',
            }}>
              Seconds per photo
            </label>
            <input
              type="number"
              min={3}
              max={60}
              value={interval}
              onChange={(e) => setFormField('photoInterval', parseInt(e.target.value) || 8)}
              style={{ ...inputStyle, width: '100px' }}
            />
          </div>

          <div>
            <label style={{
              fontFamily: adminFonts.englishBody, fontSize: '13px',
              color: colors.dim, display: 'block', marginBottom: '4px',
            }}>
              Slide duration (seconds)
            </label>
            <input
              type="number"
              min={10}
              max={300}
              value={dur}
              onChange={(e) => setFormField('duration', parseInt(e.target.value) || 30)}
              style={{ ...inputStyle, width: '100px' }}
            />
          </div>
        </div>

        {/* Photo order + refresh */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={{
              fontFamily: adminFonts.englishBody, fontSize: '13px',
              color: colors.dim, display: 'block', marginBottom: '4px',
            }}>
              Photo Order
            </label>
            <select
              value={order}
              onChange={(e) => setFormField('photoOrder', e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              {PHOTO_ORDERS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div>
              <label style={{
                fontFamily: adminFonts.englishBody, fontSize: '13px',
                color: colors.dim, display: 'block', marginBottom: '4px',
              }}>
                Check for new photos
              </label>
              <select
                value={formState.refreshInterval || 30}
                onChange={(e) => setFormField('refreshInterval', parseInt(e.target.value))}
                style={{ ...inputStyle, width: '100%' }}
              >
                {REFRESH_INTERVALS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Label (edit only) */}
        {isEdit && (
          <div style={{ marginTop: '16px' }}>
            <label style={{
              fontFamily: adminFonts.englishBody, fontSize: '13px',
              color: colors.dim, display: 'block', marginBottom: '4px',
            }}>
              Label
            </label>
            <input
              type="text"
              value={formState.label || ''}
              onChange={(e) => setFormField('label', e.target.value)}
              style={{ ...inputStyle, width: '200px' }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '24px',
          fontWeight: 600,
          color: colors.gold,
          marginBottom: '4px',
        }}>
          Google Photos
        </h2>
        <p style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '14px',
          color: colors.dim,
        }}>
          Connect a shared Google Photos album to display photos on the kiosk screen.
        </p>
      </div>

      {/* Help section */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.muted}`,
        borderRadius: '6px',
        padding: '16px 20px',
        marginBottom: '24px',
      }}>
        <button
          onClick={() => setShowHelp(!showHelp)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: adminFonts.englishBody,
            fontSize: '15px', color: colors.gold,
            padding: 0, display: 'flex', alignItems: 'center', gap: '8px',
            width: '100%', textAlign: 'left',
          }}
        >
          <span style={{ transform: showHelp ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s' }}>
            {'\u25B6'}
          </span>
          How to connect an album
        </button>

        {showHelp && (
          <div style={{ marginTop: '16px' }}>
            <ol style={{
              fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text,
              paddingLeft: '20px', margin: 0, lineHeight: 1.8,
            }}>
              <li>Open <strong>Google Photos</strong> on your phone</li>
              <li>Open or create an album</li>
              <li>Tap the <strong>share button</strong> ({'\u2934'})</li>
              <li>Tap <strong>"Create link"</strong> or <strong>"Get link"</strong></li>
              <li>Copy the link</li>
              <li>Paste it in the box below</li>
            </ol>
          </div>
        )}
      </div>

      {/* Album URL input */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{
          fontFamily: adminFonts.englishBody,
          fontSize: '14px', color: colors.text,
          display: 'block', marginBottom: '6px',
        }}>
          Album Link
        </label>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px' }}>
          <input
            type="url"
            value={albumUrl}
            onChange={(e) => setAlbumUrl(e.target.value)}
            placeholder="https://photos.google.com/share/..."
            style={{ ...inputStyle, flex: 1, direction: 'ltr' }}
          />
          <button
            onClick={handleConnect}
            disabled={connecting}
            style={{
              ...buttonPrimary,
              opacity: connecting ? 0.6 : 1,
              whiteSpace: 'nowrap',
              minHeight: '44px',
            }}
          >
            {connecting ? 'Connecting...' : 'Connect Album'}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: '8px', padding: '8px 12px',
            background: colors.dangerBg, border: `1px solid ${colors.danger}`,
            borderRadius: '4px', fontFamily: adminFonts.englishBody,
            fontSize: '13px', color: colors.danger,
          }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{
            marginTop: '8px', padding: '8px 12px',
            background: colors.successBg, border: `1px solid ${colors.success}`,
            borderRadius: '4px', fontFamily: adminFonts.englishBody,
            fontSize: '13px', color: colors.success,
          }}>
            {success}
          </div>
        )}
      </div>

      {/* Display settings for NEW album */}
      {renderSettingsForm(
        { displayMode, photoInterval, photoOrder, kenBurns, imageDisplayMode, duration: slideDuration, refreshInterval },
        (field, value) => {
          switch (field) {
            case 'displayMode': setDisplayMode(value); break;
            case 'photoInterval': setPhotoInterval(value); break;
            case 'photoOrder': setPhotoOrder(value); break;
            case 'kenBurns': setKenBurns(value); break;
            case 'imageDisplayMode': setImageDisplayMode(value); break;
            case 'duration': setSlideDuration(value); break;
            case 'refreshInterval': setRefreshInterval(value); break;
          }
        },
        false,
      )}

      {/* Edit modal for existing Google Photos slide \u2014 near-full-screen sheet on mobile */}
      {editingSlideId && editForm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'center',
          justifyContent: 'center',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) cancelEdit(); }}
        >
          <div style={isMobile ? {
            background: colors.bg,
            borderRadius: '14px 14px 0 0',
            borderTop: `1px solid ${colors.goldBd}`,
            padding: '20px 16px calc(24px + env(safe-area-inset-bottom))',
            width: '100%',
            maxHeight: '94dvh', overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          } : {
            background: colors.bg, borderRadius: '8px',
            padding: '24px', maxWidth: '600px', width: '90%',
            maxHeight: '80vh', overflowY: 'auto',
            border: `1px solid ${colors.muted}`,
          }}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: adminFonts.englishBody, fontSize: '18px', color: colors.gold, margin: 0 }}>
                Edit Google Photos Slide
              </h3>
              <button onClick={cancelEdit} aria-label="Close" style={{
                background: 'none', border: 'none', color: colors.dim, fontSize: '20px', cursor: 'pointer',
                minWidth: isMobile ? '44px' : undefined, minHeight: isMobile ? '44px' : undefined,
              }}>{'\u00D7'}</button>
            </div>

            {/* Show album URL (read-only) */}
            {(() => {
              const slide = slides?.find(s => s.id === editingSlideId);
              const album = slide?.googleAlbumId && albums.find(a => a.id === slide.googleAlbumId);
              if (album?.url) {
                return (
                  <div style={{
                    marginBottom: '16px', padding: '8px 12px',
                    background: colors.surface, borderRadius: '4px',
                    fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim,
                    direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    Album: {album.url}
                  </div>
                );
              }
              return null;
            })()}

            {renderSettingsForm(
              editForm,
              (field, value) => setEditForm(prev => ({ ...prev, [field]: value })),
              true,
            )}

            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column-reverse' : 'row',
              gap: isMobile ? '10px' : '8px',
              justifyContent: 'flex-end',
            }}>
              <button onClick={cancelEdit} style={{ ...buttonSecondary, minHeight: isMobile ? '44px' : undefined }}>Cancel</button>
              <button onClick={saveEdit} style={{ ...buttonPrimary, minHeight: isMobile ? '44px' : undefined }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Google Photos slides */}
      {googleSlides.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontFamily: adminFonts.englishBody, fontSize: '16px',
            color: colors.text, marginBottom: '12px',
          }}>
            Active Google Photos Slides
          </h3>
          {googleSlides.map(slide => {
            const album = slide.googleAlbumId && albums.find(a => a.id === slide.googleAlbumId);
            return (
              <div key={slide.id} style={{
                background: colors.surface, border: `1px solid ${colors.muted}`,
                borderRadius: '6px', padding: '10px 14px', marginBottom: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
                    {slide.label || 'Google Photos'}
                  </div>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>
                    {slide.displayMode || 'single'} | {slide.imageDisplayMode || 'fit'} | {slide.photoInterval || 8}s per photo | {slide.duration || 30}s duration
                  </div>
                </div>
                <button onClick={() => startEdit(slide)} style={{ ...buttonSecondary, padding: '6px 14px', fontSize: '12px' }}>
                  Edit
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Connected albums list */}
      {albums.length > 0 && (
        <div>
          <h3 style={{
            fontFamily: adminFonts.englishBody, fontSize: '16px',
            color: colors.text, marginBottom: '12px',
          }}>
            Connected Albums
          </h3>

          {albums.map(album => (
            <div key={album.id} style={{
              background: colors.surface, border: `1px solid ${colors.muted}`,
              borderRadius: '6px', padding: isMobile ? '12px' : '14px 18px', marginBottom: '8px',
            }}>
              <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'stretch' : 'flex-start',
                gap: isMobile ? '10px' : '0',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: adminFonts.englishBody, fontSize: '13px',
                    color: colors.dim, marginBottom: '4px', direction: 'ltr',
                    maxWidth: isMobile ? '100%' : '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {album.url}
                  </div>

                  <div style={{ display: 'flex', gap: isMobile ? '8px' : '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Status badge */}
                    <span style={{
                      padding: '2px 8px', borderRadius: '3px',
                      fontFamily: adminFonts.englishBody, fontSize: '12px',
                      background: album.status === 'ready' ? colors.successBg :
                                  album.status === 'syncing' ? colors.goldBg :
                                  album.status === 'error' ? colors.dangerBg : colors.surface,
                      color: album.status === 'ready' ? colors.success :
                             album.status === 'syncing' ? colors.gold :
                             album.status === 'error' ? colors.danger : colors.dim,
                    }}>
                      {album.status === 'ready' ? `${album.photoCount || 0} photos` :
                       album.status === 'syncing' ? 'Syncing...' :
                       album.status === 'error' ? 'Error' : 'Pending'}
                    </span>

                    {album.lastSync && (
                      <span style={{
                        fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim,
                      }}>
                        Last sync: {new Date(album.lastSync).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {album.error && (
                    <div style={{
                      marginTop: '6px', fontFamily: adminFonts.englishBody,
                      fontSize: '12px', color: colors.danger,
                    }}>
                      {album.error}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleSync(album.id)}
                    style={{ ...buttonSecondary, padding: '6px 12px', fontSize: '12px', minHeight: '36px', flex: isMobile ? 1 : undefined }}
                  >
                    Sync
                  </button>
                  <button
                    onClick={() => handleDelete(album.id)}
                    style={{ ...buttonDanger, padding: '6px 12px', fontSize: '12px', minHeight: '36px', flex: isMobile ? 1 : undefined }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
