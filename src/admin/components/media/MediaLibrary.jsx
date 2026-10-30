import React, { useState, useEffect, useCallback } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary, buttonDanger } from '../../styles/admin-tokens.js';
import { apiFetch, notify } from '../../hooks/useAdminState.js';
import { ConfirmDialog } from '../ui.jsx';
import Sheet from '../ui/Sheet.jsx';
import ImageUploader from '../ImageUploader.jsx';
import AddToScreenForm from './AddToScreenForm.jsx';
import SizeCard from './SizeCard.jsx';
import { defaultOptions, buildSlide, slidesUsing, formatBytes } from './mediaOptions.js';
import { sizeText } from '../../../shared/screenSize.js';

const small = { minHeight: '44px', padding: '0 12px', fontSize: '14px' };

function Thumb({ item }) {
  const box = { width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', display: 'block', background: colors.sunken };
  if (item.mediaType === 'video') return <video src={`/uploads/${item.filename}#t=0.1`} preload="metadata" muted playsInline style={box} />;
  return <img src={`/uploads/${item.filename}`} alt="" loading="lazy" style={box} />;
}

/** Library tab: size card, upload, and the grid of everything uploaded. */
export default function MediaLibrary({ rec, slides = [], canUpload, canDelete, canAdd, canRemoveSlides, onCreateSlide, onDeleteSlide }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(null); // item being added to the screen
  const [opts, setOpts] = useState(defaultOptions());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // item to delete

  const load = useCallback(async () => {
    try { setItems(await apiFetch('/api/media') || []); setError(''); }
    catch (err) { setError(err.message || 'Could not load your uploads.'); setItems((x) => x || []); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // The slide list changes (add / remove a slide) -> "On screen" badges change; refresh the files too.
  const slideCount = slides.length;
  useEffect(() => { if (items) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slideCount]);

  const openAdd = (item) => { setOpts(defaultOptions(item)); setAdding(item); };
  const confirmAdd = async () => {
    setBusy(true);
    try {
      const created = await onCreateSlide?.(buildSlide(adding, opts));
      if (created) setAdding(null);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    const item = confirm;
    setBusy(true);
    try {
      // Slides that show it go first (the last one removes the file itself), then whatever is left.
      for (const s of slidesUsing(item, slides)) await onDeleteSlide?.(s.id);
      await apiFetch(`/api/media/${item.id}`, { method: 'DELETE' });
      setItems((list) => (list || []).filter((x) => x.id !== item.id));
      notify('Deleted from the library');
    } catch (err) {
      notify(`Delete: ${err.message || 'failed'}`, 'error');
    } finally { setBusy(false); setConfirm(null); }
  };

  const usedBy = confirm ? slidesUsing(confirm, slides) : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', fontFamily: adminFonts.englishBody }}>
      <SizeCard rec={rec} />
      {canUpload && <ImageUploader rec={rec} canAdd={canAdd} onSlideCreated={onCreateSlide} onUploaded={load} />}

      <h3 style={{ margin: '12px 0 0', fontSize: '16px', fontWeight: 700, color: colors.text }}>
        Your uploads{items ? ` (${items.length})` : ''}
      </h3>
      <p style={{ margin: '-6px 0 0', fontSize: '13px', color: colors.dim, lineHeight: 1.5 }}>
        Files not on any slide are cleaned up after a day.
      </p>
      {error && <div role="alert" style={{ color: colors.danger, fontSize: '14px' }}>{error}</div>}
      {items && items.length === 0 && !error && (
        <div style={{ padding: '28px 16px', textAlign: 'center', color: colors.dim, fontSize: '14px', background: colors.card, border: `1px dashed ${colors.border}`, borderRadius: 'var(--r-md)' }}>
          Nothing uploaded yet.{canUpload ? ' Choose a picture or video above.' : ''}
        </div>
      )}
      {items && items.length > 0 && (
        <div data-testid="media-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
          {items.map((it) => {
            const used = slidesUsing(it, slides);
            return (
              <article key={it.id} data-testid="media-item" style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', boxShadow: 'var(--e1)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Thumb item={it} />
                <div style={{ padding: '10px 12px 4px', fontSize: '12px', color: colors.dim, lineHeight: 1.5 }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: colors.text, textTransform: 'uppercase', fontSize: '12px' }}>{it.mediaType}</span>
                    {used.length > 0
                      ? <span style={{ color: colors.success, fontWeight: 700 }}>On screen{used.length > 1 ? ` ×${used.length}` : ''}</span>
                      : <span>Not on screen</span>}
                  </div>
                  <div>{it.mediaType === 'pdf' ? `${it.pages} pages · ` : ''}{it.width ? `${sizeText(it.width, it.height)} · ` : ''}{formatBytes(it.bytes)}</div>
                </div>
                <div style={{ padding: '6px 12px 12px', display: 'grid', gap: '6px', marginTop: 'auto' }}>
                  {canAdd && <button type="button" style={{ ...buttonPrimary, ...small }} onClick={() => openAdd(it)}>Add to screen</button>}
                  {canDelete && (!used.length || canRemoveSlides) && <button type="button" style={{ ...buttonSecondary, ...small, color: colors.danger }} onClick={() => setConfirm(it)}>Delete</button>}
                  {canDelete && used.length > 0 && !canRemoveSlides && <span style={{ fontSize: '12px', color: colors.dim }}>Remove its slide to delete it.</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={!!adding} onClose={() => setAdding(null)} title="Add to screen">
        {adding && (
          <>
            <div style={{ marginTop: '8px', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}><Thumb item={adding} /></div>
            <AddToScreenForm item={adding} value={opts} onChange={setOpts} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
              <button type="button" style={{ ...buttonPrimary, minHeight: '44px', padding: '0 20px', opacity: busy ? 0.6 : 1 }} onClick={confirmAdd} disabled={busy}>{busy ? 'Adding...' : 'Add to screen'}</button>
              <button type="button" style={{ ...buttonSecondary, minHeight: '44px', padding: '0 20px' }} onClick={() => setAdding(null)}>Cancel</button>
            </div>
          </>
        )}
      </Sheet>

      {confirm && (
        <ConfirmDialog
          title="Delete this file?"
          message={usedBy.length
            ? `It is on ${usedBy.length} slide${usedBy.length > 1 ? 's' : ''}. ${usedBy.length > 1 ? 'Those slides' : 'That slide'} will be removed too. This can not be undone.`
            : 'It will be removed from the library. This can not be undone.'}
          confirmLabel={busy ? 'Deleting...' : 'Delete'}
          onConfirm={doDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
