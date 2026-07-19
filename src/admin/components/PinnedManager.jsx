import React, { useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary } from '../styles/admin-tokens.js';
import { NumberField } from './ui.jsx';
import useIsMobile from '../hooks/useIsMobile.js';

const DISPLAY_MODES = [
  { value: 'note', en: 'Note', desc: 'Bullet point in sidebar' },
  { value: 'slide', en: 'Slide', desc: 'Full slide in carousel' },
];

const EXPIRY_UNITS = [
  { value: 'minutes', label: 'Minutes', ms: 60 * 1000 },
  { value: 'hours', label: 'Hours', ms: 60 * 60 * 1000 },
  { value: 'days', label: 'Days', ms: 24 * 60 * 60 * 1000 },
  { value: 'weeks', label: 'Weeks', ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatExpiry(expiresAt) {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  if (d.getTime() < now) return 'Expired';
  const diffMs = d.getTime() - now;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `Expires in ${diffMin}m`;
  const diffHr = Math.round(diffMs / 3600000);
  if (diffHr < 24) return `Expires in ${diffHr}h`;
  const diffDay = Math.round(diffMs / 86400000);
  if (diffDay < 7) return `Expires in ${diffDay}d`;
  return `Expires ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export default function PinnedManager({ pinned = [], onCreate, onUpdate, onDelete, embedded = false }) {
  const isMobile = useIsMobile();
  const [textEn, setTextEn] = useState('');
  const [textHe, setTextHe] = useState('');
  const [showHebrew, setShowHebrew] = useState(false);
  const [displayMode, setDisplayMode] = useState('note');
  const [duration, setDuration] = useState(10);
  const [fullscreen, setFullscreen] = useState(false);
  const [expiryAmount, setExpiryAmount] = useState('');
  const [expiryUnit, setExpiryUnit] = useState('hours');

  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!textEn && !textHe) return;
    setAdding(true);
    try {
      const unitMs = EXPIRY_UNITS.find(u => u.value === expiryUnit)?.ms || 3600000;
      const expiresAt = expiryAmount ? new Date(Date.now() + Number(expiryAmount) * unitMs).toISOString() : undefined;
      const result = await onCreate({
        textEn: textEn || undefined,
        textHe: textHe || undefined,
        displayMode,
        ...(displayMode === 'slide' ? { duration, fullscreen } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
      if (result) {
        setTextEn('');
        setTextHe('');
        setShowHebrew(false);
        setDisplayMode('note');
        setDuration(10);
        setFullscreen(false);
        setExpiryAmount('');
        setExpiryUnit('hours');
      }
    } finally {
      setAdding(false);
    }
  };

  const handleToggleMode = async (item) => {
    const newMode = item.displayMode === 'slide' ? 'note' : 'slide';
    await onUpdate(item.id, {
      displayMode: newMode,
      ...(newMode === 'slide' ? { duration: item.duration || 10 } : {}),
    });
  };

  const handleDuration = async (item, dur) => {
    await onUpdate(item.id, { duration: dur });
  };

  const handleFullscreen = async (item) => {
    await onUpdate(item.id, { fullscreen: !item.fullscreen });
  };

  return (
    <div>
      {embedded ? (
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', fontWeight: 600, color: colors.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
          Pinned Notes
        </div>
      ) : (
        <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, marginBottom: '20px' }}>
          Pinned Notes
        </h2>
      )}

      {/* Inline create form */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Note Text</label>
          <input
            type="text"
            value={textEn}
            onChange={(e) => setTextEn(e.target.value)}
            placeholder="Type your note..."
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>

        {!showHebrew ? (
          <button
            onClick={() => setShowHebrew(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim,
              padding: '0', marginBottom: '10px', textDecoration: 'underline',
            }}
          >
            + Add Hebrew text (optional)
          </button>
        ) : (
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
              Hebrew Text <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
            </label>
            <input
              type="text"
              value={textHe}
              onChange={(e) => setTextHe(e.target.value)}
              placeholder="Optional Hebrew text"
              style={{ ...inputStyle, marginTop: '4px', direction: 'rtl' }}
            />
          </div>
        )}

        {/* Display mode selector */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Display:</span>
          {DISPLAY_MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setDisplayMode(m.value)}
              style={{
                padding: '6px 14px',
                background: displayMode === m.value ? colors.goldBg : 'transparent',
                border: `1px solid ${displayMode === m.value ? colors.gold : colors.muted}`,
                borderRadius: '4px',
                cursor: 'pointer',
                color: displayMode === m.value ? colors.gold : colors.text,
                fontFamily: adminFonts.englishBody,
                fontSize: '13px',
                minHeight: '36px',
              }}
            >
              {m.en}
            </button>
          ))}

          {/* Duration + fullscreen (only for slide mode) */}
          {displayMode === 'slide' && (
            <>
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginLeft: isMobile ? '0' : '12px' }}>Duration:</span>
              <NumberField
                value={duration}
                onCommit={setDuration}
                min={1}
                max={600}
                title="Seconds on screen"
                style={{ width: '56px', textAlign: 'center', padding: '5px' }}
              />
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.muted }}>s</span>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', marginLeft: isMobile ? '0' : '8px', minHeight: '36px' }}>
                <input
                  type="checkbox"
                  checked={fullscreen}
                  onChange={() => setFullscreen(!fullscreen)}
                  style={{ accentColor: colors.gold }}
                />
                <span style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginLeft: '4px' }}>
                  Full
                </span>
              </label>
            </>
          )}
        </div>

        {/* Expiry picker */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Expires in:</span>
          <input
            type="number"
            min="1"
            value={expiryAmount}
            onChange={(e) => setExpiryAmount(e.target.value)}
            placeholder="Never"
            style={{ ...inputStyle, width: '70px', textAlign: 'center', padding: '5px' }}
          />
          {EXPIRY_UNITS.map(u => (
            <button
              key={u.value}
              onClick={() => setExpiryUnit(u.value)}
              style={{
                padding: '6px 10px',
                background: expiryUnit === u.value ? colors.goldBg : 'transparent',
                border: `1px solid ${expiryUnit === u.value ? colors.gold : colors.muted}`,
                borderRadius: '4px',
                cursor: 'pointer',
                color: expiryUnit === u.value ? colors.gold : colors.text,
                fontFamily: adminFonts.englishBody,
                fontSize: '12px',
                minHeight: '32px',
              }}
            >
              {u.value === 'minutes' ? 'Mins' : u.value === 'hours' ? 'Hrs' : u.value === 'days' ? 'Days' : 'Wks'}
            </button>
          ))}
          {expiryAmount && (
            <button
              onClick={() => setExpiryAmount('')}
              style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '18px', padding: '0 4px', lineHeight: 1 }}
            >
              ×
            </button>
          )}
        </div>

        <button
          style={{ ...buttonPrimary, whiteSpace: 'nowrap', opacity: adding ? 0.6 : 1, minHeight: '44px', width: isMobile ? '100%' : undefined }}
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? 'Adding...' : 'Add'}
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {pinned.map(item => (
          <div key={item.id} style={{
            padding: isMobile ? '10px 12px' : '10px 14px',
            background: colors.surface,
            borderRadius: '4px',
          }}>
            {/* Row 1: badge, text, delete */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: isMobile ? '8px' : '10px',
            }}>
              <span
                onClick={() => handleToggleMode(item)}
                title={item.displayMode === 'slide' ? 'Click to switch to note' : 'Click to switch to slide'}
                style={{
                  fontFamily: adminFonts.englishBody,
                  fontSize: '10px',
                  color: item.displayMode === 'slide' ? colors.gold : colors.dim,
                  background: item.displayMode === 'slide' ? colors.goldBg : 'transparent',
                  border: `1px solid ${item.displayMode === 'slide' ? colors.goldBd : colors.muted}`,
                  borderRadius: '3px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  flexShrink: 0,
                  minHeight: '28px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {item.displayMode === 'slide' ? 'slide' : 'note'}
              </span>

              {!isMobile && <span style={{ color: colors.gold, fontSize: '14px' }}>{'\u25C9'}</span>}
              <span style={{
                flex: 1,
                fontFamily: adminFonts.englishBody,
                fontSize: '14px',
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.textEn || item.textHe}
              </span>

              {!isMobile && item.textHe && item.textEn && (
                <span style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '13px', color: colors.dim, direction: 'rtl' }}>
                  {item.textHe}
                </span>
              )}

              {item.expiresAt && (() => {
                const label = formatExpiry(item.expiresAt);
                const expired = label === 'Expired';
                return (
                  <span style={{
                    fontFamily: adminFonts.englishBody,
                    fontSize: '10px',
                    color: expired ? colors.danger : colors.muted,
                    background: expired ? 'rgba(220,50,50,0.08)' : 'transparent',
                    border: `1px solid ${expired ? colors.danger : colors.muted}`,
                    borderRadius: '3px',
                    padding: '2px 6px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {label}
                  </span>
                );
              })()}

              {/* Duration control for slide mode — desktop inline */}
              {!isMobile && item.displayMode === 'slide' && (
                <>
                  <NumberField
                    value={item.duration || 10}
                    onCommit={(v) => handleDuration(item, v)}
                    min={1}
                    max={600}
                    title="Seconds on screen"
                    style={{ width: '48px', textAlign: 'center', padding: '3px', fontSize: '12px' }}
                  />
                  <span style={{ fontFamily: adminFonts.englishBody, fontSize: '10px', color: colors.muted }}>s</span>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={item.fullscreen || false}
                      onChange={() => handleFullscreen(item)}
                      style={{ accentColor: colors.gold }}
                    />
                    <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim, marginLeft: '3px' }}>
                      Full
                    </span>
                  </label>
                </>
              )}

              <button
                onClick={() => onDelete(item.id)}
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

            {/* Row 2 (mobile only): Hebrew text + slide controls */}
            {isMobile && (item.textHe && item.textEn || item.displayMode === 'slide') && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
                paddingLeft: '4px',
                flexWrap: 'wrap',
              }}>
                {item.textHe && item.textEn && (
                  <span style={{ fontFamily: adminFonts.hebrewPrimary, fontSize: '13px', color: colors.dim, direction: 'rtl' }}>
                    {item.textHe}
                  </span>
                )}
                {item.displayMode === 'slide' && (
                  <>
                    <NumberField
                      value={item.duration || 10}
                      onCommit={(v) => handleDuration(item, v)}
                      min={1}
                      max={600}
                      title="Seconds on screen"
                      style={{ width: '56px', textAlign: 'center', padding: '5px', fontSize: '12px' }}
                    />
                    <span style={{ fontFamily: adminFonts.englishBody, fontSize: '10px', color: colors.muted }}>s</span>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', minHeight: '36px' }}>
                      <input
                        type="checkbox"
                        checked={item.fullscreen || false}
                        onChange={() => handleFullscreen(item)}
                        style={{ accentColor: colors.gold }}
                      />
                      <span style={{ fontFamily: adminFonts.englishBody, fontSize: '11px', color: colors.dim, marginLeft: '3px' }}>
                        Full
                      </span>
                    </label>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {pinned.length === 0 && (
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted, padding: '20px 0', textAlign: 'center' }}>
            No pinned notes yet
          </div>
        )}
      </div>
    </div>
  );
}
