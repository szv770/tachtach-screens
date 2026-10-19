import React, { useState, useRef } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, buttonDanger, alpha } from '../styles/admin-tokens.js';
import { getCsrfToken } from './look/kit.jsx';
import AddToScreenForm from './media/AddToScreenForm.jsx';
import { defaultOptions, buildSlide } from './media/mediaOptions.js';
import { imageAdvice, sizeText } from '../../shared/screenSize.js';

// SlideManager imports these two from here; they live in media/mediaOptions.js now.
export { DISPLAY_MODES, EDGE_TREATMENTS } from './media/mediaOptions.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
const btn = { minHeight: '44px', padding: '0 20px' };

/**
 * Upload a picture, GIF or video, then (optionally) put it on the screen.
 * `rec` = recommended size, `canAdd` = may create slides, `onUploaded` refreshes the library grid.
 */
export default function ImageUploader({ onSlideCreated, rec, canAdd = true, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [opts, setOpts] = useState(defaultOptions());
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'X-CSRF-Token': getCsrfToken() }, body: formData, credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setResult(data);
      setOpts(defaultOptions(data));
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAdd = async () => {
    if (!result) return;
    setAdding(true);
    try {
      const created = await onSlideCreated?.(buildSlide(result, opts));
      if (created) { setResult(null); onUploaded?.(); }
    } finally { setAdding(false); }
  };

  const discard = async () => {
    if (result) {
      try { await fetch(`/api/media/${result.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': getCsrfToken() }, credentials: 'same-origin' }); } catch { /* ignore */ }
    }
    setResult(null);
    onUploaded?.();
  };

  const isVideo = result?.mediaType === 'video';
  const advice = result && !isVideo && result.width ? imageAdvice(result.width, result.height, rec) : null;

  return (
    <section id="media-upload" style={{
      background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)',
      padding: '16px', fontFamily: adminFonts.englishBody,
    }}>
      {!result && (
        <div
          data-testid="dropzone"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer?.files?.[0]); }}
          style={{
            border: `2px dashed ${drag ? colors.accent : colors.border}`, borderRadius: 'var(--r-md)', padding: '20px 16px', textAlign: 'center',
            background: drag ? colors.accentSoft : colors.sunken,
          }}
        >
          <input ref={fileRef} type="file" accept={ACCEPT} data-testid="file-input" onChange={(e) => upload(e.target.files?.[0])} style={{ display: 'none' }} />
          <button type="button" style={{ ...buttonPrimary, ...btn, opacity: uploading ? 0.6 : 1 }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Choose a picture or video'}
          </button>
          <p style={{ fontSize: '13px', color: colors.dim, margin: '12px 0 0', lineHeight: 1.5 }}>
            or drop a file here. Pictures (JPEG, PNG, WebP), GIFs, or videos (MP4, WebM), up to 50 MB.
            {rec && <><br />Best size for this screen: <strong style={{ color: colors.text }}>{sizeText(rec.width, rec.height)}</strong>.</>}
          </p>
        </div>
      )}

      {error && <p role="alert" style={{ fontSize: '14px', color: colors.danger, margin: '12px 0 0', textAlign: 'center' }}>{error}</p>}

      {result && (
        <div>
          <div style={{ borderRadius: 'var(--r-sm)', overflow: 'hidden', background: '#000', textAlign: 'center' }}>
            {isVideo
              ? <video src={`/uploads/${result.filename}`} controls muted style={{ maxWidth: '100%', maxHeight: '280px' }} />
              : <img src={`/uploads/${result.filename}`} alt="Uploaded preview" style={{ maxWidth: '100%', maxHeight: '280px', objectFit: 'contain' }} />}
          </div>
          <p style={{ fontSize: '13px', color: colors.dim, margin: '8px 0 0' }}>
            {result.mediaType.toUpperCase()}{result.width ? ` · ${sizeText(result.width, result.height)}` : ''}
          </p>
          {advice && (
            <div role="status" data-testid="size-advice" style={{
              marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--r-sm)', fontSize: '13px', lineHeight: 1.5,
              background: colors.warnSoft, color: colors.text, border: `1px solid ${alpha(colors.warn, 50)}`,
            }}>{advice.message} You can still use it.</div>
          )}
          {canAdd && <AddToScreenForm item={result} value={opts} onChange={setOpts} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '18px' }}>
            {canAdd && <button type="button" style={{ ...buttonPrimary, ...btn, opacity: adding ? 0.6 : 1 }} onClick={handleAdd} disabled={adding}>{adding ? 'Adding...' : 'Add to screen'}</button>}
            <button type="button" style={{ ...buttonSecondary, ...btn }} onClick={() => { setResult(null); }}>Keep in library</button>
            <button type="button" style={{ ...buttonDanger, ...btn }} onClick={discard}>Discard</button>
          </div>
        </div>
      )}
    </section>
  );
}
