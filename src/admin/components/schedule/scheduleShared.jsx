/**
 * Small building blocks for the Schedule-by-date admin: API calls, clipboard
 * (with an iOS-safe select-all fallback), a typeable time field, a category
 * chip with inline "+ New category", and a snackbar with Undo.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '../../hooks/useAdminState.js';
import { colors, adminFonts, inputStyle, buttonPrimary, buttonSecondary } from '../../styles/admin-tokens.js';
import useIsMobile from '../../hooks/useIsMobile.js';
import { parseTimeRange, formatTime12 } from '../../../shared/schedulePaste.js';

// ── API ────────────────────────────────────────────────────────────────────

const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });

export const scheduleApi = {
  getDates: (from, to) => apiFetch(`/api/schedule/dates?from=${from || ''}&to=${to || ''}`),
  preview: (text) => apiFetch('/api/schedule/dates/preview', json('POST', { text })),
  apply: (text) => apiFetch('/api/schedule/dates', json('PUT', { text })),
  saveDate: (date, entries, label) => apiFetch(`/api/schedule/dates/${date}`, json('PUT', { entries, label })),
  revertDate: (date) => apiFetch(`/api/schedule/dates/${date}`, { method: 'DELETE' }),
  applyBlock: (date, blockId) => apiFetch(`/api/schedule/dates/${date}/apply-block`, json('POST', { blockId })),
  getBlocks: () => apiFetch('/api/schedule/blocks'),
  createBlock: (name, entries, label) => apiFetch('/api/schedule/blocks', json('POST', { name, entries, label })),
  updateBlock: (id, data) => apiFetch(`/api/schedule/blocks/${id}`, json('PUT', data)),
  deleteBlock: (id) => apiFetch(`/api/schedule/blocks/${id}`, { method: 'DELETE' }),
  weeklyPreview: (text) => apiFetch('/api/schedule/weekly/preview', json('POST', { text })),
  weeklyApply: (text) => apiFetch('/api/schedule/weekly', json('PUT', { text })),
  zmanim: (dates) => apiFetch(`/api/schedule/zmanim?dates=${dates.join(',')}`),
};

// ── Clipboard ──────────────────────────────────────────────────────────────

/**
 * Copy synchronously inside the click handler (iOS Safari only allows copy
 * during the user gesture). navigator.clipboard needs a secure context
 * (https / the Cloudflare tunnel); over plain-http LAN we use
 * execCommand('copy'). If both fail, the caller shows CopyFallbackModal.
 * @returns {Promise<boolean>}
 */
export function copyText(text) {
  const legacy = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px' });
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacy());
  }
  return Promise.resolve(legacy());
}

/** "Copy this text" sheet — the last-resort fallback (select-all textarea). */
export function CopyFallbackModal({ title, text, onClose }) {
  const ref = useRef(null);
  const selectAll = () => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
  };
  useEffect(() => {
    selectAll();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div role="presentation" onClick={onClose} style={overlayStyle}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={sheetStyle}>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '16px', fontWeight: 600, color: colors.text, marginBottom: '6px' }}>
          {title}
        </div>
        <div style={{ fontFamily: adminFonts.englishBody, fontSize: '13px', color: colors.dim, marginBottom: '10px' }}>
          Your browser blocked automatic copying. The text is selected below — tap and hold, then <b>Copy</b>.
        </div>
        <textarea
          ref={ref}
          readOnly
          value={text}
          onFocus={selectAll}
          style={{ ...inputStyle, ...monoStyle, height: '50vh', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
          <button type="button" style={buttonSecondary} onClick={selectAll}>Select all</button>
          <button type="button" style={buttonPrimary} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** Hook: copy(text, label) with toast feedback and the modal fallback. */
export function useCopy(notify) {
  const [fallback, setFallback] = useState(null);
  const copy = useCallback((text, label = 'Copied') => {
    copyText(text).then((ok) => {
      if (ok) notify?.(`${label} — paste it anywhere.`, 'success');
      else setFallback({ title: label, text });
    });
  }, [notify]);
  const modal = fallback ? <CopyFallbackModal title={fallback.title} text={fallback.text} onClose={() => setFallback(null)} /> : null;
  return { copy, modal };
}

// ── Styles ─────────────────────────────────────────────────────────────────

export const monoStyle = {
  fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: '13px',
  lineHeight: 1.55,
  unicodeBidi: 'plaintext',
};

export const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(10,8,5,0.65)', zIndex: 9999,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
};

export const sheetStyle = {
  background: colors.bg, border: `1px solid ${colors.goldBd}`, borderRadius: '10px',
  padding: '18px', width: '100%', maxWidth: '640px', boxShadow: '0 20px 60px rgba(0,0,0,.55)',
};

export const smallButton = {
  ...buttonSecondary,
  padding: '6px 12px',
  fontSize: '13px',
  minHeight: '36px',
  fontFamily: adminFonts.englishBody,
};

export const chipButton = (active) => ({
  ...buttonSecondary,
  padding: '6px 12px',
  minHeight: '36px',
  fontSize: '13px',
  fontFamily: adminFonts.englishBody,
  background: active ? colors.goldBg : 'transparent',
  borderColor: active ? colors.gold : colors.border,
  color: active ? colors.gold : colors.text,
});

export const sectionLabel = {
  fontFamily: adminFonts.englishBody,
  fontSize: '12px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: colors.dim,
};

// ── Typeable time field ────────────────────────────────────────────────────

/**
 * Text field for a time: type "7:05 pm", "19:05", "7pm" — no iOS wheel.
 * Commits "HH:MM" (or '' when cleared, if allowEmpty) on blur/Enter; shows
 * the normalized 12-hour time when not focused. Invalid text stays visible
 * with a red border so nothing is silently dropped.
 */
export function TimeField({ value, onCommit, placeholder = '7:05 PM', allowEmpty = false, ariaLabel, style, autoFocus }) {
  const [draft, setDraft] = useState(null);
  const [bad, setBad] = useState(false);
  const shown = draft ?? (value ? formatTime12(value) : '');
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (!t) {
      if (allowEmpty) { onCommit(''); setBad(false); setDraft(null); } else setBad(true);
      return;
    }
    const r = parseTimeRange(t);
    if (r.error || r.endTime) { setBad(true); return; }
    setBad(false);
    setDraft(null);
    if (r.time !== value) onCommit(r.time);
  };
  return (
    <input
      type="text"
      inputMode="text"
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      enterKeyHint="done"
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      title={bad ? 'Couldn\'t read this time — try 7:05 PM or 19:05' : undefined}
      placeholder={placeholder}
      value={shown}
      autoFocus={autoFocus}
      onFocus={(e) => { setDraft(shown); e.target.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setDraft(null); setBad(false); e.currentTarget.blur(); }
      }}
      style={{
        ...inputStyle,
        fontFamily: adminFonts.englishBody,
        padding: '8px 8px',
        borderColor: bad ? colors.danger : colors.border,
        background: bad ? colors.dangerBg : inputStyle.background,
        ...style,
      }}
    />
  );
}

// ── Category chip + picker with inline "+ New category" ────────────────────

export function CategoryDot({ color, size = 10 }) {
  return <span style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color || colors.muted, flexShrink: 0 }} />;
}

/**
 * Tap the chip → list of categories + "+ New category" (type a name, Add).
 * onCreate(name) must resolve to the created category (or null).
 * On phones it opens as a bottom sheet; on desktop as a dropdown.
 */
export function CategoryPicker({ value, categories, onChange, onCreate, isNew = false }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);
  const cat = categories.find((c) => c.id === value);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, isMobile]);

  const close = () => { setOpen(false); setAdding(false); setName(''); };
  const create = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(n);
      if (created) { onChange(created.id); close(); }
    } finally {
      setBusy(false);
    }
  };

  const list = (
    <div role="listbox" aria-label="Category" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <button type="button" role="option" aria-selected={!value} onClick={() => { onChange(''); close(); }} style={optionStyle(!value)}>
        <CategoryDot color="transparent" /> <span style={{ color: colors.dim }}>No category</span>
      </button>
      {categories.map((c) => (
        <button key={c.id} type="button" role="option" aria-selected={c.id === value} onClick={() => { onChange(c.id); close(); }} style={optionStyle(c.id === value)}>
          <CategoryDot color={c.color} /> {c.name}
        </button>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: '6px', padding: '6px 4px 2px' }}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape') setAdding(false); }}
            placeholder="New category name"
            aria-label="New category name"
            style={{ ...inputStyle, fontFamily: adminFonts.englishBody }}
          />
          <button type="button" onClick={create} disabled={!name.trim() || busy} style={{ ...buttonPrimary, padding: '6px 14px', opacity: name.trim() ? 1 : 0.5 }}>
            {busy ? '…' : 'Add'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ ...optionStyle(false), color: colors.gold }}>
          + New category
        </button>
      )}
    </div>
  );

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...buttonSecondary,
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '5px 10px', minHeight: '34px', fontSize: '13px',
          fontFamily: adminFonts.englishBody,
          borderColor: cat ? `${cat.color}99` : colors.border,
          background: cat ? `${cat.color}1f` : 'transparent',
          maxWidth: '170px',
        }}
      >
        <CategoryDot color={cat?.color} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cat ? cat.name : value ? value : 'Category'}
        </span>
        {isNew && <span style={{ fontSize: '10px', color: colors.gold }}>new</span>}
        <span aria-hidden style={{ fontSize: '10px', color: colors.dim }}>▾</span>
      </button>
      {open && !isMobile && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: '220px',
          background: colors.panel, border: `1px solid ${colors.goldBd}`, borderRadius: '8px', padding: '6px',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)', maxHeight: '320px', overflowY: 'auto',
        }}>
          {list}
        </div>
      )}
      {open && isMobile && (
        <div role="presentation" onClick={close} style={{ ...overlayStyle, alignItems: 'flex-end', padding: 0 }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: '100%', background: colors.panel, borderTop: `1px solid ${colors.goldBd}`,
            borderRadius: '14px 14px 0 0', padding: '14px 12px calc(14px + env(safe-area-inset-bottom))',
            maxHeight: '75vh', overflowY: 'auto',
          }}>
            <div style={{ ...sectionLabel, margin: '0 4px 8px' }}>Category</div>
            {list}
          </div>
        </div>
      )}
    </div>
  );
}

const optionStyle = (active) => ({
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
  background: active ? colors.goldBg : 'transparent', border: 'none', borderRadius: '6px',
  padding: '10px 10px', minHeight: '40px', cursor: 'pointer', color: colors.text,
  fontFamily: adminFonts.englishBody, fontSize: '14px',
});

// ── Snackbar (messages + Undo) ─────────────────────────────────────────────

/** One message at a time, bottom-center; { text, type, action: {label, onClick} }. */
export function useSnackbar() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, type = 'success', action = null, ms = 5000) => {
    clearTimeout(timer.current);
    setMsg({ text, type, action, id: Date.now() });
    timer.current = setTimeout(() => setMsg(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = msg ? (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', left: '50%', transform: 'translateX(-50%)',
      bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 10000,
      background: msg.type === 'error' ? '#3a1414' : colors.panel,
      border: `1px solid ${msg.type === 'error' ? colors.danger : colors.goldBd}`,
      color: colors.text, borderRadius: '10px', padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: '14px',
      boxShadow: '0 10px 30px rgba(0,0,0,.45)', maxWidth: 'calc(100vw - 24px)',
      fontFamily: adminFonts.englishBody, fontSize: '14px',
    }}>
      <span style={{ whiteSpace: 'pre-line' }}>{msg.text}</span>
      {msg.action && (
        <button type="button" onClick={() => { msg.action.onClick(); setMsg(null); }} style={{
          background: 'transparent', border: 'none', color: colors.gold, fontWeight: 700,
          fontFamily: adminFonts.englishBody, fontSize: '14px', cursor: 'pointer', padding: '6px 4px', minHeight: '36px',
        }}>
          {msg.action.label}
        </button>
      )}
    </div>
  ) : null;
  return { show, node };
}
