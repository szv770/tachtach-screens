import React, { useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';

const HEBREW_MONTHS = [
  'Tishrei', 'Cheshvan', 'Kislev', 'Teves', 'Shevat', 'Adar',
  'Adar II', 'Nissan', 'Iyar', 'Sivan', 'Tammuz', 'Av', 'Elul',
];

export default function CustomDaysEditor({ customDays = [], onCreate, onDelete }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState('hebrew');
  const [form, setForm] = useState({
    title: '', subtitle: '',
    hebrewMonth: 'Tishrei', hebrewDay: 1,
    gregorianMonth: 1, gregorianDay: 1,
    recurring: true,
  });

  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!form.title) return;
    setAdding(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle || undefined,
        recurring: form.recurring,
      };
      if (mode === 'hebrew') {
        payload.hebrewMonth = form.hebrewMonth;
        payload.hebrewDay = form.hebrewDay;
      } else {
        payload.gregorianMonth = form.gregorianMonth;
        payload.gregorianDay = form.gregorianDay;
      }
      const result = await onCreate(payload);
      if (result) {
        setForm(f => ({ ...f, title: '', subtitle: '' }));
      }
    } finally {
      setAdding(false);
    }
  };

  const modeBtn = (m, label) => ({
    ...buttonSecondary,
    padding: '6px 16px',
    fontSize: '13px',
    background: mode === m ? colors.goldBg : 'transparent',
    borderColor: mode === m ? colors.gold : colors.muted,
    color: mode === m ? colors.gold : colors.text,
  });

  return (
    <div>
      <h2 style={{ fontFamily: adminFonts.englishBody, fontSize: '24px', fontWeight: 600, color: colors.gold, marginBottom: '6px' }}>
        Custom Days
      </h2>
      <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginBottom: '20px' }}>
        Mark special dates that appear as a highlighted badge on the clock/date display. Use Hebrew dates for Yahrzeits, holidays, or recurring Jewish events; use Gregorian for calendar-based events.
      </p>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button style={modeBtn('hebrew', 'Hebrew Date')} onClick={() => setMode('hebrew')}>
          Hebrew Date
        </button>
        <button style={modeBtn('gregorian', 'Gregorian Date')} onClick={() => setMode('gregorian')}>
          Gregorian Date
        </button>
      </div>

      {/* Date inputs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {mode === 'hebrew' ? (
          <>
            <div style={{ flex: 1 }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Hebrew Month</label>
              <select
                value={form.hebrewMonth}
                onChange={(e) => setForm(f => ({ ...f, hebrewMonth: e.target.value }))}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                {HEBREW_MONTHS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div style={{ width: '80px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Day</label>
              <input
                type="number"
                min={1}
                max={30}
                value={form.hebrewDay}
                onChange={(e) => setForm(f => ({ ...f, hebrewDay: Number(e.target.value) || 1 }))}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ width: '100px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Month</label>
              <input
                type="number"
                min={1}
                max={12}
                value={form.gregorianMonth}
                onChange={(e) => setForm(f => ({ ...f, gregorianMonth: Number(e.target.value) || 1 }))}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
            <div style={{ width: '80px' }}>
              <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Day</label>
              <input
                type="number"
                min={1}
                max={31}
                value={form.gregorianDay}
                onChange={(e) => setForm(f => ({ ...f, gregorianDay: Number(e.target.value) || 1 }))}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </div>
          </>
        )}
      </div>

      {/* Title + Subtitle */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Day title"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            Subtitle <span style={{ fontSize: '11px', color: colors.muted }}>optional</span>
          </label>
          <input
            type="text"
            value={form.subtitle}
            onChange={(e) => setForm(f => ({ ...f, subtitle: e.target.value }))}
            placeholder="Optional subtitle"
            style={{ ...inputStyle, marginTop: '4px' }}
          />
        </div>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: isMobile ? '12px' : '16px',
        marginBottom: '24px',
      }}>
        <label title="Recurring: this date repeats every year on the same Hebrew or Gregorian date. Uncheck for a one-time event." style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '36px' }}>
          <input
            type="checkbox"
            checked={form.recurring}
            onChange={(e) => setForm(f => ({ ...f, recurring: e.target.checked }))}
          />
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
            Repeat every year <span style={{ fontSize: '11px', color: colors.muted }}>(uncheck for a one-time event)</span>
          </span>
        </label>
        <button
          style={{ ...buttonPrimary, opacity: adding ? 0.6 : 1, minHeight: '44px' }}
          onClick={handleAdd}
          disabled={adding}
        >
          {adding ? 'Adding...' : 'Add Custom Day'}
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {customDays.map(day => (
          <div key={day.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            padding: isMobile ? '10px 12px' : '10px 14px',
            background: colors.surface,
            borderRadius: '4px',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
          }}>
            <span style={{
              fontFamily: adminFonts.englishBody,
              fontSize: '12px',
              color: colors.muted,
              minWidth: isMobile ? undefined : '100px',
              flexShrink: 0,
            }}>
              {day.hebrewMonth ? `${day.hebrewMonth} ${day.hebrewDay}` : `${day.gregorianMonth}/${day.gregorianDay}`}
              {day.recurring ? ' \u21BB' : ''}
            </span>
            <span style={{
              flex: 1,
              fontFamily: adminFonts.hebrewPrimary,
              fontSize: '14px',
              color: colors.text,
              direction: 'rtl',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {day.title}
            </span>
            {day.subtitle && !isMobile && (
              <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>
                {day.subtitle}
              </span>
            )}
            <button
              onClick={() => onDelete(day.id)}
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
                flexShrink: 0,
              }}
            >
              {'\u00D7'}
            </button>
          </div>
        ))}
        {customDays.length === 0 && (
          <div style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.muted, padding: '20px 0', textAlign: 'center' }}>
            No custom days configured
          </div>
        )}
      </div>
    </div>
  );
}
