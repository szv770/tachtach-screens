import React, { useState, useRef } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { ZMANIM_DISPLAY } from '../../shared/constants.js';

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

const TEMPLATES = [
  { value: 'headline', label: 'Headline' },
  { value: 'quote', label: 'Quote' },
  { value: 'info', label: 'Info' },
  { value: 'announcement', label: 'Announcement' },
];

const SLIDE_STYLES = [
  { value: '', label: 'None', desc: 'Use template layout' },
  { value: 'classic', label: 'Classic', desc: 'Clean, minimal' },
  { value: 'grand', label: 'Grand', desc: 'Gold shimmer, elegant' },
  { value: 'emergency', label: 'Emergency', desc: 'Red alert' },
  { value: 'sleek', label: 'Sleek', desc: 'Modern minimal' },
  { value: 'celebration', label: 'Celebration', desc: 'Confetti, joyful' },
  { value: 'urgent', label: 'Notice', desc: 'Amber attention' },
];

function ToggleSwitch({ on, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: '10px',
        background: on ? colors.gold : colors.muted,
        position: 'relative', cursor: 'pointer',
        transition: 'background .2s', flexShrink: 0,
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '8px',
        background: colors.bg, position: 'absolute',
        top: 2, left: on ? 18 : 2, transition: 'left .2s',
      }} />
    </div>
  );
}

const LIMUDIM_ITEMS = [
  { key: 'chumash',   label: 'Chumash' },
  { key: 'tehillim',  label: 'Tehillim' },
  { key: 'tanya',     label: 'Tanya' },
  { key: 'rambam1',   label: 'Rambam — 1 Chapter' },
  { key: 'rambam3',   label: 'Rambam — 3 Chapters' },
  { key: 'sefer',     label: 'Sefer HaMitzvot' },
];

export default function SlideManager({ slides = [], onUpdate, onCreate, onDelete, settings = {}, onSaveSettings, onNavigate }) {
  const isMobile = useIsMobile();
  const [showCreate, setShowCreate] = useState(false);
  const [zmanimExpanded, setZmanimExpanded] = useState(null); // slide index or null
  const [limudimExpanded, setLimudimExpanded] = useState(null); // slide index or null
  const [embedExpanded, setEmbedExpanded] = useState(null); // slide index or null
  const [embedUrlDraft, setEmbedUrlDraft] = useState('');
  const [form, setForm] = useState({
    template: 'headline', titleEn: '', titleHe: '', bodyEn: '', bodyHe: '', attribution: '', duration: 12, style: '', subtitle: '',
  });
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  const handleToggle = (index) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, enabled: !s.enabled } : s
    );
    onUpdate(updated);
  };

  const handleDuration = (index, dur) => {
    const updated = slides.map((s, i) =>
      i === index ? { ...s, duration: Number(dur) || 0 } : s
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

  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const reordered = [...slides];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, removed);
    dragItem.current = null;
    dragOver.current = null;
    onUpdate(reordered);
  };

  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await onCreate({
        type: 'custom',
        enabled: true,
        template: form.style ? undefined : form.template,
        titleHe: form.titleHe || undefined,
        titleEn: form.titleEn || undefined,
        bodyHe: form.bodyHe || undefined,
        bodyEn: form.bodyEn || undefined,
        attribution: form.attribution || undefined,
        duration: form.duration,
        style: form.style || undefined,
        subtitle: form.subtitle || undefined,
      });
      if (result) {
        setForm({ template: 'headline', titleEn: '', titleHe: '', bodyEn: '', bodyHe: '', attribution: '', duration: 12, style: '', subtitle: '' });
        setShowCreate(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const getLabel = (slide) => {
    if (BUILT_IN_TYPES.includes(slide.type)) return BUILT_IN_LABELS[slide.type] || slide.type;
    if (slide.type === 'VIDEO_SLIDE') return slide.label || 'Video';
    if (slide.type === 'IMAGE_SLIDE') return slide.label || 'Image';
    if (slide.type === 'GOOGLE_PHOTOS_SLIDE') return slide.label || 'Google Photos';
    if (slide.type === 'RSS_SLIDE') return slide.label || 'RSS Feed';
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
        <button style={{ ...buttonPrimary, flexShrink: 0 }} onClick={() => setShowCreate(!showCreate)}>
          + New Slide
        </button>
      </div>

      {/* Slide list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {slides.map((slide, idx) => (
          <div
            key={slide.id || idx}
            draggable={!isMobile}
            onDragStart={!isMobile ? () => handleDragStart(idx) : undefined}
            onDragEnter={!isMobile ? () => handleDragEnter(idx) : undefined}
            onDragEnd={!isMobile ? handleDragEnd : undefined}
            onDragOver={!isMobile ? (e) => e.preventDefault() : undefined}
            style={{
              padding: isMobile ? '10px 12px' : '10px 14px',
              background: colors.surface,
              borderRadius: '4px',
              cursor: isMobile ? 'default' : 'grab',
            }}
          >
            {/* Row 1: toggle, label, reorder/delete */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '12px',
            }}>
              {!isMobile && (
                <span style={{ color: colors.muted, fontSize: '18px', cursor: 'grab', userSelect: 'none' }}>
                  {'\u2261'}
                </span>
              )}
              {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                      color: idx === 0 ? colors.muted : colors.dim, fontSize: '14px', padding: '0', lineHeight: 1,
                      opacity: idx === 0 ? 0.3 : 1, minWidth: '20px', minHeight: '20px',
                    }}
                  >{'\u25B2'}</button>
                  <button
                    onClick={() => handleMoveDown(idx)}
                    disabled={idx === slides.length - 1}
                    style={{
                      background: 'transparent', border: 'none', cursor: idx === slides.length - 1 ? 'default' : 'pointer',
                      color: idx === slides.length - 1 ? colors.muted : colors.dim, fontSize: '14px', padding: '0', lineHeight: 1,
                      opacity: idx === slides.length - 1 ? 0.3 : 1, minWidth: '20px', minHeight: '20px',
                    }}
                  >{'\u25BC'}</button>
                </div>
              )}
              <ToggleSwitch on={slide.enabled !== false} onChange={() => handleToggle(idx)} />
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
              {!isMobile && (
                <>
                  <input
                    type="text"
                    value={slide.label || ''}
                    onChange={(e) => handleLabel(idx, e.target.value)}
                    placeholder={BUILT_IN_LABELS[slide.type] || 'Label'}
                    title="Custom display label shown on screen (leave blank to use default)"
                    style={{ ...inputStyle, width: '90px', padding: '4px 6px', fontSize: '12px' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <input
                      type="number"
                      value={slide.duration || 0}
                      onChange={(e) => handleDuration(idx, e.target.value)}
                      title="How many seconds this slide stays on screen"
                      style={{ ...inputStyle, width: '52px', textAlign: 'center', padding: '4px' }}
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
                    padding: '3px 10px',
                    minHeight: '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  {embedExpanded === idx ? 'Close' : 'Edit'}
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
                    padding: '3px 10px',
                    minHeight: '28px',
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
                    padding: '3px 10px',
                    minHeight: '28px',
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
                    padding: '3px 10px',
                    minHeight: '28px',
                    fontFamily: adminFonts.englishBody,
                  }}
                >
                  Edit
                </button>
              )}
              {!BUILT_IN_TYPES.includes(slide.type) && (
                <button
                  onClick={() => onDelete(slide.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: colors.danger,
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '0 4px',
                    minWidth: '32px',
                    minHeight: '32px',
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
                            onSaveSettings({ ...settings, zmanimVisible: next.length === allKeys.length ? [] : next });
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
                          onClick={() => onSaveSettings({ ...settings, limudimLang: opt.v })}
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
                              onSaveSettings({ ...settings, limudimItems: next });
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
            {isMobile && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '8px',
                paddingLeft: '28px',
                flexWrap: 'wrap',
              }}>
                <input
                  type="text"
                  value={slide.label || ''}
                  onChange={(e) => handleLabel(idx, e.target.value)}
                  placeholder={BUILT_IN_LABELS[slide.type] || 'Label'}
                  title="Custom label"
                  style={{ ...inputStyle, flex: 1, minWidth: '80px', padding: '6px 8px', fontSize: '13px' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <input
                    type="number"
                    value={slide.duration || 0}
                    onChange={(e) => handleDuration(idx, e.target.value)}
                    style={{ ...inputStyle, width: '56px', textAlign: 'center', padding: '6px 4px', fontSize: '13px' }}
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

      {/* Create form */}
      {showCreate && (
        <div style={{
          marginTop: '24px',
          padding: '20px',
          background: colors.surface,
          borderRadius: '4px',
          border: `1px solid ${colors.muted}`,
        }}>
          <h3 style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '16px',
            color: colors.text,
            marginBottom: '16px',
          }}>
            New Slide
          </h3>

          {/* Style selector */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Visual Style
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted, marginLeft: '8px' }}>
                — choose a style for a themed look, or leave as "None" to use a simple template layout below
              </span>
            </label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              {SLIDE_STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setForm(f => ({ ...f, style: s.value }))}
                  title={s.desc}
                  style={{
                    ...buttonSecondary,
                    padding: '6px 14px',
                    fontSize: '13px',
                    background: form.style === s.value ? colors.goldBg : 'transparent',
                    borderColor: form.style === s.value ? colors.gold : colors.muted,
                    color: form.style === s.value ? colors.gold : colors.text,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template selector (only when no style is selected) */}
          {!form.style && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                Layout Template
                <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted, marginLeft: '8px' }}>
                  — controls how text is arranged on the slide
                </span>
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                {TEMPLATES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setForm(f => ({ ...f, template: t.value }))}
                    style={{
                      ...buttonSecondary,
                      padding: '6px 14px',
                      fontSize: '13px',
                      background: form.template === t.value ? colors.goldBg : 'transparent',
                      borderColor: form.template === t.value ? colors.gold : colors.muted,
                      color: form.template === t.value ? colors.gold : colors.text,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title inputs — English first (primary), Hebrew optional */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Title</label>
            <textarea
              value={form.titleEn}
              onChange={(e) => setForm(f => ({ ...f, titleEn: e.target.value }))}
              rows={2}
              placeholder="Title text"
              style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Title (Hebrew) <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
            </label>
            <textarea
              value={form.titleHe}
              onChange={(e) => setForm(f => ({ ...f, titleHe: e.target.value }))}
              rows={2}
              placeholder="Optional Hebrew title"
              style={{ ...inputStyle, marginTop: '4px', resize: 'vertical', direction: 'rtl' }}
            />
          </div>

          {/* Body inputs — English first, Hebrew optional */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Body</label>
            <textarea
              value={form.bodyEn}
              onChange={(e) => setForm(f => ({ ...f, bodyEn: e.target.value }))}
              rows={3}
              placeholder="Body text"
              style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Body (Hebrew) <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
            </label>
            <textarea
              value={form.bodyHe}
              onChange={(e) => setForm(f => ({ ...f, bodyHe: e.target.value }))}
              rows={3}
              placeholder="Optional Hebrew body"
              style={{ ...inputStyle, marginTop: '4px', resize: 'vertical', direction: 'rtl' }}
            />
          </div>

          {/* Attribution for quote */}
          {!form.style && form.template === 'quote' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Attribution</label>
              <input
                type="text"
                value={form.attribution}
                onChange={(e) => setForm(f => ({ ...f, attribution: e.target.value }))}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
          )}

          {/* Subtitle */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Subtitle <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
            </label>
            <input
              type="text"
              value={form.subtitle}
              onChange={(e) => setForm(f => ({ ...f, subtitle: e.target.value }))}
              placeholder="Subtitle text (shown below main text)"
              style={{ ...inputStyle, marginTop: '4px' }}
            />
          </div>

          {/* Duration + submit */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Duration (s)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => setForm(f => ({ ...f, duration: Number(e.target.value) || 0 }))}
                style={{ ...inputStyle, marginTop: '4px', width: '80px' }}
              />
            </div>
            <button
              style={{ ...buttonPrimary, opacity: creating ? 0.6 : 1, minHeight: '44px' }}
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Slide'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
