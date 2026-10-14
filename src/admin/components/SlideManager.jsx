import React, { useState, useRef, useEffect } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import { NumberField, DraftTextInput, ConfirmDialog, ToggleSwitch } from './ui.jsx';
import useIsMobile from '../hooks/useIsMobile.js';
import { ZMANIM_DISPLAY } from '../../shared/constants.js';
import { DISPLAY_MODES as IMAGE_DISPLAY_MODES, EDGE_TREATMENTS } from './ImageUploader.jsx';
import { status as announcementStatus, primaryText, selectActive } from '../../shared/announcements.js';

const BUILT_IN_TYPES = ['ZMANIM', 'LIMUDIM', 'HAYOM_YOM', 'PIRKEI_AVOS', 'DAILY_QUOTE', 'PARSHA_TIDBITS', 'SCHEDULE', 'MIVTZAH_LEADERBOARD', 'MIVTZAH_LIVE_EMBED'];

const BUILT_IN_LABELS = {
  ZMANIM: 'Zmanim',
  LIMUDIM: 'Limudim',
  HAYOM_YOM: 'Hayom Yom',
  PIRKEI_AVOS: 'Pirkei Avos',
  DAILY_QUOTE: 'Daily Quote',
  PARSHA_TIDBITS: 'Parsha Tidbits',
  SCHEDULE: 'Schedule / Seder',
  RSS_SLIDE: 'RSS Feed',
  MIVTZAH_LEADERBOARD: 'Mivtzah Leaderboard',
  MIVTZAH_LIVE_EMBED: 'Mivtzah Live Screen (embed)',
};

const LIMUDIM_ITEMS = [
  { key: 'chumash',   label: 'Chumash' },
  { key: 'tehillim',  label: 'Tehillim' },
  { key: 'tanya',     label: 'Tanya' },
  { key: 'rambam1',   label: 'Rambam — 1 Chapter' },
  { key: 'rambam3',   label: 'Rambam — 3 Chapters' },
  { key: 'sefer',     label: 'Sefer HaMitzvot' },
];

export default function SlideManager({ slides = [], onUpdate, onCreate, onDelete, settings = {}, onSaveSettings, onNavigate, announcements = [], onNewMessage, onEditAnnouncement, onToggleAnnouncement }) {
  const isMobile = useIsMobile();
  const [showCreate, setShowCreate] = useState(false);
  const [zmanimExpanded, setZmanimExpanded] = useState(null); // slide index or null
  const [limudimExpanded, setLimudimExpanded] = useState(null); // slide index or null
  const [embedExpanded, setEmbedExpanded] = useState(null); // slide index or null
  const [embedUrlDraft, setEmbedUrlDraft] = useState('');
  const [imageExpanded, setImageExpanded] = useState(null); // slide index or null
  const [confirmDelete, setConfirmDelete] = useState(null); // slide object or null
  // Drag state. Rows are only made draggable while the mouse is down on the
  // grab handle — otherwise HTML5 drag hijacks text selection inside the
  // label/duration inputs (you couldn't select text with the mouse at all).
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const annById = new Map(announcements.map(a => [a.id, a]));
  const tz = settings?.location?.timezone || undefined;
  const STATUS_TEXT = { draft: 'Draft', scheduled: 'Scheduled', paused: 'Paused', archived: 'Ended' };
  // Slide announcements without a row here are appended after these slides.
  const referenced = new Set(slides.filter(s => s.type === 'ANNOUNCEMENT').map(s => s.announcementId));
  const appended = selectActive(announcements, new Date(), { tz }).slides.filter(a => !referenced.has(a.id));
  // "+ New Slide" picker: Message opens the announcement composer; media/RSS
  // sources live in their own tabs.
  const newMenuRef = useRef(null);
  useEffect(() => {
    if (!showCreate) return undefined;
    const close = (e) => { if (!newMenuRef.current?.contains(e.target)) setShowCreate(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [showCreate]);

  const handleToggle = (index) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    );
    onUpdate(updated);
  };

  const handleDuration = (index, dur) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, duration: dur } : s
    );
    onUpdate(updated);
  };

  const handleLabel = (index, label) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, label: label || undefined } : s
    );
    onUpdate(updated);
  };

  const handleEmbedUrl = (index, url) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, embedUrl: url.trim() || undefined } : s
    );
    onUpdate(updated);
  };

  const handleMoveUp = (index) => {
    if (index <= 0) return;
    const reordered = [...slides];
    [reordered[index - 1], reordered[index]] = [reordered[index], reordered[index - 1]];
    onUpdate(reordered);
  };

  const handleMoveDown = (index) => {
    if (index >= slides.length - 1) return;
    const reordered = [...slides];
    [reordered[index], reordered[index + 1]] = [reordered[index + 1], reordered[index]];
    onUpdate(reordered);
  };

  const handleDragEnd = () => {
    const from = dragIdx;
    const to = dragOverIdx;
    setDragIdx(null);
    setDragOverIdx(null);
    if (from === null || to === null || from === to) return;
    const reordered = [...slides];
    const [removed] = reordered.splice(from, 1);
    reordered.splice(to, 0, removed);
    onUpdate(reordered);
  };

  const getLabel = (slide) => {
    if (BUILT_IN_TYPES.includes(slide.type)) return BUILT_IN_LABELS[slide.type] || slide.type;
    if (slide.type === 'VIDEO_SLIDE') return slide.label || 'Video';
    if (slide.type === 'IMAGE_SLIDE') return slide.label || 'Image';
    if (slide.type === 'GOOGLE_PHOTOS_SLIDE') return slide.label || 'Google Photos';
    if (slide.type === 'RSS_SLIDE') return slide.label || 'RSS Feed';
    if (slide.type === 'ANNOUNCEMENT') {
      const a = annById.get(slide.announcementId);
      return a ? (primaryText(a).split('\n')[0] || 'Message') : 'Message (deleted)';
    }
    return slide.titleEn || slide.titleHe || slide.template || 'Custom';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', gap: '16px' }}>
        <div>
          <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold }}>
            Slides
          </h2>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginTop: '4px' }}>
            Toggle slides on/off, reorder them, and set how long each one shows. Built-in slides (Zmanim, Limudim, etc.) pull live data automatically.
          </p>
        </div>
        <div ref={newMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={{ ...buttonPrimary, minHeight: '44px' }}
            aria-haspopup="menu"
            aria-expanded={showCreate}
            onClick={() => setShowCreate(!showCreate)}
          >
            + New Slide
          </button>
          {showCreate && (
            <div role="menu" className="tt-card" style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, minWidth: '230px',
              background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '8px', padding: '6px',
              boxShadow: '0 12px 40px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column',
            }}>
              {[
                { label: 'Message', sub: 'Text, event, list or time — opens the composer', go: () => onNewMessage?.() },
                { label: 'Image or video', sub: 'Upload in Media', go: () => onNavigate?.('images') },
                { label: 'Google Photos album', sub: 'In Media', go: () => onNavigate?.('images') },
                { label: 'RSS feed', sub: 'In RSS Feeds', go: () => onNavigate?.('rss-feeds') },
              ].map(o => (
                <button key={o.label} role="menuitem" type="button"
                  onClick={() => { setShowCreate(false); o.go(); }}
                  style={{ textAlign: 'left', background: 'transparent', border: 'none', borderRadius: '6px', padding: '10px 12px', minHeight: '48px', cursor: 'pointer' }}>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '15px', color: colors.text }}>{o.label}</div>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>{o.sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {slides.map((slide, idx) => (
          <div
            key={slide.id || idx}
            className="tt-row"
            // Only draggable while the grab handle is held down — see dragIdx note above.
            draggable={!isMobile && dragIdx === idx}
            onDragEnter={!isMobile && dragIdx !== null ? () => setDragOverIdx(idx) : undefined}
            onDragEnd={!isMobile ? handleDragEnd : undefined}
            onDragOver={!isMobile ? (e) => e.preventDefault() : undefined}
            onMouseUp={!isMobile ? () => setDragIdx(null) : undefined}
            style={{
              padding: isMobile ? '10px 12px' : '10px 14px',
              background: colors.surface,
              borderRadius: '6px',
              opacity: dragIdx === idx ? 0.45 : 1,
              boxShadow: dragIdx !== null && dragOverIdx === idx && dragIdx !== idx
                ? `inset 0 ${dragIdx < idx ? '-2px' : '2px'} 0 0 ${colors.gold}`
                : 'none',
              transition: 'box-shadow .1s, opacity .15s',
            }}
          >
            {/* Row 1: toggle, label, reorder/delete */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '12px',
            }}>
              {!isMobile && (
                <span
                  title="Drag to reorder"
                  onMouseDown={() => setDragIdx(idx)}
                  style={{ color: colors.muted, fontSize: '18px', cursor: 'grab', userSelect: 'none', padding: '0 2px' }}
                >
                  {'\u2261'}
                </span>
              )}
              {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    aria-label="Move slide up"
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                      color: idx === 0 ? colors.muted : colors.dim, fontSize: '15px', padding: '0', lineHeight: 1,
                      opacity: idx === 0 ? 0.3 : 1, minWidth: '44px', minHeight: '40px',
                    }}
                  >{'\u25B2'}</button>
                  <button
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === slides.length - 1}
                    aria-label="Move slide down"
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === slides.length - 1 ? 'default' : 'pointer',
                      color: idx === slides.length - 1 ? colors.muted : colors.dim, fontSize: '15px', padding: '0', lineHeight: 1,
                      opacity: idx === slides.length - 1 ? 0.3 : 1, minWidth: '44px', minHeight: '40px',
                    }}
                  >{'\u25BC'}</button>
                </div>
              )}
              {slide.type === 'ANNOUNCEMENT' ? (() => {
                const a = annById.get(slide.announcementId);
                return (
                  <ToggleSwitch
                    on={!!a && a.enabled !== false}
                    label={a?.enabled !== false ? 'Showing — click to pause this message' : 'Paused — click to resume'}
                    onChange={() => a && onToggleAnnouncement?.(a, a.enabled === false)}
                  />
                );
              })() : (
                <ToggleSwitch on={slide.enabled !== false} onChange={() => handleToggle(idx)} />
              )}
              <span style={{
                flex: 1,
                fontFamily: adminFonts.englishBody,
                fontSize: '14px',
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {getLabel(slide)}
              </span>
              {slide.type === 'MIVTZAH_LIVE_EMBED' && !slide.embedUrl && (
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '3px',
                  fontFamily: adminFonts.englishBody,
                  fontSize: '11px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  background: colors.dangerBg,
                  color: colors.danger,
                }}>
                  Not configured — not streaming
                </span>
              )}
              {slide.type === 'ANNOUNCEMENT' && (() => {
                const a = annById.get(slide.announcementId);
                const st = a ? announcementStatus(a, new Date(), { tz }) : null;
                return (
                  <>
                    {st && st !== 'live' && (
                      <span style={{ padding: '2px 8px', borderRadius: '3px', fontFamily: adminFonts.englishBody, fontSize: '11px', whiteSpace: 'nowrap', flexShrink: 0, background: colors.surface, color: colors.dim }}>
                        {STATUS_TEXT[st] || st}
                      </span>
                    )}
                    {a && (
                      <button
                        onClick={() => onEditAnnouncement?.(a)}
                        title="Edit this message"
                        style={{
                          background: 'transparent', border: `1px solid ${colors.muted}`, borderRadius: '4px', color: colors.dim,
                          fontSize: '13px', cursor: 'pointer', padding: isMobile ? '6px 14px' : '3px 10px',
                          minHeight: isMobile ? '44px' : '28px', fontFamily: adminFonts.englishBody,
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </>
                );
              })()}
              {!isMobile && slide.type !== 'ANNOUNCEMENT' && (
                <>
                  <DraftTextInput
                    value={slide.label || ''}
                    onCommit={(v) => handleLabel(idx, v)}
                    placeholder={BUILT_IN_LABELS[slide.type] || 'Label'}
                    title="Custom display label shown on screen (leave blank to use default)"
                    style={{ width: '100px', padding: '5px 8px', fontSize: '12px' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <NumberField
                      value={slide.duration || 0}
                      onCommit={(v) => handleDuration(idx, v)}
                      min={1}
                      max={600}
                      title="How many seconds this slide stays on screen"
                      style={{ width: '52px', textAlign: 'center', padding: '5px 4px' }}
                    />
                    <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted }}>s</span>
                  </div>
                  {(slide.type === 'IMAGE_SLIDE' || slide.type === 'VIDEO_SLIDE' || slide.type === 'GOOGLE_PHOTOS_SLIDE' || slide.type === 'MIVTZAH_LIVE_EMBED') && (
                    <label title="Fullscreen — hides the clock/date panel and shows the media edge-to-edge" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={slide.fullscreen || false}
                        onChange={() => {
                          const updated = slides.map((s, j) =>
                            j === idx ? { ...s, fullscreen: !s.fullscreen } : s
                          );
                          onUpdate(updated);
                        }}
                        style={{ accentColor: colors.gold }}
                      />
                      <span style={{
                        fontFamily: adminFonts.englishBody,
                        fontSize: '11px',
                        color: colors.dim,
                        marginLeft: '4px',
                      }}>
                        Fullscreen
                      </span>
                    </label>
                  )}
                </>
              )}
              {slide.type === 'MIVTZAH_LIVE_EMBED' && (
                <button
                  onClick={() => {
                    const opening = embedExpanded !== idx;
                    setEmbedExpanded(opening ? idx : null);
                    if (opening) setEmbedUrlDraft(slide.embedUrl || '');
                  }}
                  title="Configure the Live Screen embed URL"
                  style={{
                    background: embedExpanded === idx ? colors.goldBg : 'transparent',
                    border: `1px solid ${embedExpanded === idx ? colors.gold : colors.muted}`,
                    borderRadius: '4px',
                    color: embedExpanded === idx ? colors.gold : colors.dim,
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: isMobile ? '6px 14px' : '3px 10px',
                    minHeight: isMobile ? '44px' : '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  {embedExpanded === idx ? 'Close' : 'Edit'}
                </button>
              )}
              {slide.type === 'IMAGE_SLIDE' && (
                <button
                  onClick={() => setImageExpanded(imageExpanded === idx ? null : idx)}
                  title="How the image fits the screen"
                  aria-expanded={imageExpanded === idx}
                  style={{
                    background: imageExpanded === idx ? colors.goldBg : 'transparent',
                    border: `1px solid ${imageExpanded === idx ? colors.gold : colors.muted}`,
                    borderRadius: '4px',
                    color: imageExpanded === idx ? colors.gold : colors.dim,
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: isMobile ? '6px 14px' : '3px 10px',
                    minHeight: isMobile ? '44px' : '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  {imageExpanded === idx ? 'Close' : 'Edit'}
                </button>
              )}
              {slide.type === 'ZMANIM' && onSaveSettings && (
                <button
                  onClick={() => setZmanimExpanded(zmanimExpanded === idx ? null : idx)}
                  title="Configure visible zmanim"
                  style={{
                    background: zmanimExpanded === idx ? colors.goldBg : 'transparent',
                    border: `1px solid ${zmanimExpanded === idx ? colors.gold : colors.muted}`,
                    borderRadius: '4px',
                    color: zmanimExpanded === idx ? colors.gold : colors.dim,
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: isMobile ? '6px 14px' : '3px 10px',
                    minHeight: isMobile ? '44px' : '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  {zmanimExpanded === idx ? 'Close' : 'Edit'}
                </button>
              )}
              {slide.type === 'LIMUDIM' && onSaveSettings && (
                <button
                  onClick={() => setLimudimExpanded(limudimExpanded === idx ? null : idx)}
                  title="Configure Daily Study display"
                  style={{
                    background: limudimExpanded === idx ? colors.goldBg : 'transparent',
                    border: `1px solid ${limudimExpanded === idx ? colors.gold : colors.muted}`,
                    borderRadius: '4px',
                    color: limudimExpanded === idx ? colors.gold : colors.dim,
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: isMobile ? '6px 14px' : '3px 10px',
                    minHeight: isMobile ? '44px' : '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  {limudimExpanded === idx ? 'Close' : 'Edit'}
                </button>
              )}
              {slide.type === 'SCHEDULE' && onNavigate && (
                <button
                  onClick={() => onNavigate('schedule')}
                  title="Edit schedule"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${colors.muted}`,
                    borderRadius: '4px',
                    color: colors.dim,
                    fontSize: '13px',
                    cursor: 'pointer',
                    padding: isMobile ? '6px 14px' : '3px 10px',
                    minHeight: isMobile ? '44px' : '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  Edit
                </button>
              )}
              {!BUILT_IN_TYPES.includes(slide.type) && (
                <button
                  onClick={() => setConfirmDelete(slide)}
                  title="Delete this slide"
                  aria-label={`Delete slide ${getLabel(slide)}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.danger,
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '0 4px',
                    minWidth: isMobile ? '44px' : '32px',
                    minHeight: isMobile ? '44px' : '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {'\u00D7'}
                </button>
              )}
            </div>

            {/* Zmanim visibility panel */}
            {slide.type === 'ZMANIM' && zmanimExpanded === idx && onSaveSettings && (
              <div style={{
                marginTop: '12px',
                padding: '14px',
                background: colors.bg,
                borderRadius: '4px',
                border: `1px solid ${colors.muted}`,
              }}>
                <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '10px' }}>
                  Choose which zmanim to display. All shown by default.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {ZMANIM_DISPLAY.map(z => {
                    const visible = settings.zmanimVisible;
                    const isChecked = !visible || visible.length === 0 || visible.includes(z.k);
                    return (
                      <label key={z.k} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const current = settings.zmanimVisible?.length > 0
                              ? settings.zmanimVisible
                              : ZMANIM_DISPLAY.map(x => x.k);
                            const next = e.target.checked
                              ? [...current, z.k]
                              : current.filter(k => k !== z.k);
                            const allKeys = ZMANIM_DISPLAY.map(x => x.k);
                            onSaveSettings({ zmanimVisible: next.length === allKeys.length ? [] : next });
                          }}
                          style={{ accentColor: colors.gold, width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.text, flex: 1 }}>
                          {z.en}
                        </span>
                        <span style={{ fontFamily: adminFonts.hebrewDisplay || adminFonts.englishBody, fontSize: '14px', color: colors.dim }}>
                          {z.he}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LIMUDIM config panel */}
            {slide.type === 'LIMUDIM' && limudimExpanded === idx && onSaveSettings && (
              <div style={{
                marginTop: '12px',
                padding: '14px',
                background: colors.bg,
                borderRadius: '4px',
                border: `1px solid ${colors.muted}`,
              }}>
                {/* Language */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '8px' }}>Language</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { v: 'both', l: 'Both' },
                      { v: 'hebrew', l: 'Hebrew Only' },
                      { v: 'english', l: 'English Only' },
                    ].map(opt => {
                      const active = (settings.limudimLang || 'both') === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => onSaveSettings({ limudimLang: opt.v })}
                          style={{
                            background: active ? colors.goldBg : 'transparent',
                            border: `1px solid ${active ? colors.gold : colors.muted}`,
                            borderRadius: '4px',
                            color: active ? colors.gold : colors.dim,
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: '4px 10px',
                            fontFamily: adminFonts.englishBody,
                          }}
                        >
                          {opt.l}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Items */}
                <div>
                  <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '8px' }}>Items to Show</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    {LIMUDIM_ITEMS.map(item => {
                      const checked = (settings.limudimItems?.[item.key]) !== false;
                      return (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const next = { ...(settings.limudimItems || {}), [item.key]: e.target.checked };
                              onSaveSettings({ limudimItems: next });
                            }}
                            style={{ accentColor: colors.gold, width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.text }}>
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Image fit / edge panel */}
            {slide.type === 'IMAGE_SLIDE' && imageExpanded === idx && (
              <div style={{ marginTop: '12px', padding: '14px', background: colors.bg, borderRadius: '4px', border: `1px solid ${colors.muted}`, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 180px' }}>
                  <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '4px' }}>Display mode</span>
                  <select
                    value={slide.displayMode || 'fit'}
                    onChange={(e) => onUpdate(slides.map((s, j) => j === idx ? { ...s, displayMode: e.target.value } : s))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {IMAGE_DISPLAY_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                {(slide.displayMode || 'fit') === 'fit' && (
                  <label style={{ flex: '1 1 180px' }}>
                    <span style={{ display: 'block', fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '4px' }}>Around the image</span>
                    <select
                      value={slide.edgeTreatment || 'blur'}
                      onChange={(e) => onUpdate(slides.map((s, j) => j === idx ? { ...s, edgeTreatment: e.target.value } : s))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {EDGE_TREATMENTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* Mivtzah Live Embed config panel */}
            {slide.type === 'MIVTZAH_LIVE_EMBED' && embedExpanded === idx && (
              <div style={{
                marginTop: '12px',
                padding: '14px',
                background: colors.bg,
                borderRadius: '4px',
                border: `1px solid ${colors.muted}`,
              }}>
                <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '10px' }}>
                  Paste the public URL of the mivtzah-app "Live Screen" page (the Vercel-hosted embeddable view).
                  This slide shows that page full-bleed in an iframe — any visual changes happen on the mivtzah-app side, no updates needed here.
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <input
                    type="url"
                    value={embedUrlDraft}
                    onChange={(e) => setEmbedUrlDraft(e.target.value)}
                    placeholder="https://your-mivtzah-app.vercel.app/live"
                    style={{ ...inputStyle, flex: 1, minWidth: '220px' }}
                  />
                  <button
                    style={{ ...buttonPrimary, minHeight: '38px' }}
                    onClick={() => handleEmbedUrl(idx, embedUrlDraft)}
                  >
                    Save
                  </button>
                </div>
                {slide.embedUrl && (
                  <div style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.muted,
                    marginTop: '8px',
                    direction: 'ltr',
                    overflowWrap: 'anywhere',
                  }}>
                    Current: {slide.embedUrl}
                  </div>
                )}
              </div>
            )}

            {/* Row 2 (mobile only): label, duration, fullscreen controls */}
            {isMobile && slide.type !== 'ANNOUNCEMENT' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                paddingLeft: '28px',
                flexWrap: 'wrap',
              }}>
                <DraftTextInput
                  value={slide.label || ''}
                  onCommit={(v) => handleLabel(idx, v)}
                  placeholder={BUILT_IN_LABELS[slide.type] || 'Label'}
                  title="Custom label"
                  style={{ flex: 1, minWidth: '80px', padding: '6px 8px', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <NumberField
                    value={slide.duration || 0}
                    onCommit={(v) => handleDuration(idx, v)}
                    min={1}
                    max={600}
                    title="Seconds on screen"
                    style={{ width: '56px', textAlign: 'center', padding: '6px 4px', fontSize: '13px' }}
                  />
                  <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted }}>s</span>
                </div>
                {(slide.type === 'IMAGE_SLIDE' || slide.type === 'VIDEO_SLIDE' || slide.type === 'GOOGLE_PHOTOS_SLIDE' || slide.type === 'MIVTZAH_LIVE_EMBED') && (
                  <label title="Fullscreen" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0, minHeight: '36px' }}>
                    <input
                      type="checkbox"
                      checked={slide.fullscreen || false}
                      onChange={() => {
                        const updated = slides.map((s, j) =>
                          j === idx ? { ...s, fullscreen: !s.fullscreen } : s
                        );
                        onUpdate(updated);
                      }}
                      style={{ accentColor: colors.gold }}
                    />
                    <span style={{
                      fontFamily: adminFonts.englishBody,
                      fontSize: '12px',
                      color: colors.dim,
                      marginLeft: '4px',
                    }}>
                      Full
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {appended.length > 0 && (
        <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '6px', border: `1px dashed ${colors.border}` }}>
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginBottom: '6px' }}>
            Also in the rotation, after these slides (from Announcements):
          </div>
          {appended.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
              <span dir="auto" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.text }}>
                {primaryText(a).split('\n')[0] || 'Message'}
              </span>
              <button onClick={() => onEditAnnouncement?.(a)} style={{ ...buttonSecondary, padding: '4px 12px', minHeight: isMobile ? '38px' : '30px', fontSize: '13px' }}>Edit</button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete slide?"
          message={confirmDelete.type === 'ANNOUNCEMENT'
            ? `"${getLabel(confirmDelete)}" will be removed from the screen and deleted from Announcements. This cannot be undone.`
            : `"${getLabel(confirmDelete)}" will be removed from the screen. This cannot be undone.`}
          confirmLabel="Delete Slide"
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
