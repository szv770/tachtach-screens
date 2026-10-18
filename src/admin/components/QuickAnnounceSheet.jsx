import React, { useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { emptyItem, endOfDay } from './announcements/helpers.js';

const DURATIONS = [
  { key: '15', label: '15 min', minutes: 15 },
  { key: '60', label: '1 hour', minutes: 60 },
  { key: 'eod', label: 'Rest of today', minutes: null, eod: true },
  { key: 'forever', label: "Until I remove it", minutes: null },
];

/**
 * The fast path for "post something to the screen right now" — a handful of
 * fields instead of the full composer, for posting from a phone in a hurry.
 * Always creates a plain Big-words slide; anything fancier (banner, takeover,
 * a specific layout, recurrence) still goes through the full Announcements tab.
 */
export default function QuickAnnounceSheet({ onClose, onPost }) {
  const isMobile = useIsMobile();
  const [headlineHe, setHeadlineHe] = useState('');
  const [headlineEn, setHeadlineEn] = useState('');
  const [showEnglish, setShowEnglish] = useState(false);
  const [durationKey, setDurationKey] = useState('eod');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSend = headlineHe.trim() || headlineEn.trim();

  const submit = async () => {
    if (!canSend || saving) return;
    setSaving(true);
    setError('');
    const item = emptyItem('slide');
    item.content.headlineHe = headlineHe.trim();
    item.content.headlineEn = headlineEn.trim();
    const dur = DURATIONS.find((d) => d.key === durationKey) || DURATIONS[2];
    item.when.expiresAt = dur.eod ? endOfDay(new Date()).toISOString() : dur.minutes ? new Date(Date.now() + dur.minutes * 60000).toISOString() : null;
    const created = await onPost(item);
    setSaving(false);
    if (created) onClose();
    else setError("Couldn't post — try again.");
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: isMobile ? 'rgba(10,8,5,.7)' : 'rgba(10,8,5,.6)',
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.bg,
          border: isMobile ? 'none' : `1px solid ${colors.goldBd}`,
          borderRadius: isMobile ? '14px 14px 0 0' : '12px',
          width: isMobile ? '100%' : '480px',
          maxWidth: '100%',
          maxHeight: '92dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: `16px 18px calc(18px + env(safe-area-inset-bottom))`,
          boxShadow: '0 -8px 32px rgba(0,0,0,.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.gold, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
            Quick Announcement
          </span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: `1px solid ${colors.muted}`, borderRadius: '6px', color: colors.dim, fontSize: '18px', cursor: 'pointer', minWidth: '40px', minHeight: '40px', lineHeight: 1, fontFamily: adminFonts.englishBody }}>
            {'×'}
          </button>
        </div>

        <textarea
          autoFocus
          dir="rtl"
          rows={3}
          placeholder="מה להודיע?"
          value={headlineHe}
          onChange={(e) => setHeadlineHe(e.target.value)}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontSize: '20px', textAlign: 'right', marginBottom: '8px' }}
        />

        {showEnglish ? (
          <input
            type="text"
            placeholder="English (optional)"
            value={headlineEn}
            onChange={(e) => setHeadlineEn(e.target.value)}
            style={{ ...inputStyle, width: '100%', marginBottom: '14px' }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowEnglish(true)}
            style={{ background: 'transparent', border: 'none', color: colors.dim, fontFamily: adminFonts.englishBody, fontSize: '13px', cursor: 'pointer', padding: '4px 0 14px', textDecoration: 'underline' }}
          >
            + Add English
          </button>
        )}

        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          How long should it show?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
          {DURATIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDurationKey(d.key)}
              style={{
                ...buttonSecondary,
                padding: '8px 14px',
                minHeight: '40px',
                borderColor: durationKey === d.key ? colors.gold : colors.border,
                background: durationKey === d.key ? colors.goldBg : buttonSecondary.background,
                color: durationKey === d.key ? colors.gold : buttonSecondary.color,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        {error && <div style={{ color: colors.danger, fontFamily: adminFonts.englishBody, fontSize: '13px', marginBottom: '10px' }}>{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSend || saving}
          style={{ ...buttonPrimary, width: '100%', minHeight: '48px', fontSize: '16px', opacity: !canSend || saving ? 0.6 : 1 }}
        >
          {saving ? 'Posting…' : 'Post to screen'}
        </button>
      </div>
    </div>
  );
}
