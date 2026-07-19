import React, { useState, useEffect } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonDanger } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

const TAKEOVER_STYLES = [
  { value: 'classic', label: 'Classic', desc: 'Clean, minimal', preview: { bg: '#12100C', accent: '#C4342D', text: '#EFE3C0' } },
  { value: 'grand', label: 'Grand', desc: 'Gold shimmer, elegant', preview: { bg: '#1a1408', accent: '#D4A84B', text: '#F5E6B8' } },
  { value: 'emergency', label: 'Emergency', desc: 'Red alert', preview: { bg: '#1a0000', accent: '#DC2626', text: '#FFFFFF' } },
  { value: 'sleek', label: 'Sleek', desc: 'Modern minimal', preview: { bg: '#000000', accent: '#8B5CF6', text: '#FFFFFF' } },
  { value: 'celebration', label: 'Celebration', desc: 'Confetti, joyful', preview: { bg: '#1a0a2e', accent: '#FBBF24', text: '#FBBF24' } },
  { value: 'urgent', label: 'Notice', desc: 'Amber attention', preview: { bg: '#1a1400', accent: '#FBBF24', text: '#FBBF24' } },
];

const MESSAGE_TYPES = [
  { value: 'banner', en: 'Banner', desc: 'Scrolling text across top of screen' },
  { value: 'board', en: 'Board', desc: 'Posted to the message board slide' },
  { value: 'takeover', en: 'Takeover', desc: 'Full-screen urgent message' },
];

const EXPIRY_OPTIONS = [
  { value: '', label: 'Manual dismiss' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: 'eod', label: 'End of day' },
];

function computeExpiry(value) {
  if (!value) return null;
  if (value === 'eod') {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }
  return new Date(Date.now() + Number(value) * 60000).toISOString();
}

const BANNER_SIZE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
];
const BANNER_SPEED_OPTIONS = [
  { value: 'slow', label: 'Slow' },
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];
const BANNER_REPEAT_OPTIONS = [
  { value: 'loop', label: 'Loop' },
  { value: 'wait', label: 'Wait' },
];

function BannerOptionBar({ label, options, value, onChange }) {
  return (
    <div>
      <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim }}>{label}</span>
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              fontFamily: adminFonts.englishBody,
              background: value === o.value ? colors.goldBg : 'transparent',
              border: `1px solid ${value === o.value ? colors.gold : colors.muted}`,
              borderRadius: '3px',
              color: value === o.value ? colors.gold : colors.text,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MessageComposer({ messages = [], onCreate, onDelete, bannerSettings = {}, onSaveBannerSettings }) {
  const isMobile = useIsMobile();
  const [type, setType] = useState('banner');
  const [textEn, setTextEn] = useState('');
  const [textHe, setTextHe] = useState('');
  const [showHebrew, setShowHebrew] = useState(false);
  const [target, setTarget] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [expiry, setExpiry] = useState('');
  const [takeoverStyle, setTakeoverStyle] = useState('classic');
  const [blocking, setBlocking] = useState(false);
  const [bannerSize, setBannerSize] = useState('normal');
  const [bannerSpeed, setBannerSpeed] = useState('normal');
  const [bannerRepeat, setBannerRepeat] = useState('loop');

  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (bannerSettings.size) setBannerSize(bannerSettings.size);
    if (bannerSettings.speed) setBannerSpeed(bannerSettings.speed);
    if (bannerSettings.repeat) setBannerRepeat(bannerSettings.repeat);
  }, [bannerSettings.size, bannerSettings.speed, bannerSettings.repeat]);

  const activeBanner = messages.find(m => m.type === 'banner');

  const handleSend = async () => {
    if (!textEn && !textHe) return;
    setSending(true);
    try {
      // If editing, delete the specific message being edited
      if (editingId) {
        await onDelete(editingId);
        setEditingId(null);
      }
      const result = await onCreate({
        type,
        textEn: textEn || undefined,
        textHe: textHe || undefined,
        target: type === 'board' ? target || undefined : undefined,
        subtitle: subtitle || undefined,
        style: type === 'takeover' ? takeoverStyle : undefined,
        blocking: type === 'board' ? blocking : undefined,
        expiresAt: computeExpiry(expiry),
      });
      if (result) {
        setTextEn('');
        setTextHe('');
        setShowHebrew(false);
        setTarget('');
        setSubtitle('');
        setExpiry('');
        setBlocking(false);
        setTakeoverStyle('classic');
        setEditingId(null);
      }
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (msg) => {
    setEditingId(msg.id);
    setType(msg.type);
    setTextEn(msg.textEn || '');
    setTextHe(msg.textHe || '');
    setShowHebrew(Boolean(msg.textHe));
    setTarget(msg.target || '');
    setSubtitle(msg.subtitle || '');
    setTakeoverStyle(msg.style || 'classic');
    setExpiry('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTextEn('');
    setTextHe('');
    setShowHebrew(false);
    setTarget('');
    setSubtitle('');
    setExpiry('');
    setBlocking(false);
    setTakeoverStyle('classic');
  };

  const formatTimeLeft = (iso) => {
    if (!iso) return 'Manual';
    const diffMs = new Date(iso) - now;
    if (diffMs <= 0) return 'Expired';
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return '< 1 min';
    if (mins < 60) return `${mins} min left`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}h ${rem}m left` : `${hrs}h left`;
  };

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, marginBottom: '6px' }}>
        Messages
      </h2>
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginBottom: '20px' }}>
        Send a message to the screen. <strong style={{ color: colors.text }}>Banner</strong> — scrolling ticker at the top.{' '}
        <strong style={{ color: colors.text }}>Board</strong> — a posted notice (like a bulletin board).{' '}
        <strong style={{ color: colors.text }}>Takeover</strong> — a full-screen urgent announcement.
      </p>

      {/* Type selector */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        {MESSAGE_TYPES.map(t => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            style={{
              padding: '14px',
              background: type === t.value ? colors.goldBg : colors.surface,
              border: `1px solid ${type === t.value ? colors.goldBd : colors.muted}`,
              borderRadius: '4px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 500, color: type === t.value ? colors.gold : colors.text }}>
              {t.en}
            </div>
            <div style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted, marginTop: '4px' }}>
              {t.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Banner options — global settings, shown before text input */}
      {type === 'banner' && (
        <div style={{
          marginBottom: '14px',
          padding: '12px',
          background: colors.surface,
          borderRadius: '4px',
          border: `1px solid ${colors.muted}`,
        }}>
          <p style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted, marginBottom: '10px' }}>
            These settings apply to all banners globally.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px' }}>
            <BannerOptionBar label="Text Size" options={BANNER_SIZE_OPTIONS} value={bannerSize} onChange={v => { setBannerSize(v); onSaveBannerSettings?.({ size: v, speed: bannerSpeed, repeat: bannerRepeat }); }} />
            <BannerOptionBar label="Scroll Speed" options={BANNER_SPEED_OPTIONS} value={bannerSpeed} onChange={v => { setBannerSpeed(v); onSaveBannerSettings?.({ size: bannerSize, speed: v, repeat: bannerRepeat }); }} />
            <div>
              <BannerOptionBar label="After Finishing" options={BANNER_REPEAT_OPTIONS} value={bannerRepeat} onChange={v => { setBannerRepeat(v); onSaveBannerSettings?.({ size: bannerSize, speed: bannerSpeed, repeat: v }); }} />
              <div style={{ fontFamily: adminFonts.englishBody, fontSize: '10px', color: colors.muted, marginTop: '4px' }}>
                Loop = repeat continuously · Wait = pause between cycles
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Text input — English primary */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Message Text</label>
        <textarea
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
          rows={3}
          placeholder="Type your message..."
          style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
        />
      </div>

      {/* Hebrew toggle */}
      {!showHebrew ? (
        <button
          onClick={() => setShowHebrew(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim,
            padding: '0', marginBottom: '14px', textDecoration: 'underline',
          }}
        >
          + Add Hebrew text (optional)
        </button>
      ) : (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            Hebrew Text <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
          </label>
          <textarea
            value={textHe}
            onChange={(e) => setTextHe(e.target.value)}
            rows={3}
            placeholder="Optional Hebrew text"
            style={{ ...inputStyle, marginTop: '4px', resize: 'vertical', direction: 'rtl' }}
          />
        </div>
      )}

      {/* Subtitle — not shown for banner type */}
      {type !== 'banner' && (
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            Subtitle <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
          </label>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Subtitle text (shown below main text)"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
      )}

      {/* Target + blocking (board only) */}
      {type === 'board' && (
        <>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Displayed to (optional — e.g. "Grade 5", "All Students")
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. Grade 5, All"
              style={{ ...inputStyle, marginTop: '4px' }}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '14px' }}>
            <input
              type="checkbox"
              checked={blocking}
              onChange={e => setBlocking(e.target.checked)}
              style={{ accentColor: colors.gold, width: '15px', height: '15px' }}
            />
            <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.text }}>
              Hold screen on this board — pause all other slides until this message is dismissed
            </span>
          </label>
        </>
      )}

      {/* Takeover style selector */}
      {type === 'takeover' && (
        <div style={{ marginBottom: '18px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, display: 'block', marginBottom: '8px' }}>
            Takeover Style
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '8px' }}>
            {TAKEOVER_STYLES.map(s => {
              const isActive = takeoverStyle === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setTakeoverStyle(s.value)}
                  style={{
                    padding: '0',
                    background: 'transparent',
                    border: `2px solid ${isActive ? colors.gold : colors.muted}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'border-color .15s',
                    outline: isActive ? `1px solid ${colors.goldBd}` : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {/* Mini preview strip */}
                  <div style={{
                    height: '36px',
                    background: s.preview.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    {/* Accent decoration varies by style */}
                    {s.value === 'classic' && (
                      <div style={{ width: '20px', height: '2px', background: s.preview.accent, borderRadius: '1px' }} />
                    )}
                    {s.value === 'grand' && (
                      <>
                        <div style={{ position: 'absolute', top: '4px', left: '8px', right: '8px', height: '1px', background: `linear-gradient(90deg, transparent, ${s.preview.accent}, transparent)` }} />
                        <div style={{ width: '6px', height: '6px', background: s.preview.accent, transform: 'rotate(45deg)' }} />
                        <div style={{ position: 'absolute', bottom: '4px', left: '8px', right: '8px', height: '1px', background: `linear-gradient(90deg, transparent, ${s.preview.accent}, transparent)` }} />
                      </>
                    )}
                    {s.value === 'emergency' && (
                      <>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `repeating-linear-gradient(90deg, ${s.preview.accent} 0, ${s.preview.accent} 6px, transparent 6px, transparent 12px)` }} />
                        <span style={{ fontSize: '16px' }}>&#9888;</span>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: `repeating-linear-gradient(90deg, ${s.preview.accent} 0, ${s.preview.accent} 6px, transparent 6px, transparent 12px)` }} />
                      </>
                    )}
                    {s.value === 'sleek' && (
                      <div style={{ width: '30px', height: '1px', background: `linear-gradient(90deg, ${s.preview.accent}, transparent)` }} />
                    )}
                    {s.value === 'celebration' && (
                      <>
                        {[0,1,2,3,4].map(i => (
                          <div key={i} style={{
                            width: '4px', height: '4px', borderRadius: i % 2 ? '50%' : '1px',
                            background: ['#FF6B6B','#FFE66D','#4ECDC4','#A78BFA','#F472B6'][i],
                            position: 'absolute',
                            left: `${15 + i * 18}%`, top: `${20 + (i % 3) * 20}%`,
                          }} />
                        ))}
                      </>
                    )}
                    {s.value === 'urgent' && (
                      <>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${s.preview.accent}, transparent)` }} />
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `1px solid ${s.preview.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: s.preview.accent, fontSize: '10px', fontWeight: 700 }}>!</span>
                        </div>
                      </>
                    )}
                    {/* Sample text preview */}
                    <div style={{
                      position: 'absolute', bottom: '5px', left: 0, right: 0,
                      textAlign: 'center', fontSize: '7px', color: s.preview.text, opacity: 0.6,
                      fontFamily: adminFonts.hebrewPrimary,
                    }}>Message</div>
                  </div>
                  {/* Label area */}
                  <div style={{ padding: '6px 8px', background: isActive ? colors.goldBg : colors.surface }}>
                    <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 500, color: isActive ? colors.gold : colors.text }}>
                      {s.label}
                    </div>
                    <div style={{ fontFamily: adminFonts.englishBody, fontSize: '10px', color: colors.dim, marginTop: '1px' }}>
                      {s.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Expiry + Send */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'flex-end',
        gap: isMobile ? '12px' : '16px',
        marginBottom: '32px',
      }}>
        <div style={{ flex: isMobile ? undefined : undefined }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Expires</label>
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            style={{ ...inputStyle, marginTop: '4px', width: isMobile ? '100%' : '160px' }}
          >
            {EXPIRY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {editingId && (
          <button
            onClick={handleCancelEdit}
            style={{
              ...buttonPrimary,
              background: 'transparent',
              border: `1px solid ${colors.muted}`,
              color: colors.text,
              minHeight: '44px',
            }}
          >
            Cancel
          </button>
        )}
        <button
          style={{ ...buttonPrimary, opacity: sending ? 0.6 : 1, minHeight: '44px' }}
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? 'Sending...' : (editingId ? 'Update Message' : 'Send Message')}
        </button>
      </div>

      {/* Active messages */}
      {messages.length > 0 && (
        <div>
          <h3 style={{
            fontFamily: adminFonts.englishBody,
            fontSize: '14px',
            color: colors.dim,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '10px',
          }}>
            Active Messages
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? '6px' : '12px',
                padding: isMobile ? '12px' : '10px 14px',
                background: colors.surface,
                borderRadius: '4px',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                }}>
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '11px',
                    color: colors.gold,
                    background: colors.goldBg,
                    border: `1px solid ${colors.goldBd}`,
                    borderRadius: '3px',
                    padding: '2px 8px',
                    textTransform: 'uppercase',
                    flexShrink: 0,
                  }}>
                    {msg.type}
                  </span>
                  <span style={{
                    flex: 1,
                    fontFamily: adminFonts.englishBody,
                    fontSize: '14px',
                    color: colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {msg.textEn || msg.textHe}
                  </span>
                  {!isMobile && (
                    <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted, flexShrink: 0 }}>
                      {formatTimeLeft(msg.expiresAt)}
                    </span>
                  )}
                  <button
                    onClick={() => handleEdit(msg)}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${colors.muted}`,
                      color: colors.dim,
                      fontSize: '12px',
                      fontFamily: adminFonts.englishBody,
                      cursor: 'pointer',
                      padding: '3px 10px',
                      borderRadius: '3px',
                      minHeight: '28px',
                      flexShrink: 0,
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(msg.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: colors.danger,
                      fontSize: '18px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      minWidth: isMobile ? '40px' : '32px',
                      minHeight: isMobile ? '40px' : '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {'\u00D7'}
                  </button>
                </div>
                {isMobile && (
                  <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.muted }}>
                    Expires: {formatTimeLeft(msg.expiresAt)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
