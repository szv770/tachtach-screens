import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { ToggleSwitch, ConfirmDialog } from './ui.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { status as announcementStatus, selectActive, primaryText } from '../../shared/announcements.js';
import { can } from '../../shared/permissions.js';
import { notify } from '../hooks/useAdminState.js';
import Icon from './ui/Icon.jsx';
import NewSlideFlow from './slides/NewSlideFlow.jsx';
import SlideEditSheet from './slides/SlideEditSheet.jsx';
import { SLIDE_OPEN_EVENT, takeSlideOpen } from './slides/openRequest.js';
import { slideTitle, isDeletable, isEmbedType, typeInfo } from './slides/slideTypes.js';
import Sheet from './ui/Sheet.jsx';

const STATUS_TEXT = { draft: 'Draft', scheduled: 'Scheduled', paused: 'Paused', archived: 'Ended' };

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
  announcements = [], onNewMessage, onEditAnnouncement, onToggleAnnouncement, onDeleteAnnouncement, caps = [],
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
  const annById = new Map(announcements.map((a) => [a.id, a]));
  const tz = settings?.location?.timezone || undefined;
  const referenced = new Set(slides.filter((s) => s.type === 'ANNOUNCEMENT').map((s) => s.announcementId));
  const appended = selectActive(announcements, new Date(), { tz }).slides.filter((a) => !referenced.has(a.id));
  const title = (s) => slideTitle(s, { announcementsById: annById });

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

  const move = (from, to) => {
    if (to < 0 || to >= slides.length || from === to) return;
    const next = [...slides];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onUpdate(next);
  };
  const dragEnd = () => {
    const from = dragIdx; const to = dragOverIdx;
    setDragIdx(null); setDragOverIdx(null);
    if (from !== null && to !== null) move(from, to);
  };

  // The pencil: most slides open their popup; Photos, News feed, Web page, Schedule and Daily Word live on their own page.
  const openEdit = (slide) => {
    const g = typeInfo(slide.type)?.editGo;
    if (g) go(g.section, g.tab ? { tab: g.tab } : undefined); else setEditId(slide.id);
  };

  // Requests from search: open "New slide" or one slide's popup (the first slide of that type).
  useEffect(() => {
    const run = (req) => {
      if (!req || !canEdit) return;
      if (req.kind === 'new') setNewOpen(true);
      else if (req.kind === 'edit') {
        const g = typeInfo(req.type)?.editGo;
        if (g) { go(g.section, g.tab ? { tab: g.tab } : undefined); return; }
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
    if (s.type === 'ANNOUNCEMENT') {
      const a = annById.get(s.announcementId);
      const st = a ? announcementStatus(a, new Date(), { tz }) : null;
      bits.push('Message');
      if (st && st !== 'live') bits.push(STATUS_TEXT[st] || st);
    } else {
      if (s.duration) bits.push(`${s.duration} s`);
      if (s.fullscreen) bits.push('Fullscreen');
    }
    return bits.join(' · ');
  };

  return (
    <div style={{ fontFamily: adminFonts.englishBody }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, margin: 0 }}>Slides</h2>
          <p style={{ fontSize: '13px', color: colors.dim, margin: '4px 0 0' }}>
            {canEdit
              ? 'Turn slides on or off, put them in order, and tap the pencil for a slide\'s own options.'
              : 'What plays on the screen, in order. You can look but not change the slides.'}
          </p>
        </div>
        {canEdit && (
          <button type="button" style={{ ...buttonPrimary, minHeight: '44px' }} onClick={() => setNewOpen(true)} data-testid="new-slide-btn">+ New slide</button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {slides.map((slide, idx) => {
          const isAnn = slide.type === 'ANNOUNCEMENT';
          const ann = isAnn ? annById.get(slide.announcementId) : null;
          const on = isAnn ? !!ann && ann.enabled !== false : slide.enabled !== false;
          const needsSetup = isEmbedType(slide.type) && !slide.embedUrl;
          const sub = subtitle(slide);
          return (
            <div
              key={slide.id || idx}
              className="tt-row"
              data-testid="slide-row"
              draggable={canEdit && !isMobile && dragIdx === idx}
              onDragEnter={canEdit && !isMobile && dragIdx !== null ? () => setDragOverIdx(idx) : undefined}
              onDragEnd={canEdit && !isMobile ? dragEnd : undefined}
              onDragOver={canEdit && !isMobile ? (e) => e.preventDefault() : undefined}
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
                  {[['up', -1, '▲', 'Move slide up', idx === 0], ['down', 1, '▼', 'Move slide down', idx === slides.length - 1]].map(([k, d, ch, lab, dis]) => (
                    <button key={k} type="button" onClick={() => move(idx, idx + d)} disabled={dis} aria-label={`${lab}: ${title(slide)}`}
                      style={{ background: 'transparent', border: 'none', color: colors.dim, fontSize: '13px', lineHeight: 1, width: 36, height: 28, opacity: dis ? 0.25 : 1, cursor: dis ? 'default' : 'pointer', padding: 0 }}>{ch}</button>
                  ))}
                </div>
              ))}

              <div style={{ flex: 1, minWidth: 0, padding: '2px 0' }}>
                <div dir="auto" style={{ fontSize: '15px', fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title(slide)}</div>
                {(sub || needsSetup) && (
                  <div style={{ fontSize: '12px', color: needsSetup ? colors.danger : colors.dim, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {needsSetup ? 'Needs a web address' : sub}
                  </div>
                )}
              </div>

              {(isAnn ? canEditAnn : canEdit) ? (
                <ToggleSwitch
                  on={on}
                  label={`${title(slide)}: ${on ? 'on, tap to turn off' : 'off, tap to turn on'}`}
                  onChange={() => (isAnn ? ann && onToggleAnnouncement?.(ann, ann.enabled === false) : toggle(slide.id))}
                />
              ) : (
                <span style={{ fontSize: '12px', fontWeight: 700, color: on ? colors.accent : colors.dim, padding: '0 6px' }}>{on ? 'On' : 'Off'}</span>
              )}

              {isAnn
                ? (ann && canEditAnn && (
                  <button type="button" style={iconBtn} onClick={() => onEditAnnouncement?.(ann)} aria-label={`Edit message: ${title(slide)}`} title="Edit this message" data-testid="slide-pencil"><Pencil /></button>
                ))
                : !canEdit && canDelete && isDeletable(slide)
                  ? <button type="button" style={{ ...iconBtn, color: colors.danger }} onClick={() => setConfirmDelete(slide)} aria-label={`Delete ${title(slide)}`} title="Delete this slide" data-testid="slide-delete-inline">{'\u00D7'}</button>
                  : (canEdit && (
                  <button type="button" style={iconBtn} onClick={() => openEdit(slide)} aria-label={`Edit ${title(slide)}`} title={typeInfo(slide.type)?.editGo ? 'Open its page' : "This slide's options"} data-testid="slide-pencil"><Pencil /></button>
                ))}
              {isAnn && ann && canDeleteAnn && (
                <button type="button" style={{ ...iconBtn, color: colors.danger }} onClick={() => setConfirmMsg(ann)} aria-label={`Delete message: ${title(slide)}`} title="Delete this message" data-testid="message-delete">{'\u00D7'}</button>
              )}
            </div>
          );
        })}
        {slides.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: colors.dim, fontSize: '14px' }}>No slides yet.{canEdit && ' Tap "+ New slide".'}</div>}
      </div>

      {appended.length > 0 && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--r-md)', border: `1px dashed ${colors.border}` }}>
          <div style={{ fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>Also in the rotation, after these slides (from Announcements):</div>
          {appended.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
              <span dir="auto" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', color: colors.text }}>
                {primaryText(a).split('\n')[0] || 'Message'}
              </span>
              {canEditAnn && <button type="button" onClick={() => onEditAnnouncement?.(a)} style={{ ...buttonSecondary, padding: '4px 12px', minHeight: '44px', fontSize: '13px' }}>Edit</button>}
            </div>
          ))}
        </div>
      )}

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
