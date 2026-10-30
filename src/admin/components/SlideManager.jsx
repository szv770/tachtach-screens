import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { primaryText } from '../../shared/announcements.js';
import { rotationEntries, moveEntry, layerGroups, postStatus, postingDefaults, LAYER_KINDS, LAYER_LABEL } from '../../shared/postList.js';
import { PostStatusChip } from './announcements/PostBits.jsx';
import { can } from '../../shared/permissions.js';
import { notify } from '../hooks/useAdminState.js';
import Icon from './ui/Icon.jsx';
import NewSlideFlow from './slides/NewSlideFlow.jsx';
import SlideEditSheet from './slides/SlideEditSheet.jsx';
import { SLIDE_OPEN_EVENT, takeSlideOpen } from './slides/openRequest.js';
import { slideTitle, isDeletable, isEmbedType, typeInfo } from './slides/slideTypes.js';
import Sheet from './ui/Sheet.jsx';

const Pencil = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
);

const iconBtn = { width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)', border: `1px solid ${colors.line}`, background: colors.card, color: colors.dim, cursor: 'pointer', padding: 0 };

/**
 * Screen > Slides: one row per slide (reorder, name, on/off, pencil). Each slide's own options
 * open in a popup (SlideEditSheet); "New slide" is a 2-step card flow (NewSlideFlow). The kinds of
 * slide come from the registry in slides/slideTypes.js.
 */
export default function SlideManager({
  slides = [], onUpdate, onCreate, onDelete, settings = {}, onSaveSettings, onNavigate,
  announcements = [], onNewMessage, onEditAnnouncement, onToggleAnnouncement, onDeleteAnnouncement, onOpenPost, caps = [],
}) {
  const isMobile = useIsMobile();
  const canEdit = can(caps, 'slides.edit');
  const canDelete = can(caps, 'slides.delete');
  const canEditAnn = can(caps, 'announcements.edit');
  const canDeleteAnn = can(caps, 'announcements.delete') && !!onDeleteAnnouncement;
  const [confirmMsg, setConfirmMsg] = useState(null); // announcement to delete
  const [newOpen, setNewOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Rows are only draggable while the mouse is down on the handle (so text can still be selected).
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  const slidesRef = useRef(slides);
  slidesRef.current = slides;
  const annRef = useRef(announcements);
  annRef.current = announcements;
  const annById = new Map(announcements.map((a) => [a.id, a]));
  const tz = settings?.location?.timezone || undefined;
  const now = new Date();
  const { showEnded } = postingDefaults(settings);
  // Every slide-style post is a row here (a post without a rotation row yet shows where the screen plays it: after the
  // others, oldest first). Banners, side notes, takeovers and 'holds the screen' posts are in 'Always-on layers' below.
  const entries = rotationEntries(slides, announcements)
    .filter((e) => showEnded || !e.item || postStatus(e.item, now, { tz }).key !== 'ended');
  const layers = layerGroups(announcements, { showEnded }, now, { tz });
  const layerCount = LAYER_KINDS.reduce((n, k) => n + layers[k].length, 0);
  const title = (s) => slideTitle(s, { announcementsById: annById });
  const entryTitle = (e) => (e.row ? title(e.row) : String(primaryText(e.item) || '').split('\n')[0] || 'Message');
  const openPost = (item) => (onOpenPost ? onOpenPost(item) : onEditAnnouncement?.(item));

  // Instant on/off with an Undo toast.
  const toggle = (id) => {
    const cur = slidesRef.current.find((s) => s.id === id);
    if (!cur) return;
    const nowOn = cur.enabled === false;
    onUpdate(slidesRef.current.map((s) => (s.id === id ? { ...s, enabled: nowOn } : s)));
    notify(`${title(cur)} turned ${nowOn ? 'on' : 'off'}`, 'success', {
      label: 'Undo', onClick: () => onUpdate(slidesRef.current.map((s) => (s.id === id ? { ...s, enabled: !nowOn } : s))),
    });
  };

  // Moving any row (also a post that had no rotation row yet) saves the whole list; the screen plays the same order it shows.
  const move = (from, to) => {
    const e = entries[from];
    const target = entries[to];
    if (!e || !target || from === to) return;
    const all = rotationEntries(slidesRef.current, annRef.current);
    const next = moveEntry(slidesRef.current, annRef.current, e.key, all.findIndex((x) => x.key === target.key));
    if (next) onUpdate(next);
  };
  // A post's on/off is the post's own switch (the same one the Announcements page shows); an old row switched off is switched back on with it.
  const togglePost = (e) => {
    const ann = e.item;
    if (!ann) return;
    const turnOn = ann.enabled === false || e.row?.enabled === false;
    if (turnOn && e.row?.enabled === false) onUpdate(slidesRef.current.map((s) => (s.id === e.row.id ? { ...s, enabled: true } : s)));
    if (turnOn ? ann.enabled === false : true) onToggleAnnouncement?.(ann, turnOn);
  };
  const dragEnd = () => {
    const from = dragIdx; const to = dragOverIdx;
    setDragIdx(null); setDragOverIdx(null);
    if (from !== null && to !== null) move(from, to);
  };

  // The pencil opens the same basic popup on EVERY slide; types with a richer page get a 'More settings…' button in it.
  const openEdit = (slide) => setEditId(slide.id);

  // Requests from search: open "New slide" or one slide's popup (the first slide of that type).
  useEffect(() => {
    const run = (req) => {
      if (!req || !canEdit) return;
      if (req.kind === 'new') setNewOpen(true);
      else if (req.kind === 'edit') {
        const s = slidesRef.current.find((x) => x.type === req.type);
        if (s) openEdit(s); else notify('That slide is not in your list yet. Use New slide to add it.', 'error');
      }
    };
    run(takeSlideOpen());
    const on = (e) => { takeSlideOpen(); run(e.detail); };
    window.addEventListener(SLIDE_OPEN_EVENT, on);
    return () => window.removeEventListener(SLIDE_OPEN_EVENT, on);
  }, [canEdit]);

  // Go to another admin page; the popup closes if the move really happens.
  const go = (section, opts) => {
    const ok = onNavigate?.(section, opts);
    if (ok !== false) { setEditId(null); setNewOpen(false); }
    return ok;
  };

  const editing = editId ? slides.find((s) => s.id === editId) : null;
  const subtitle = (s) => {
    const bits = [];
    if (s.duration) bits.push(`${s.duration} s`);
    if (s.fullscreen) bits.push('Fullscreen');
    return bits.join(' · ');
  };

  return (
    <div style={{ fontFamily: adminFonts.englishBody }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: 0 }}>Slides</h2>
          <p style={{ fontSize: '13px', color: colors.dim, margin: '4px 0 0' }}>
            {canEdit
              ? 'Everything that takes turns on the screen, in order: built-in slides and your message slides. Turn any on or off, move it, and tap the pencil for its own options.'
              : 'What plays on the screen, in order. You can look but not change the slides.'}
          </p>
        </div>
        {canEdit && (
          <button type="button" style={{ ...buttonPrimary, minHeight: '44px' }} onClick={() => setNewOpen(true)} data-testid="new-slide-btn">+ New slide</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {entries.map((e, idx) => {
          const slide = e.row;
          const ann = e.item;
          const isAnn = !slide || slide.type === 'ANNOUNCEMENT';
          const on = isAnn ? !!ann && ann.enabled !== false && slide?.enabled !== false : slide.enabled !== false;
          const needsSetup = !isAnn && isEmbedType(slide.type) && !slide.embedUrl;
          const sub = isAnn ? '' : subtitle(slide);
          const ps = isAnn && ann ? postStatus(ann, now, { tz }) : null;
          const name = entryTitle(e);
          return (
            <div
              key={e.key}
              className="tt-row"
              data-testid="slide-row"
              data-kind={isAnn ? 'post' : 'slide'}
              draggable={canEdit && !isMobile && dragIdx === idx}
              onDragEnter={canEdit && !isMobile && dragIdx !== null ? () => setDragOverIdx(idx) : undefined}
              onDragEnd={canEdit && !isMobile ? dragEnd : undefined}
              onDragOver={canEdit && !isMobile ? (ev) => ev.preventDefault() : undefined}
              onMouseUp={canEdit && !isMobile ? () => setDragIdx(null) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', padding: isMobile ? '6px 8px' : '6px 12px', minHeight: '60px',
                background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', opacity: dragIdx === idx ? 0.45 : on ? 1 : 0.7,
                boxShadow: dragIdx !== null && dragOverIdx === idx && dragIdx !== idx ? `inset 0 ${dragIdx < idx ? '-2px' : '2px'} 0 0 ${colors.gold}` : 'none',
              }}
            >
              {canEdit && (!isMobile ? (
                <span title="Drag to reorder" aria-label="Drag to reorder" onMouseDown={() => setDragIdx(idx)}
                  style={{ color: colors.muted, fontSize: '20px', cursor: 'grab', userSelect: 'none', padding: '0 4px', width: 28, textAlign: 'center' }}>{'≡'}</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  {[['up', -1, '▲', 'Move slide up', idx === 0], ['down', 1, '▼', 'Move slide down', idx === entries.length - 1]].map(([k, d, ch, lab, dis]) => (
                    <button key={k} type="button" onClick={() => move(idx, idx + d)} disabled={dis} aria-label={`${lab}: ${name}`}
                      style={{ background: 'transparent', border: 'none', color: colors.dim, fontSize: '13px', lineHeight: 1, width: 44, height: 30, opacity: dis ? 0.25 : 1, cursor: dis ? 'default' : 'pointer', padding: 0 }}>{ch}</button>
                  ))}
                </div>
              ))}

              <div style={{ flex: 1, minWidth: 0, padding: '2px 0' }}>
                <div dir="auto" style={{ fontSize: '15px', fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                {isAnn ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', minWidth: 0, overflow: 'hidden' }}>
                    <span data-testid="message-badge" style={{ flexShrink: 0, padding: '0 7px', borderRadius: '999px', border: `1px solid ${colors.line}`, fontSize: '11.5px', fontWeight: 700, color: colors.dim }}>Message</span>
                    {ps ? <PostStatusChip status={ps} /> : <span style={{ fontSize: '12px', color: colors.danger }}>Deleted</span>}
                    {ann?.slide?.duration && <span style={{ flexShrink: 0, fontSize: '12px', color: colors.dim }}>{ann.slide.duration} s</span>}
                  </div>
                ) : (sub || needsSetup) && (
                  <div style={{ fontSize: '12px', color: needsSetup ? colors.danger : colors.dim, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {needsSetup ? 'Needs a web address' : sub}
                  </div>
                )}
              </div>

              {(isAnn ? canEditAnn && !!ann && ps?.key !== 'draft' && ps?.key !== 'ended' : canEdit) ? (
                <ToggleSwitch
                  on={on}
                  label={`${name}: ${on ? 'on, tap to turn off' : 'off, tap to turn on'}`}
                  onChange={() => (isAnn ? togglePost(e) : toggle(slide.id))}
                />
              ) : (
                <span style={{ fontSize: '12px', fontWeight: 700, color: on ? colors.accent : colors.dim, padding: '0 6px' }}>{isAnn && ps && (ps.key === 'draft' || ps.key === 'ended') ? '' : on ? 'On' : 'Off'}</span>
              )}

              {isAnn
                ? (ann && (
                  <button type="button" style={iconBtn} onClick={() => openPost(ann)} aria-label={`Open message: ${name}`} title="This message's options" data-testid="slide-pencil"><Pencil /></button>
                ))
                : !canEdit && canDelete && isDeletable(slide)
                  ? <button type="button" style={{ ...iconBtn, color: colors.danger }} onClick={() => setConfirmDelete(slide)} aria-label={`Delete ${name}`} title="Delete this slide" data-testid="slide-delete-inline">{'\u00D7'}</button>
                  : (canEdit && (
                  <button type="button" style={iconBtn} onClick={() => openEdit(slide)} aria-label={`Edit ${name}`} title={"This slide's options"} data-testid="slide-pencil"><Pencil /></button>
                ))}
              {isAnn && !ann && slide && canDelete && (
                <button type="button" style={{ ...iconBtn, color: colors.danger }} onClick={() => onDelete(slide.id)} aria-label={`Remove row: ${name}`} title="Remove this empty row" data-testid="slide-delete-inline">{'\u00D7'}</button>
              )}
              {isAnn && ann && canDeleteAnn && (
                <button type="button" style={{ ...iconBtn, color: colors.danger }} onClick={() => setConfirmMsg(ann)} aria-label={`Delete message: ${name}`} title="Delete this message" data-testid="message-delete">{'\u00D7'}</button>
              )}
            </div>
          );
        })}
        {entries.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: colors.dim, fontSize: '14px' }}>No slides yet.{canEdit && ' Tap "+ New slide".'}</div>}
      </div>

      <section data-testid="layers" style={{ marginTop: '22px' }}>
        <h3 style={{ fontFamily: adminFonts.englishBody, fontSize: '17px', fontWeight: 700, color: colors.text, margin: '0 0 2px' }}>Always-on layers</h3>
        <p style={{ fontSize: '13px', color: colors.dim, margin: '0 0 10px' }}>
          Posts that show on top of the slideshow instead of taking turns in it. Banners and side notes never stop the slides; takeovers and “holds the screen” posts pause them while they show.
        </p>
        {layerCount === 0 && (
          <div style={{ padding: '14px', borderRadius: 'var(--r-md)', border: `1px dashed ${colors.border}`, fontSize: '14px', color: colors.dim }}>
            No banners, side notes or takeovers right now.{onNewMessage && can(caps, 'announcements.post') && <> <button type="button" onClick={onNewMessage} style={{ ...buttonSecondary, minHeight: '44px', marginLeft: '6px' }}>+ New message</button></>}
          </div>
        )}
        {LAYER_KINDS.filter((k) => layers[k].length).map((k) => (
          <div key={k} style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: colors.dim, margin: '0 0 6px' }}>{LAYER_LABEL[k]}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {layers[k].map((a) => {
                const ps = postStatus(a, now, { tz });
                const nm = String(primaryText(a) || '').split('\n')[0] || 'Message';
                const canToggle = canEditAnn && ps.key !== 'draft' && ps.key !== 'ended';
                return (
                  <div key={a.id} className="tt-row" data-testid="layer-row" data-kind={k} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px 6px 12px', minHeight: '60px',
                    background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 'var(--r-md)', opacity: a.enabled === false ? 0.7 : 1,
                  }}>
                    <button type="button" onClick={() => openPost(a)} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: '2px 0', textAlign: 'left', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
                      <span dir="auto" style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nm}</span>
                      <span style={{ display: 'flex', gap: '6px', marginTop: '2px', minWidth: 0, overflow: 'hidden' }}><PostStatusChip status={ps} /></span>
                    </button>
                    {canToggle && <ToggleSwitch on={a.enabled !== false} label={`${nm}: ${a.enabled !== false ? 'on, tap to turn off' : 'off, tap to turn on'}`} onChange={() => onToggleAnnouncement?.(a, a.enabled === false)} />}
                    <button type="button" style={iconBtn} onClick={() => openPost(a)} aria-label={`Open: ${nm}`} title="This post's options" data-testid="layer-pencil"><Pencil /></button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {canEdit && (
        <NewSlideFlow
          open={newOpen}
          onClose={() => setNewOpen(false)}
          slides={slides}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onNewMessage={onNewMessage}
          go={go}
          onEdit={(id) => setEditId(id)}
        />
      )}

      {canEdit && (
        <SlideEditSheet
          slide={editing}
          settings={settings}
          getSlides={() => slidesRef.current}
          onUpdate={onUpdate}
          onSaveSettings={onSaveSettings}
          onClose={() => setEditId(null)}
          go={go}
          announcementsById={annById}
          canDelete={canDelete && !!editing && editing.type !== 'ANNOUNCEMENT' && isDeletable(editing)}
          onDelete={() => setConfirmDelete(editing)}
        />
      )}

      <Sheet open={!!confirmMsg} onClose={() => setConfirmMsg(null)} title="Delete this message?" label="Delete message" zIndex={1250}>
        <p style={{ margin: '4px 0 16px', fontSize: '15px', color: colors.dim, lineHeight: 1.5 }}>
          It disappears from the screen. You can tap Undo straight after.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setConfirmMsg(null)} style={{ ...buttonSecondary, minHeight: '48px', padding: '0 20px' }} data-testid="message-delete-cancel">Cancel</button>
          <button type="button" data-testid="message-delete-confirm" onClick={() => { const a = confirmMsg; setConfirmMsg(null); onDeleteAnnouncement?.(a.id); }}
            style={{ minHeight: '48px', padding: '0 20px', borderRadius: 'var(--r-sm)', border: 'none', background: colors.danger, color: '#fff', fontWeight: 800, fontSize: '15px', fontFamily: adminFonts.englishBody, cursor: 'pointer' }}>Delete</button>
        </div>
      </Sheet>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete slide?"
          message={`"${title(confirmDelete)}" will be removed from the screen. This cannot be undone.`}
          confirmLabel="Delete slide"
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); setEditId(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
