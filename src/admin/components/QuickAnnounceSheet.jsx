import React, { useEffect, useMemo, useState } from 'react';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../styles/admin-tokens.js';
import useIsMobile from '../hooks/useIsMobile.js';
import { apiFetch } from '../hooks/useAdminState.js';
import { emptyItem } from './announcements/helpers.js';
import { DEFAULT_TZ } from '../../shared/announcements.js';
import {
  DEFAULT_QUICK_TEMPLATES, usesDay, usesTime, dayChoices, fillTemplate, expiryFor, weeklyRecurrence,
} from '../../shared/quickTemplates.js';

const BASE_DURATIONS = [
  { key: '15', label: '15 min' },
  { key: '60', label: '1 hour' },
  { key: 'eod', label: 'Rest of today' },
  { key: 'forever', label: 'Until I remove it' },
];
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Shabbos'];

const small = { fontFamily: adminFonts.englishBody, fontSize: '12px', color: colors.dim, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' };
const chipStyle = (on) => ({
  ...buttonSecondary, padding: '8px 14px', minHeight: '40px',
  borderColor: on ? colors.gold : colors.border,
  background: on ? colors.goldBg : buttonSecondary.background,
  color: on ? colors.gold : buttonSecondary.color,
});

/**
 * The fast path for "post something to the screen right now": saved quick
 * messages (tap, pick the day/time, send), or type your own; optionally
 * repeating every week. Always creates a plain Big-words slide — anything
 * fancier (banner, takeover, other layouts) still goes through the full composer.
 */
export default function QuickAnnounceSheet({ onClose, onPost, tz = DEFAULT_TZ }) {
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState(DEFAULT_QUICK_TEMPLATES);
  const [editing, setEditing] = useState(false);
  const [tplId, setTplId] = useState(null);
  const [dayKey, setDayKey] = useState(null);
  const [time, setTime] = useState('');
  const [he, setHe] = useState('');
  const [en, setEn] = useState('');
  const [showEn, setShowEn] = useState(false);
  const [edited, setEdited] = useState(false);
  const [durationKey, setDurationKey] = useState('eod');
  const [weekly, setWeekly] = useState(false);
  const [weekDays, setWeekDays] = useState([]);
  const [naming, setNaming] = useState(null); // null | string (name for "save as quick message")
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const days = useMemo(() => dayChoices(new Date(), tz), [tz]);
  const tpl = templates.find((t) => t.id === tplId) || null;
  const day = days.find((d) => d.key === dayKey) || null;
  const needDay = !!tpl && usesDay(tpl);
  const needTime = !!tpl && usesTime(tpl);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/quick-templates').then((r) => { if (alive && Array.isArray(r?.templates)) setTemplates(r.templates); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // While a saved message is chosen (and the text isn't hand-edited), keep the text in step with the day/time.
  useEffect(() => {
    if (!tpl || edited) return;
    const f = fillTemplate(tpl, { day, time });
    setHe(f.textHe);
    setEn(f.textEn);
    if (f.textEn) setShowEn(true);
  }, [tpl, day, time, edited]);

  const pick = (t) => {
    setTplId(t.id);
    setEdited(false);
    setDayKey(usesDay(t) ? 'today' : null);
    setTime('');
    setNaming(null);
    setError('');
    setDurationKey(t.duration === 'day' && !usesDay(t) ? 'eod' : t.duration);
  };

  const durations = needDay && day
    ? [...BASE_DURATIONS.slice(0, 2), { key: 'day', label: `Through ${day.key === 'today' || day.key === 'tomorrow' ? day.label.toLowerCase() : day.label}` }, BASE_DURATIONS[3]]
    : BASE_DURATIONS;
  const activeDuration = durations.some((d) => d.key === durationKey) ? durationKey : 'eod';

  const ready = (he.trim() || en.trim()) && (!needDay || day) && (!needTime || time) && (!weekly || weekDays.length);

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError('');
    const item = emptyItem('slide');
    item.content.headlineHe = he.trim();
    item.content.headlineEn = en.trim();
    item.when.expiresAt = weekly ? null : expiryFor(activeDuration, { tz, day });
    item.when.recurrence = weekly ? weeklyRecurrence(weekDays) : null;
    const created = await onPost(item, weekly ? 'Posted — repeats every week' : 'Posted to screen');
    setSaving(false);
    if (created) onClose();
    else setError("Couldn't post — try again.");
  };

  const saveTemplates = async (next, okText) => {
    try {
      const r = await apiFetch('/api/quick-templates', { method: 'PUT', body: JSON.stringify({ templates: next }) });
      setTemplates(r.templates);
      if (okText) setError('');
      return r.templates;
    } catch (e) {
      setError(e.message || "Couldn't save.");
      return null;
    }
  };

  const saveAsTemplate = async () => {
    const label = (naming || '').trim() || (en || he).trim().slice(0, 40);
    const saved = await saveTemplates([...templates, { id: `q${Date.now().toString(36)}`, label, textHe: he.trim(), textEn: en.trim(), duration: weekly ? 'eod' : activeDuration }], true);
    if (saved) { setNaming(null); setTplId(saved[saved.length - 1].id); setEdited(false); }
  };

  const removeTemplate = async (id) => {
    await saveTemplates(templates.filter((t) => t.id !== id));
    if (tplId === id) setTplId(null);
  };

  const isNew = !tpl || edited;

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(10,8,5,.7)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: colors.bg, border: isMobile ? 'none' : `1px solid ${colors.goldBd}`,
        borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: isMobile ? '100%' : '520px', maxWidth: '100%',
        maxHeight: '92dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: '16px 18px calc(18px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 32px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontFamily: adminFonts.englishBody, fontSize: '14px', color: colors.gold, textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>Quick Announcement</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: `1px solid ${colors.muted}`, borderRadius: '6px', color: colors.dim, fontSize: '18px', cursor: 'pointer', minWidth: '40px', minHeight: '40px', lineHeight: 1, fontFamily: adminFonts.englishBody }}>{'×'}</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <p style={small}>Quick messages</p>
          <button type="button" onClick={() => setEditing((v) => !v)} style={{ background: 'transparent', border: 'none', color: colors.dim, fontFamily: adminFonts.englishBody, fontSize: '13px', cursor: 'pointer', textDecoration: 'underline', minHeight: 0 }}>{editing ? 'Done' : 'Edit'}</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {templates.map((t) => (
            <span key={t.id} style={{ display: 'inline-flex' }}>
              <button type="button" onClick={() => (editing ? null : pick(t))} style={{ ...chipStyle(t.id === tplId && !editing), ...(editing ? { borderRadius: '6px 0 0 6px' } : {}) }}>{t.label}</button>
              {editing && (
                <button type="button" aria-label={`Delete ${t.label}`} onClick={() => removeTemplate(t.id)} style={{ ...buttonSecondary, minHeight: '40px', padding: '0 12px', borderRadius: '0 6px 6px 0', borderLeft: 'none', color: colors.danger }}>{'×'}</button>
              )}
            </span>
          ))}
          {!templates.length && <span style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim }}>None saved. Type a message below and tap “Save as quick message”.</span>}
        </div>

        {needDay && (
          <>
            <p style={small}>Which day?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {days.map((d) => <button key={d.key} type="button" onClick={() => setDayKey(d.key)} style={chipStyle(d.key === dayKey)}>{d.label}</button>)}
            </div>
          </>
        )}
        {needTime && (
          <>
            <p style={small}>What time?</p>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '14px' }} />
          </>
        )}

        <textarea dir="rtl" rows={3} autoFocus={!tpl} placeholder="מה להודיע?" value={he}
          onChange={(e) => { setHe(e.target.value); setEdited(true); }}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontSize: '20px', textAlign: 'right', marginBottom: '8px' }} />
        {showEn ? (
          <input type="text" placeholder="English (optional)" value={en}
            onChange={(e) => { setEn(e.target.value); setEdited(true); }}
            style={{ ...inputStyle, width: '100%', marginBottom: '14px' }} />
        ) : (
          <button type="button" onClick={() => setShowEn(true)} style={{ background: 'transparent', border: 'none', color: colors.dim, fontFamily: adminFonts.englishBody, fontSize: '13px', cursor: 'pointer', padding: '4px 0 14px', textDecoration: 'underline' }}>+ Add English</button>
        )}

        <p style={small}>When?</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: weekly ? '10px' : '14px' }}>
          <button type="button" onClick={() => setWeekly(false)} style={chipStyle(!weekly)}>Just once</button>
          <button type="button" onClick={() => setWeekly(true)} style={chipStyle(weekly)}>Every week</button>
        </div>
        {weekly ? (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
              {WEEK.map((w) => (
                <button key={w} type="button" onClick={() => setWeekDays((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]))} style={chipStyle(weekDays.includes(w))}>{w}</button>
              ))}
            </div>
            <p style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, margin: '0 0 14px' }}>Shows all day on the days you pick, every week, until you remove it.</p>
          </>
        ) : (
          <>
            <p style={small}>How long should it show?</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
              {durations.map((d) => <button key={d.key} type="button" onClick={() => setDurationKey(d.key)} style={chipStyle(d.key === activeDuration)}>{d.label}</button>)}
            </div>
          </>
        )}

        {isNew && (he.trim() || en.trim()) && (
          naming === null ? (
            <button type="button" onClick={() => setNaming('')} style={{ background: 'transparent', border: 'none', color: colors.gold, fontFamily: adminFonts.englishBody, fontSize: '14px', cursor: 'pointer', padding: '0 0 14px', textDecoration: 'underline' }}>Save as quick message</button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input autoFocus type="text" maxLength={40} placeholder="Name it (e.g. Assembly)" value={naming} onChange={(e) => setNaming(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={saveAsTemplate} style={{ ...buttonSecondary, minHeight: '44px' }}>Save</button>
              <button type="button" onClick={() => setNaming(null)} style={{ ...buttonSecondary, minHeight: '44px' }}>{'×'}</button>
            </div>
          )
        )}

        {error && <div style={{ color: colors.danger, fontFamily: adminFonts.englishBody, fontSize: '13px', marginBottom: '10px' }}>{error}</div>}
        <button type="button" onClick={submit} disabled={!ready || saving} style={{ ...buttonPrimary, width: '100%', minHeight: '48px', fontSize: '16px', opacity: !ready || saving ? 0.6 : 1 }}>
          {saving ? 'Posting…' : 'Post to screen'}
        </button>
      </div>
    </div>
  );
}
