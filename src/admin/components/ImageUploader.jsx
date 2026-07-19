import React, { useState, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

const DISPLAY_MODES = [
  { value: 'fit', label: 'Fit (show full)' },
  { value: 'fill', label: 'Fill (crop to cover)' },
  { value: 'stretch', label: 'Stretch' },
];

const EDGE_TREATMENTS = [
  { value: 'blur', label: 'Blur' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export default function ImageUploader({ onSlideCreated }) {
  const isMobile = useIsMobile();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [displayMode, setDisplayMode] = useState('fit');
  const [edgeTreatment, setEdgeTreatment] = useState('blur');
  const [duration, setDuration] = useState(10);
  const [fullscreen, setFullscreen] = useState(false);
  const [label, setLabel] = useState('');

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('media', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': getCsrfToken() },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);

      // Default videos to longer duration
      if (data.mediaType === 'video') {
        setDuration(45);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const [addingSlide, setAddingSlide] = useState(false);

  const handleAddSlide = async () => {
    if (!result) return;

    setAddingSlide(true);
    try {
      const isVideo = result.mediaType === 'video';
      const isGif = result.mediaType === 'gif';

      const created = await onSlideCreated({
        type: isVideo ? 'VIDEO_SLIDE' : 'IMAGE_SLIDE',
        mediaId: result.id,
        mediaType: result.mediaType,
        imageUrl: !isVideo ? `/uploads/${result.filename}` : undefined,
        videoUrl: isVideo ? `/uploads/${result.filename}` : undefined,
        blurUrl: result.blurFilename ? `/uploads/${result.blurFilename}` : undefined,
        dominantColor: result.dominantColor,
        displayMode: isVideo ? 'fill' : displayMode,
        edgeTreatment: (!isVideo && displayMode === 'fit') ? edgeTreatment : undefined,
        fullscreen,
        label: label || undefined,
        enabled: true,
        duration: isVideo ? 0 : duration, // 0 = play full video
        isGif,
      });

      if (created) {
        setResult(null);
        setDisplayMode('fit');
        setEdgeTreatment('blur');
        setDuration(10);
        setFullscreen(false);
        setLabel('');
      }
    } finally {
      setAddingSlide(false);
    }
  };

  const handleDiscard = async () => {
    if (result) {
      try {
        await fetch(`/api/media/${result.id}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': getCsrfToken() },
        });
      } catch { /* ignore */ }
    }
    setResult(null);
  };

  const sectionStyle = {
    background: colors.surface,
    border: `1px solid ${colors.muted}`,
    borderRadius: '8px',
    padding: '24px',
  };

  const labelStyle = {
    fontFamily: adminFonts.hebrewPrimary,
    fontSize: '14px',
    color: colors.dim,
    marginBottom: '6px',
    display: 'block',
  };

  const selectStyle = {
    ...inputStyle,
    appearance: 'none',
    cursor: 'pointer',
  };

  const isVideo = result?.mediaType === 'video';
  const isGif = result?.mediaType === 'gif';

  return (
    <div>
      <div style={sectionStyle}>
        {/* Upload area */}
        {!result && (
          <div style={{ textAlign: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              style={{
                ...buttonPrimary,
                opacity: uploading ? 0.6 : 1,
                padding: '12px 32px',
                fontSize: '16px',
              }}
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Choose Media'}
            </button>
            <p style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '13px',
              color: colors.dim,
              marginTop: '12px',
            }}>
              Images (JPEG, PNG, WebP), GIFs, or Videos (MP4, WebM) — max 50 MB
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: colors.danger,
            marginTop: '12px',
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        {/* Result preview + options */}
        {result && (
          <div>
            {/* Preview */}
            <div style={{
              borderRadius: '6px',
              overflow: 'hidden',
              marginBottom: '20px',
              background: '#000',
              textAlign: 'center',
            }}>
              {isVideo ? (
                <video
                  src={`/uploads/${result.filename}`}
                  controls
                  muted
                  style={{ maxWidth: '100%', maxHeight: '300px' }}
                />
              ) : (
                <img
                  src={`/uploads/${result.filename}`}
                  alt="Uploaded preview"
                  style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                />
              )}
            </div>

            {/* Media type badge */}
            <div style={{
              display: 'inline-block',
              padding: '3px 10px',
              borderRadius: '4px',
              background: isVideo ? 'rgba(99,102,241,0.2)' : isGif ? 'rgba(34,197,94,0.2)' : 'rgba(212,168,75,0.2)',
              color: isVideo ? '#818cf8' : isGif ? '#4ade80' : colors.gold,
              fontFamily: adminFonts.englishBody,
              fontSize: '12px',
              fontWeight: 600,
              marginBottom: '16px',
              textTransform: 'uppercase',
            }}>
              {result.mediaType}
            </div>

            {/* Label */}
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Rebbe's photo, event flyer, promo clip..."
                style={inputStyle}
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: '16px',
              marginBottom: '20px',
            }}>
              {/* Display mode — not for video */}
              {!isVideo && (
                <div>
                  <label style={labelStyle}>Display Mode</label>
                  <select
                    style={selectStyle}
                    value={displayMode}
                    onChange={(e) => setDisplayMode(e.target.value)}
                  >
                    {DISPLAY_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Edge treatment (only for fit mode, images only) */}
              {!isVideo && displayMode === 'fit' && (
                <div>
                  <label style={labelStyle}>Edge Treatment</label>
                  <select
                    style={selectStyle}
                    value={edgeTreatment}
                    onChange={(e) => setEdgeTreatment(e.target.value)}
                  >
                    {EDGE_TREATMENTS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Duration */}
              <div>
                <label style={labelStyle}>
                  {isVideo ? 'Duration (0 = play full clip)' : 'Duration (seconds)'}
                </label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>

              {/* Fullscreen toggle */}
              <div>
                <label style={labelStyle}>Fullscreen</label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '6px',
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={fullscreen}
                    onChange={(e) => setFullscreen(e.target.checked)}
                    style={{ accentColor: colors.gold }}
                  />
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '13px',
                    color: colors.dim,
                  }}>
                    Hide clock/date column
                  </span>
                </label>
              </div>
            </div>

            {/* Dimensions info (images/gifs only) */}
            {!isVideo && result.width && (
              <p style={{
                fontFamily: adminFonts.englishBody,
                fontSize: '12px',
                color: colors.dim,
                marginBottom: '16px',
              }}>
                {result.width} x {result.height}px
                {result.dominantColor && (
                  <>
                    {' — Dominant color: '}
                    <span style={{
                      display: 'inline-block',
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      background: result.dominantColor,
                      verticalAlign: 'middle',
                      marginLeft: '4px',
                    }} />
                  </>
                )}
              </p>
            )}

            {/* Actions */}
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '12px',
            }}>
              <button
                style={{ ...buttonPrimary, opacity: addingSlide ? 0.6 : 1, minHeight: '44px', flex: isMobile ? undefined : undefined }}
                onClick={handleAddSlide}
                disabled={addingSlide}
              >
                {addingSlide ? 'Adding...' : 'Add as Slide'}
              </button>
              <button style={{ ...buttonSecondary, minHeight: '44px' }} onClick={handleDiscard}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
