import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, alpha } from '../styles/admin-tokens.js';
import { apiFetch, notify } from '../hooks/useAdminState.js';
import { ConfirmDialog, NumberField } from './ui.jsx';
import Collapsible from './ui/Collapsible.jsx';
import Sheet from './ui/Sheet.jsx';
import { Field, Choices, SwitchRow, fieldStyle } from './look/kit.jsx';


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

export default function GooglePhotosManager({ onSlideCreated, onDeleteSlide, slides, onUpdateSlides, canEdit = true, canEditSlides = true }) {
  const [albums, setAlbums] = useState([]);
  const [albumUrl, setAlbumUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmAlbum, setConfirmAlbum] = useState(null); // album to remove

  // Settings for new album slide
  const [displayMode, setDisplayMode] = useState('single');
  const [photoInterval, setPhotoInterval] = useState(8);
  const [photoOrder, setPhotoOrder] = useState('album');
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [maxPhotos, setMaxPhotos] = useState(1000);
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
          maxPhotos,
        }),
      });

      // Create a slide entry for this album (people who can not change slides just connect it)
      if (onSlideCreated && canEditSlides) {
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
    setConfirmAlbum(null);
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
    const album = slide.googleAlbumId && albums.find(a => a.id === slide.googleAlbumId);
    setEditingSlideId(slide.id);
    setEditForm({
      refreshInterval: album?.refreshInterval || 30,
      maxPhotos: album?.maxPhotos ?? 1000,
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
    const slidesOk = await onUpdateSlides(updated);
    if (slidesOk === false) return; // toast already shown; keep the sheet open

    // Also update the album config (sync interval, photo cap, ...) on the server
    const slide = slides.find(s => s.id === editingSlideId);
    if (slide?.googleAlbumId) {
      try {
        const saved = await apiFetch(`/api/google-album/${slide.googleAlbumId}`, {
          method: 'PUT',
          body: JSON.stringify({
            displayMode: editForm.displayMode,
            photoInterval: editForm.photoInterval,
            photoOrder: editForm.photoOrder,
            kenBurns: editForm.kenBurns,
            imageDisplayMode: editForm.imageDisplayMode,
            refreshInterval: editForm.refreshInterval,
            maxPhotos: editForm.maxPhotos,
          }),
        });
        setAlbums(prev => prev.map(a => a.id === slide.googleAlbumId ? { ...a, ...(saved || {}) } : a));
      } catch (err) {
        notify(`Save album settings: ${err.message}`, 'error');
        return;
      }
    }

    setEditingSlideId(null);
    setEditForm(null);
    notify('Google Photos settings saved');
    loadAlbums();
  };

  const addSlideForAlbum = async (album) => {
    if (!onSlideCreated) return;
    await onSlideCreated({
      type: 'GOOGLE_PHOTOS_SLIDE',
      googleAlbumId: album.id,
      displayMode: album.displayMode || 'single',
      photoInterval: album.photoInterval || 8,
      photoOrder: album.photoOrder || 'album',
      kenBurns: !!album.kenBurns,
      imageDisplayMode: album.imageDisplayMode || 'fit',
      duration: 30,
      fullscreen: album.displayMode === 'fullscreen',
      label: 'Google Photos',
      enabled: true,
    });
  };

  // Find Google Photos slides from the slides list
  const googleSlides = (slides || []).filter(s => s.type === 'GOOGLE_PHOTOS_SLIDE');

  const slideOf = (album) => googleSlides.find(s => s.googleAlbumId === album.id);

  const modeLabel = (v) => DISPLAY_MODES.find(m => m.value === v)?.label || v;
  const summaryOf = (f) => `${modeLabel(f.displayMode)}, ${f.photoInterval || 8}s per photo, ${PHOTO_ORDERS.find(o => o.value === f.photoOrder)?.label || 'Album Order'}`;

  // The display options (shared by "connect a new album" and "edit this album")
  const renderSettingsForm = (f, set, isEdit = false) => (
    <div>
      <Field label="Display mode" hint={DISPLAY_MODES.find(m => m.value === f.displayMode)?.desc}>
        <Choices ariaLabel="Display mode" value={f.displayMode} onChange={(v) => set('displayMode', v)} options={DISPLAY_MODES} />
      </Field>
      <Field label="Photo sizing" hint={IMAGE_DISPLAY_MODES.find(m => m.value === f.imageDisplayMode)?.desc}>
        <Choices ariaLabel="Photo sizing" value={f.imageDisplayMode} onChange={(v) => set('imageDisplayMode', v)} options={IMAGE_DISPLAY_MODES} />
      </Field>
      {(f.displayMode === 'single' || f.displayMode === 'fullscreen') && (
        <SwitchRow on={!!f.kenBurns} onChange={(v) => set('kenBurns', v)} label="Slow zoom and pan (Ken Burns)" />
      )}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <Field label="Seconds per photo">
          <NumberField value={f.photoInterval} onCommit={(n) => set('photoInterval', n)} min={3} max={60} style={{ ...fieldStyle, width: '120px' }} ariaLabel="Seconds per photo" />
        </Field>
        <Field label="Slide duration (seconds)">
          <NumberField value={f.duration} onCommit={(n) => set('duration', n)} min={10} max={300} style={{ ...fieldStyle, width: '120px' }} ariaLabel="Slide duration" />
        </Field>
      </div>
      <Field label="Photo order">
        <select style={fieldStyle} value={f.photoOrder} onChange={(e) => set('photoOrder', e.target.value)}>
          {PHOTO_ORDERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Check for new photos">
        <select style={fieldStyle} value={f.refreshInterval || 30} onChange={(e) => set('refreshInterval', parseInt(e.target.value))}>
          {REFRESH_INTERVALS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="Max photos to keep">
        <select style={fieldStyle} value={f.maxPhotos ?? 1000} onChange={(e) => set('maxPhotos', parseInt(e.target.value))}>
          {[200, 500, 1000, 2000].map(n => <option key={n} value={n}>{n}</option>)}
          <option value={0}>All (no limit)</option>
        </select>
      </Field>
      {isEdit && (
        <Field label="Label (only you see it)">
          <input style={fieldStyle} value={f.label || ''} maxLength={80} onChange={(e) => set('label', e.target.value)} />
        </Field>
      )}
    </div>
  );

  const newForm = { displayMode, photoInterval, photoOrder, kenBurns, imageDisplayMode, duration: slideDuration, refreshInterval, maxPhotos };
  const setNew = (field, value) => {
    switch (field) {
      case 'displayMode': setDisplayMode(value); break;
      case 'photoInterval': setPhotoInterval(value); break;
      case 'photoOrder': setPhotoOrder(value); break;
      case 'kenBurns': setKenBurns(value); break;
      case 'imageDisplayMode': setImageDisplayMode(value); break;
      case 'duration': setSlideDuration(value); break;
      case 'refreshInterval': setRefreshInterval(value); break;
      case 'maxPhotos': setMaxPhotos(value); break;
      default: break;
    }
  };

  const editingSlide = editingSlideId ? slides?.find(s => s.id === editingSlideId) : null;
  const editingAlbum = editingSlide?.googleAlbumId ? albums.find(a => a.id === editingSlide.googleAlbumId) : null;
  const btn = { minHeight: '44px', padding: '0 14px', fontSize: '14px' };
  const notice = (kind, text) => (
    <div role={kind === 'error' ? 'alert' : 'status'} style={{
      marginTop: '10px', padding: '10px 12px', borderRadius: 'var(--r-sm)', fontSize: '13px', lineHeight: 1.5,
      background: kind === 'error' ? colors.dangerBg : colors.successBg, color: kind === 'error' ? colors.danger : colors.success,
      border: `1px solid ${alpha(kind === 'error' ? colors.danger : colors.success, 50)}`,
    }}>{text}</div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', maxWidth: '760px', fontFamily: adminFonts.englishBody }}>
      <p style={{ margin: 0, color: colors.dim, fontSize: '14px', lineHeight: 1.5 }}>
        Show the photos of a shared Google Photos album on the screen.
      </p>

      {canEdit && (
        <>
          <Collapsible id="media-photos-connect" title="Connect an album" summary="Paste the share link of a Google Photos album" icon="plus" defaultOpen={albums.length === 0}>
            <Field label="Album link" htmlFor="tt-album-url">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input id="tt-album-url" data-testid="album-url" type="url" value={albumUrl} onChange={(e) => setAlbumUrl(e.target.value)} placeholder="https://photos.google.com/share/..." style={{ ...fieldStyle, flex: '1 1 220px', direction: 'ltr' }} />
                <button type="button" onClick={handleConnect} disabled={connecting} style={{ ...buttonPrimary, ...btn, opacity: connecting ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                  {connecting ? 'Connecting...' : 'Connect album'}
                </button>
              </div>
            </Field>
            {error && notice('error', error)}
            {success && notice('ok', success)}
            <Collapsible title="How to get the link" summary="Six steps on your phone" style={{ marginTop: '16px', boxShadow: 'none' }}>
              <ol style={{ fontSize: '14px', color: colors.text, paddingLeft: '20px', margin: '12px 0 0', lineHeight: 1.8 }}>
                <li>Open <strong>Google Photos</strong> on your phone</li>
                <li>Open or create an album</li>
                <li>Tap the <strong>share button</strong></li>
                <li>Tap <strong>"Create link"</strong> or <strong>"Get link"</strong></li>
                <li>Copy the link</li>
                <li>Paste it in the box above</li>
              </ol>
            </Collapsible>
          </Collapsible>
          <Collapsible title="Display settings for the next album" summary={summaryOf(newForm)}>
            {renderSettingsForm(newForm, setNew, false)}
          </Collapsible>
        </>
      )}

      <h3 style={{ margin: '8px 0 0', fontSize: '16px', fontWeight: 700, color: colors.text }}>Connected albums{albums.length ? ` (${albums.length})` : ''}</h3>
      {albums.length === 0 && (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: colors.dim, fontSize: '14px', background: colors.card, border: `1px dashed ${colors.border}`, borderRadius: 'var(--r-md)' }}>
          No albums connected yet.
        </div>
      )}
      {albums.map(album => {
        const linked = slideOf(album);
        const tone = album.status === 'ready' ? colors.success : album.status === 'error' ? colors.danger : album.status === 'syncing' ? colors.accent : colors.dim;
        return (
          <article key={album.id} data-testid="album-card" style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)', padding: '14px 16px' }}>
            <div style={{ fontSize: '13px', color: colors.dim, direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.url}</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px', fontSize: '13px' }}>
              <span style={{ fontWeight: 700, color: tone }}>
                {album.status === 'ready' ? `${album.photoCount || 0} photos` : album.status === 'syncing' ? 'Syncing...' : album.status === 'error' ? 'Error' : 'Pending'}
              </span>
              {album.lastSync && <span style={{ color: colors.dim }}>Last sync: {new Date(album.lastSync).toLocaleString()}</span>}
              <span style={{ color: linked ? colors.success : colors.dim }}>{linked ? `On screen · ${summaryOf(linked)}, ${linked.duration || 30}s` : 'Not on screen'}</span>
            </div>
            {album.error && <div style={{ marginTop: '6px', fontSize: '13px', color: colors.danger }}>{album.error}</div>}
            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                {linked && canEditSlides && <button type="button" onClick={() => startEdit(linked)} style={{ ...buttonSecondary, ...btn }}>Settings</button>}
                {!linked && canEditSlides && <button type="button" onClick={() => addSlideForAlbum(album)} title="This album has no slide in the rotation" style={{ ...buttonPrimary, ...btn }}>Add to screen</button>}
                <button type="button" onClick={() => handleSync(album.id)} style={{ ...buttonSecondary, ...btn }}>Sync now</button>
                <button type="button" onClick={() => setConfirmAlbum(album)} style={{ ...buttonSecondary, ...btn, color: colors.danger }}>Remove</button>
              </div>
            )}
          </article>
        );
      })}

      {/* Settings of an existing album's slide */}
      <Sheet open={!!(editingSlideId && editForm)} onClose={cancelEdit} title="Album settings">
        {editingSlideId && editForm && (
          <>
            {editingAlbum?.url && <div style={{ marginTop: '8px', fontSize: '12px', color: colors.dim, direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Album: {editingAlbum.url}</div>}
            {renderSettingsForm(editForm, (field, value) => setEditForm(prev => ({ ...prev, [field]: value })), true)}
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
              <button type="button" onClick={saveEdit} style={{ ...buttonPrimary, ...btn, padding: '0 20px' }}>Save changes</button>
              <button type="button" onClick={cancelEdit} style={{ ...buttonSecondary, ...btn, padding: '0 20px' }}>Cancel</button>
            </div>
          </>
        )}
      </Sheet>

      {confirmAlbum && (
        <ConfirmDialog
          title="Remove this album?"
          message="The album, its saved photos and its slide on the screen will be removed."
          confirmLabel="Remove"
          onConfirm={() => handleDelete(confirmAlbum.id)}
          onCancel={() => setConfirmAlbum(null)}
        />
      )}
    </div>
  );
}
